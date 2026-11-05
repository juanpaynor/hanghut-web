-- ════════════════════════════════════════════════════════════════════════════
-- CHAIR FACING, THE APP PATH — put `facing` on get_event_seat_map too
--
-- NOT YET APPLIED. For review. One transaction, one added line.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
--
-- chair-facing-DEPLOY.sql added `seats.facing` and put it on
-- get_event_section_seats. That is the WEB path: the browser picker loads
-- geometry once (get_event_seat_geometry), then seats per section
-- (get_event_section_seats), then status on a poll (get_event_seat_status).
--
-- It missed the other renderer. `get_event_seat_map` is the single-call RPC
-- the FLUTTER APP still consumes -- see the note at
-- src/components/events/seat-map-picker.tsx:19. It returns per-seat id, row,
-- seat, label, x, y, tier_id and status, and NO facing.
--
-- So a chair the organizer turns by hand draws correctly on the website and
-- points at the stage in the app. That is precisely the bug this codebase
-- already carries a warning about for the seat SHAPE -- the editor offered
-- circle/square/diamond for months while the picker hardcoded a circle -- and
-- src/lib/seat-map/seat-shape.ts exists because of it. Same mistake, new
-- column.
--
-- ── Blast radius ───────────────────────────────────────────────────────────
--
-- Verified on prod 2026-11-05:
--   - 0 event_sections use seat_shape = 'chair'
--   - 0 seats have a non-null `facing`
-- So there is nothing to render wrong today, and nothing to render
-- differently after this. It adds ONE key to a JSON object. Every existing
-- consumer reads the keys it wants by name; an added key is ignored.
--
-- The one thing to tell the app team: `facing` is now on the wire, in degrees
-- clockwise with 0 = up, and NULL means "work it out" (face the table this
-- seat rings, the room if it stands on the stage, otherwise the stage). The
-- derivation lives in src/lib/seat-map/chair.ts. Until the app reads it, the
-- app keeps doing exactly what it does now.
--
-- ── What is NOT changed, deliberately ──────────────────────────────────────
--
-- This function is SECURITY DEFINER with no `SET search_path`, which is worth
-- fixing and is not fixed here. Mixing a hardening change into a one-line
-- feature change is how one careful edit becomes two risky ones. The body
-- below is byte-for-byte the definition captured from prod today, plus the
-- single `'facing', s.facing` line.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.get_event_seat_map(p_event_id uuid)
 returns json
 language sql
 stable security definer
as $function$
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

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--
-- Expect: has_facing true, overloads 1, anon_can_execute true (unchanged),
-- and a real event's map still returns its sections and seats.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='get_event_seat_map')                      as overloads,
  (select pg_get_functiondef(p.oid) ilike '%''facing'', s.facing%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_event_seat_map')                      as has_facing,
  has_function_privilege('anon','public.get_event_seat_map(uuid)','EXECUTE')          as anon_can_execute,
  (select json_array_length((public.get_event_seat_map(e.id)->>'sections')::json)
     from public.events e
    where exists (select 1 from public.event_seat_maps m where m.event_id = e.id)
    limit 1)                                                                          as sections_on_a_real_map;

-- STOP if overloads <> 1, has_facing is false, anon_can_execute is false, or
-- sections_on_a_real_map is null (the map stopped returning sections).


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only AFTER the verify reads clean.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105190000', 'chair_facing_app_path');
--
-- ROLLBACK
--   Restore the definition above with the `'facing', s.facing` line removed.
--   It is kept verbatim in rollback/get_event_seat_map_before_facing.sql.
--
-- TELL THE APP TEAM (team_comms): get_event_seat_map now returns `facing` on
-- every seat. Degrees clockwise, 0 = up, NULL = derive it. Only the 'chair'
-- seat shape draws a direction; nothing uses it yet.
-- ════════════════════════════════════════════════════════════════════════════
