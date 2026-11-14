-- DEPLOY: seat map version stops bumping on every sale, + the five section
-- styling fields for the app's RPC.
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- Answers team_comms #377 (asks 1 and 4) and #378/#379.
--
-- ⚠ READ THE FREEZE NOTE AT THE BOTTOM BEFORE RUNNING.
--
-- ===========================================================================
-- PROBLEM 1 — A SALE LOOKED IDENTICAL TO A REPUBLISH
-- ===========================================================================
-- get_event_seat_status.version was
--     GREATEST(event_seat_maps.updated_at, max(ticket_tiers.updated_at))
-- and ticket_tiers_touch_updated_at fires on ANY change
-- (WHEN old.* IS DISTINCT FROM new.*). update_tier_quantity_sold rewrites
-- quantity_sold on every sale, so the tier timestamp moves, so version moves.
--
-- Both pickers refetch the FULL map when version changes. Measured on prod
-- against TRESPASSING SA MUSIC MUSEUM: get_event_seat_map 1689 kB vs a 15 kB
-- status snapshot. Every sale made every open picker throw away its map and
-- pull 1.69 MB again, on phones, on mobile data, at peak concurrency.
--
-- ⚠ WHY CHANGE `version` IN PLACE rather than add a new field: neither client
-- needs the big payload for availability. The status snapshot already carries
-- `taken`, per-section `available_count`, `largest_block` and `by_tier`, and
-- BOTH pickers already merge seat state from it (web: the takenMap merge in
-- seat-map-picker.tsx; app: by their own account in #377). A version that no
-- longer moves on a sale costs neither client accuracy — it only stops a
-- download nobody needed. A NEW field would have fixed nothing until the app
-- shipped Dart, and they have said that work is not scheduled.
--
-- THE FIX: a second timestamp on ticket_tiers that ignores inventory churn.
-- Only `quantity_sold` is excluded — it is the one column the sale path writes
-- (update_tier_quantity_sold does `SET quantity_sold = v_sold_count` and
-- nothing else). quantity_total is NOT excluded: an organizer changing capacity
-- is a real, rare edit. Anything else, including columns added later, counts as
-- structural by default, which is the safe direction to fail.
--
-- ⚠ THE is_active FILTER IS DELIBERATELY DROPPED from the version computation.
-- The old expression only looked at ACTIVE tiers, so DEACTIVATING a tier made
-- it leave the set and the version could stand still or go BACKWARDS — a
-- structural change invisible to every picker. Version now considers every tier
-- on the event. The `tiers` payload itself still filters is_active, unchanged.
--
-- ===========================================================================
-- PROBLEM 2 — THE APP'S RPC NEVER GOT THE FIVE STYLING FIELDS
-- ===========================================================================
-- get_event_seat_geometry (web) already returns unit_capacity, seat_shape,
-- chair_scale, label_offset and label_font_size. get_event_seat_map (the app)
-- returns NONE of them, so the same section renders differently on the two
-- surfaces. 238 sections exist, 30 carry a chair_scale and 16 of those are
-- exactly 0 (chairs off) — no longer hypothetical, though every affected
-- section is on a hidden event with no sales.
--
-- Field names, order and NULL semantics are copied verbatim from
-- get_event_seat_geometry so the two RPCs cannot drift.
--
-- ROLLBACK
--   1. DROP TRIGGER ticket_tiers_touch_structure_updated_at ON public.ticket_tiers;
--      DROP FUNCTION public.touch_tier_structure_updated_at();
--      ALTER TABLE public.ticket_tiers DROP COLUMN structure_updated_at;
--   2. Restore the previous get_event_seat_status / get_event_seat_map bodies,
--      which are in the migration that precedes this one.
--   Dropping the column alone will BREAK get_event_seat_status — revert the
--   function first, or in the same transaction.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A STRUCTURAL TIMESTAMP THAT A SALE DOES NOT MOVE
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_tiers
    ADD COLUMN IF NOT EXISTS structure_updated_at timestamptz;

-- Seed from updated_at rather than from now(): a tier last edited in October
-- should look like October, otherwise the first run makes every event look
-- freshly republished to every open picker.
--
-- ⚠ THE TRIGGER IS DISABLED FOR THE BACKFILL, AND THAT IS NOT OPTIONAL.
-- ticket_tiers_touch_updated_at fires on ANY update and sets updated_at = now().
-- A plain backfill would therefore rewrite updated_at on EVERY tier on the
-- platform, destroying the real "last edited" timestamp we are copying FROM --
-- and we would be seeding the new column from a value we had just corrupted on
-- the rows processed after it. Disable, backfill, re-enable, all inside this
-- transaction so no concurrent write can slip through ungated.
ALTER TABLE public.ticket_tiers DISABLE TRIGGER ticket_tiers_touch_updated_at;
UPDATE public.ticket_tiers SET structure_updated_at = updated_at
 WHERE structure_updated_at IS NULL;
ALTER TABLE public.ticket_tiers ENABLE TRIGGER ticket_tiers_touch_updated_at;

ALTER TABLE public.ticket_tiers
    ALTER COLUMN structure_updated_at SET DEFAULT now(),
    ALTER COLUMN structure_updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_tier_structure_updated_at()
RETURNS trigger
 LANGUAGE plpgsql
AS $fn$
BEGIN
    -- Compare the whole row MINUS the columns a sale writes. Using to_jsonb
    -- rather than naming every structural column means a column added next year
    -- is treated as structural automatically; forgetting to list it here would
    -- otherwise make its edits silently invisible to both pickers.
    IF (to_jsonb(OLD) - 'quantity_sold' - 'updated_at' - 'structure_updated_at')
       IS DISTINCT FROM
       (to_jsonb(NEW) - 'quantity_sold' - 'updated_at' - 'structure_updated_at')
    THEN
        NEW.structure_updated_at := now();
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ticket_tiers_touch_structure_updated_at ON public.ticket_tiers;
CREATE TRIGGER ticket_tiers_touch_structure_updated_at
    BEFORE UPDATE ON public.ticket_tiers
    FOR EACH ROW EXECUTE FUNCTION public.touch_tier_structure_updated_at();

COMMENT ON COLUMN public.ticket_tiers.structure_updated_at IS
    'Last change to anything EXCEPT quantity_sold. Drives get_event_seat_status.version so a ticket sale does not force every open seat picker to re-download the full map (1.69 MB on TRESPASSING). See team_comms #377.';


-- ---------------------------------------------------------------------------
-- 2. get_event_seat_status — structural version, in MICROSECONDS
-- ---------------------------------------------------------------------------
-- Microseconds answers #377 ask 4: epoch SECONDS truncate, so a republish and a
-- correction inside the same second were indistinguishable and a client could
-- miss the second one forever. 1.79e15 fits a bigint and a JS number (< 2^53).
-- Clients compare for inequality only, so the one-off magnitude jump costs at
-- most a single extra refetch.
CREATE OR REPLACE FUNCTION public.get_event_seat_status(p_event_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH on_sale AS (
    SELECT t.id FROM ticket_tiers t
    WHERE t.event_id = p_event_id AND t.is_active IS DISTINCT FROM false
      AND (t.sales_start IS NULL OR t.sales_start <= now())
      AND (t.sales_end   IS NULL OR t.sales_end   >= now())
  )
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    -- STRUCTURE ONLY. A sale moves ticket_tiers.updated_at but NOT
    -- structure_updated_at, so it no longer invalidates the map. Availability
    -- reaches the clients through `taken` and `sections` below, which is what
    -- they already merge. No is_active filter here on purpose: deactivating a
    -- tier is a structural change and must still move the number.
    'version', (
      SELECT (extract(epoch FROM GREATEST(
        m.updated_at,
        COALESCE(
          (SELECT max(t.structure_updated_at) FROM ticket_tiers t
            WHERE t.event_id = p_event_id),
          m.updated_at
        )
      )) * 1000000)::bigint
      FROM event_seat_maps m WHERE m.event_id = p_event_id
    ),
    'selection_mode', (SELECT seat_selection_mode FROM events WHERE id = p_event_id),
    'max_per_order', (SELECT COALESCE(max_seats_per_order, 10) FROM events WHERE id = p_event_id),
    'taken', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'status', CASE WHEN s.status IN ('booked','disabled') THEN s.status ELSE 'held' END
      )), '[]'::json)
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE sec.event_id = p_event_id AND sec.is_active = true
        AND (
          s.status IN ('booked','disabled')
          OR EXISTS (SELECT 1 FROM seat_holds h WHERE h.seat_id = s.id AND h.expires_at > now())
        )
    ),
    'sections', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', sec.id,
        'available_count', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.section_id = sec.id) THEN (
            CASE WHEN sec.tier_id IN (SELECT id FROM on_sale) THEN (
              SELECT GREATEST(COALESCE(t.quantity_total, 0) - COALESCE(t.quantity_sold, 0), 0)
              FROM ticket_tiers t WHERE t.id = sec.tier_id
            ) ELSE 0 END
          )
          ELSE COALESCE(b.avail, 0)
        END,
        'largest_block', COALESCE(b.largest, 0),
        'by_tier', COALESCE(b.by_tier, '[]'::json),
        'on_sale', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.section_id = sec.id)
            THEN sec.tier_id IN (SELECT id FROM on_sale)
          ELSE COALESCE(b.any_on_sale, false)
        END
      )), '[]'::json)
      FROM event_sections sec
      LEFT JOIN LATERAL (
        SELECT sum(x.available_count) FILTER (WHERE x.tier_id IN (SELECT id FROM on_sale)) AS avail,
               max(x.largest_block)   FILTER (WHERE x.tier_id IN (SELECT id FROM on_sale)) AS largest,
               bool_or(x.tier_id IN (SELECT id FROM on_sale)) AS any_on_sale,
               json_agg(json_build_object('tier_id', x.tier_id, 'available_count', x.available_count, 'largest_block', x.largest_block))
                 FILTER (WHERE x.tier_id IN (SELECT id FROM on_sale)) AS by_tier
        FROM section_blocks(sec.id) x WHERE x.tier_id IS NOT NULL
      ) b ON true
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. get_event_seat_map — the five per-section fields (#378/#379)
-- ---------------------------------------------------------------------------
-- Purely additive. All five are NULL on 208 of 238 sections, and NULL means
-- "behave exactly as before" in both renderers, so an app build that ignores
-- them is unaffected.
CREATE OR REPLACE FUNCTION public.get_event_seat_map(p_event_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    'canvas_width', (SELECT canvas_width FROM event_seat_maps WHERE event_id = p_event_id),
    'canvas_height', (SELECT canvas_height FROM event_seat_maps WHERE event_id = p_event_id),
    'seat_radius', (SELECT NULLIF(canvas_data->>'seatRadius','')::numeric FROM event_seat_maps WHERE event_id = p_event_id),
    'seat_shape', (SELECT canvas_data->>'seatShape' FROM event_seat_maps WHERE event_id = p_event_id),
    'background_shapes', (
      SELECT COALESCE(canvas_data->'backgroundShapes', '[]'::jsonb)
      FROM event_seat_maps WHERE event_id = p_event_id
    ),
    'tiers', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'name', t.name,
        'price', t.price,
        'sort_order', t.sort_order
      ) ORDER BY t.sort_order), '[]'::json)
      FROM ticket_tiers t
      WHERE t.event_id = p_event_id AND t.is_active = true
    ),
    'sections', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', sec.id,
        'label', sec.label,
        'color', sec.color,
        'section_type', sec.section_type,
        'polygon_points', sec.polygon_points,
        'tier_id', sec.tier_id,
        'row_tier_overrides', sec.row_tier_overrides,
        'sales_mode', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM seats s WHERE s.section_id = sec.id
          ) THEN 'ga'
          ELSE 'seated'
        END,
        'available_count', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM seats s WHERE s.section_id = sec.id
          ) THEN (
            SELECT GREATEST(COALESCE(t.quantity_total, 0) - COALESCE(t.quantity_sold, 0), 0)
            FROM ticket_tiers t WHERE t.id = sec.tier_id
          )
          ELSE (
            SELECT count(*) FROM seats s
            WHERE s.section_id = sec.id
              AND s.status = 'available'
              AND NOT EXISTS (
                SELECT 1 FROM seat_holds h
                WHERE h.seat_id = s.id AND h.expires_at > now()
              )
          )
        END,
        -- ── The five, identical in name, order and NULL meaning to
        --    get_event_seat_geometry so the app and web cannot drift. ──
        -- A WHOLE TABLE: unit_capacity > 0 AND exactly one inventory seat.
        -- NULL on every ordinary section = "behave exactly as before".
        'unit_capacity', sec.unit_capacity,
        'seat_shape', sec.seat_shape,
        -- Decorative chairs. NULL = default size, 0 = chairs off entirely.
        'chair_scale', sec.chair_scale,
        -- Label nudge. NULL = centred on the polygon centroid.
        'label_offset', sec.label_offset,
        -- Label size. NULL = the 15px default both renderers hardcode today.
        'label_font_size', sec.label_font_size,
        'seats', (
          SELECT COALESCE(json_agg(json_build_object(
            'id', s.id,
            'row', s.row_label,
            'seat', s.seat_number,
            'label', s.label,
            'x', s.x,
            'y', s.y,
            'tier_id', COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id),
            'facing', s.facing,
            'status', CASE
              WHEN s.status IN ('booked', 'disabled') THEN s.status
              WHEN EXISTS (
                SELECT 1 FROM seat_holds h
                WHERE h.seat_id = s.id AND h.expires_at > now()
              ) THEN 'held'
              ELSE 'available'
            END
          ) ORDER BY s.row_label, s.seat_number), '[]'::json)
          FROM seats s WHERE s.section_id = sec.id
        )
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115100000', 'seatmap_version_ignores_sales_plus_section_styling')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1 — a SALE no longer moves the version, a STRUCTURAL edit does.
-- Rolled back, so nothing is kept. Expect: after_sale = same, after_edit = moved.
-- ===========================================================================
DO $$
DECLARE
    v_event uuid := '932bd447-a2ed-4137-9ed4-d2729ec20f76';  -- TRESPASSING
    v_tier  uuid;
    v0 bigint; v1 bigint; v2 bigint;
BEGIN
    SELECT id INTO v_tier FROM ticket_tiers WHERE event_id = v_event LIMIT 1;
    v0 := (get_event_seat_status(v_event)->>'version')::bigint;

    -- simulate the sale path: exactly what update_tier_quantity_sold writes
    UPDATE ticket_tiers SET quantity_sold = quantity_sold WHERE id = v_tier;
    UPDATE ticket_tiers SET quantity_sold = quantity_sold + 1 WHERE id = v_tier;
    v1 := (get_event_seat_status(v_event)->>'version')::bigint;

    -- a real organizer edit
    UPDATE ticket_tiers SET name = name || ' ' WHERE id = v_tier;
    v2 := (get_event_seat_status(v_event)->>'version')::bigint;

    RAISE NOTICE 'baseline=%  after_sale=% (want SAME)  after_edit=% (want BIGGER)', v0, v1, v2;
    IF v1 <> v0 THEN RAISE EXCEPTION 'FAIL: a sale still moved the version'; END IF;
    IF v2 <= v1 THEN RAISE EXCEPTION 'FAIL: a structural edit did NOT move the version'; END IF;
    RAISE NOTICE 'PASS';
    RAISE EXCEPTION 'ROLLING BACK TEST';
END $$;

-- ===========================================================================
-- VERIFY 2 (read-only) — the five fields are present on the app's RPC.
-- Expect all five true.
-- ===========================================================================
SELECT (get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb->'sections'->0) ? 'unit_capacity'   AS has_unit_capacity,
       (get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb->'sections'->0) ? 'seat_shape'      AS has_seat_shape,
       (get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb->'sections'->0) ? 'chair_scale'     AS has_chair_scale,
       (get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb->'sections'->0) ? 'label_offset'    AS has_label_offset,
       (get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb->'sections'->0) ? 'label_font_size' AS has_label_font_size;

-- ===========================================================================
-- VERIFY 3b (read-only) — the backfill did NOT stamp every tier with "now".
-- If the trigger had fired, every row would read today. Expect the oldest to be
-- months back and seeded_from_updated_at to equal the total tier count.
-- ===========================================================================
SELECT count(*) AS tiers,
       count(*) FILTER (WHERE structure_updated_at = updated_at) AS seeded_from_updated_at,
       min(structure_updated_at) AS oldest,
       count(*) FILTER (WHERE structure_updated_at::date = current_date) AS stamped_today
  FROM public.ticket_tiers;

-- ===========================================================================
-- VERIFY 3 (read-only) — payload sizes unchanged in order of magnitude.
-- ===========================================================================
SELECT pg_size_pretty(length(get_event_seat_map('932bd447-a2ed-4137-9ed4-d2729ec20f76')::text)::bigint)    AS full_map,
       pg_size_pretty(length(get_event_seat_status('932bd447-a2ed-4137-9ed4-d2729ec20f76')::text)::bigint) AS light_snapshot;


-- ===========================================================================
-- ⚠ THE FREEZE — READ BEFORE RUNNING
-- ===========================================================================
-- Seat changes are frozen until TRESPASSING SA MUSIC MUSEUM runs on 19 Dec 2026.
--
-- The case FOR running this inside the freeze, which the app team made and
-- which I think is right:
--   * get_event_seat_status and get_event_seat_map are READ-ONLY. Neither can
--     sell, hold or release anything. The frozen path is hold_seat /
--     assign_seats_to_intent / book_seats_for_intent, none of which is touched.
--   * The damage this prevents lands ON 19 December. TRESPASSING is the only
--     active seated event; it has 186 sold, 92 in the last 7 days. Fixing this
--     after the freeze fixes nothing that mattered.
--   * It REDUCES load on the day rather than adding risk.
--
-- The case AGAINST:
--   * It changes what `version` MEANS for a live picker mid-sale, so "no
--     effect" is a claim about client behaviour, not about untouched code.
--   * If either picker secretly depended on the full refetch for availability,
--     seats would look free when they are not. I checked the web one directly
--     (seat-map-picker.tsx merges `taken` from status onto the geometry) and the
--     app stated the same in #377 — but I cannot read their Dart.
--
-- This is the user's call, not mine. VERIFY 1 is the thing to trust: it proves
-- the sale case and the edit case on a real event and rolls itself back.
