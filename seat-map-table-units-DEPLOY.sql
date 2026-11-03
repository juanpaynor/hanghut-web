-- ============================================================================
-- Seat map Phase 2 — table units + per-section seat shape
-- ============================================================================
-- Run this in the Supabase SQL editor (prod, rahhezqtkpvkialnduft).
--
-- ⚠️  ORDERING MATTERS. RUN THIS **BEFORE** PUSHING THE FRONTEND.
--
-- src/lib/seat-map/sync-live.ts upserts an explicit column list into
-- event_sections. Once the frontend carries seat_shape and unit_capacity in that
-- list, a database without these columns rejects the upsert outright --
-- "column ... does not exist" -- and EVERY seat map save fails, for every
-- organizer. This file is additive and harmless on its own, so running it early
-- costs nothing and running it late breaks saves.
--
-- WHAT THIS ADDS
-- --------------
-- 1. event_sections.unit_capacity -- how many PEOPLE one sold unit admits.
--    This is the club/table case: "VIP COUCH 1 · admits 8". It is purely
--    informational. It gates nothing, is never used to compute availability,
--    and cannot oversell: inventory is still one seat row, protected by the
--    same seat_holds machinery that already works. It exists so the buyer knows
--    how many fit and the door knows how many to let in.
--
--    Today that information does not exist anywhere. "Hanghut Launch Party X
--    THC" sold 6 VIP couches as 11 one-seat sections, and nothing recorded that
--    a couch seats four to six -- so the door was guessing.
--
-- 2. event_sections.seat_shape -- per-section override of canvas_data.seatShape,
--    which is global (one shape for a whole venue). NULL means "inherit the
--    global", so every existing section keeps rendering exactly as it does now.
--
-- SAFETY
-- ------
-- Both columns are nullable with no default and no constraint beyond a sanity
-- check on the shape vocabulary. Nothing reads them until the frontend ships.
-- No existing row changes. No index needed -- these are read with the section
-- row, never filtered on.
-- ============================================================================

BEGIN;

ALTER TABLE public.event_sections
    ADD COLUMN IF NOT EXISTS unit_capacity integer,
    ADD COLUMN IF NOT EXISTS seat_shape    text;

COMMENT ON COLUMN public.event_sections.unit_capacity IS
  'How many people one sold unit admits (club table / booth / box). Informational only: never used for availability or pricing. NULL = an ordinary seated section, one person per seat.';

COMMENT ON COLUMN public.event_sections.seat_shape IS
  'Per-section override of canvas_data.seatShape. NULL = inherit the map-wide shape. One of circle | square | diamond.';

-- Vocabulary guard. NOT NULL is deliberately absent: NULL is the inherit case
-- and must stay legal. Written as NOT VALID so the ALTER cannot fail on any
-- pre-existing row -- there are none, but a validating constraint on a live
-- table is a needless risk.
ALTER TABLE public.event_sections
    DROP CONSTRAINT IF EXISTS event_sections_seat_shape_check;
ALTER TABLE public.event_sections
    ADD CONSTRAINT event_sections_seat_shape_check
    CHECK (seat_shape IS NULL OR seat_shape IN ('circle', 'square', 'diamond'))
    NOT VALID;

-- A unit that admits zero or negative people is a data error, not a choice.
ALTER TABLE public.event_sections
    DROP CONSTRAINT IF EXISTS event_sections_unit_capacity_check;
ALTER TABLE public.event_sections
    ADD CONSTRAINT event_sections_unit_capacity_check
    CHECK (unit_capacity IS NULL OR unit_capacity > 0)
    NOT VALID;


-- ── Geometry payload: hand both fields to the buyer's picker ────────────────
-- Replaces get_event_seat_geometry. Only the two 'sections' keys at the end are
-- new; everything else is byte-identical to the live definition, so a buyer
-- mid-checkout sees no change.
--
-- Keep this in lock-step with src/lib/seat-map/preview-bundle.ts, which mirrors
-- these shapes so the organizer's preview is the real picker. If they drift, the
-- preview starts lying about what buyers see.
CREATE OR REPLACE FUNCTION public.get_event_seat_geometry(p_event_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    'version', (
      SELECT extract(epoch FROM GREATEST(
        m.updated_at,
        COALESCE(
          (SELECT max(t.updated_at) FROM ticket_tiers t
            WHERE t.event_id = p_event_id AND t.is_active = true),
          m.updated_at
        )
      ))::bigint
      FROM event_seat_maps m WHERE m.event_id = p_event_id
    ),
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
        'rows', CASE WHEN sec.show_row_labels THEN COALESCE(sec.rows, '[]'::jsonb) ELSE '[]'::jsonb END,
        'show_row_labels', sec.show_row_labels,
        'sales_mode', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM seats s WHERE s.section_id = sec.id
          ) THEN 'ga'
          ELSE 'seated'
        END,
        'seat_count', (SELECT count(*) FROM seats s WHERE s.section_id = sec.id),
        -- NEW in Phase 2. Both NULL on every existing section, which the picker
        -- reads as "behave exactly as before".
        'unit_capacity', sec.unit_capacity,
        'seat_shape', sec.seat_shape
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

-- Ledger row — hand-written because the prod ledger is squashed to one baseline.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102120000', 'seat_map_table_units')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- VERIFY  (run after COMMIT)
-- ============================================================================

-- VERIFY 1 — the columns exist and are nullable. Expect 2 rows, both YES.
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='event_sections'
--    and column_name in ('unit_capacity','seat_shape');

-- VERIFY 2 — THIS IS THE ONE THAT MATTERS.
-- The geometry RPC must still answer correctly for a LIVE, SELLING event, with
-- the two new keys present and null. If this returns nothing, or errors, a
-- buyer mid-checkout is looking at a broken map — roll back immediately.
--
-- NOTE: this takes an EVENT id, not a seat map id. The first draft of this file
-- had event_seat_maps.id here, which made the RPC correctly return NULL for "no
-- map on that event" and looked exactly like the failure this check is meant to
-- catch. Verified 2026-11-02: both live maps answer correctly.
--
-- select jsonb_pretty(
--          (public.get_event_seat_geometry('932bd447-a2ed-4137-9ed4-d2729ec20f76')::jsonb)
--            #> '{sections,0}'
--        );
--   -- TRESPASSING SA MUSIC MUSEUM (active, 30 sold, 718 seats).
--   -- Expect the usual keys plus "unit_capacity": null and "seat_shape": null.
--
-- Stronger version — asserts the new keys are present and null on EVERY section
-- of both live events. Expect have_new_keys == sections, non_null == 0.
--
-- select e.title,
--        jsonb_array_length(g.geo->'sections') as sections,
--        (select count(*) from jsonb_array_elements(g.geo->'sections') s
--          where s.value ? 'unit_capacity' and s.value ? 'seat_shape') as have_new_keys,
--        (select count(*) from jsonb_array_elements(g.geo->'sections') s
--          where s.value->>'unit_capacity' is not null
--             or s.value->>'seat_shape' is not null) as non_null
--   from public.events e
--   cross join lateral (select public.get_event_seat_geometry(e.id)::jsonb as geo) g
--  where e.id in ('932bd447-a2ed-4137-9ed4-d2729ec20f76',   -- TRESPASSING
--                 'fcd12279-0ee8-42a9-b783-05a10e957bb2')   -- Hex Fest 2026
--    and g.geo is not null;

-- VERIFY 3 — no section anywhere was altered. Expect 0 and 0.
--
-- select count(*) filter (where unit_capacity is not null) as with_capacity,
--        count(*) filter (where seat_shape is not null)    as with_shape
--   from public.event_sections;

-- VERIFY 4 — the constraints reject nonsense. Both should RAISE.
--
-- begin;
--   update public.event_sections set seat_shape = 'hexagon'
--    where id = (select id from public.event_sections limit 1);   -- must fail
-- rollback;
-- begin;
--   update public.event_sections set unit_capacity = 0
--    where id = (select id from public.event_sections limit 1);   -- must fail
-- rollback;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Dropping the columns is safe ONLY while no deployed frontend writes them --
-- i.e. before the push, or after reverting it. Dropping them under a frontend
-- that sends them in the sync-live upsert breaks every seat map save.
--
-- To restore the previous RPC, re-run the definition above WITHOUT the
-- 'unit_capacity' and 'seat_shape' keys in the sections object. The RPC is the
-- part a buyer touches, so revert it first and drop columns second.
--
-- ALTER TABLE public.event_sections
--     DROP CONSTRAINT IF EXISTS event_sections_seat_shape_check,
--     DROP CONSTRAINT IF EXISTS event_sections_unit_capacity_check;
-- ALTER TABLE public.event_sections
--     DROP COLUMN IF EXISTS unit_capacity,
--     DROP COLUMN IF EXISTS seat_shape;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261102120000';
