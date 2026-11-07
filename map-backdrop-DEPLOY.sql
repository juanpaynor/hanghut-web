-- ============================================================================
-- Map backdrop: one line, no table change.
--
-- The buyer's picker draws the map on a hardcoded white panel. Venues trace a
-- DARK photographed floor plan, and the white edge around it reads as a
-- mistake rather than a choice.
--
-- The setting is map-wide, so it lives in event_seat_maps.canvas_data next to
-- seatRadius and seatShape — which the editor already round-trips whole. So
-- unlike chair_scale, label_offset and label_font_size, this needs NO column,
-- NO constraint and NO lock on event_sections. Just one more key on the wire.
--
-- NULL on every existing map, which the picker reads as "the white you already
-- draw". Nothing live changes until an organizer picks a colour.
-- ============================================================================

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
    -- Backdrop behind the whole map. Lives in canvas_data beside seatRadius
    -- and seatShape, so this needed NO table change at all. NULL on every
    -- existing map = the white the picker already draws.
    'canvas_background', (SELECT canvas_data->>'canvasBackground' FROM event_seat_maps WHERE event_id = p_event_id),
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
        'seat_shape', sec.seat_shape,
        -- Decorative chairs. NULL on every existing section = default size.
        'chair_scale', sec.chair_scale,
        -- Label nudge. NULL on every existing section = centred.
        'label_offset', sec.label_offset,
        -- Label size. NULL on every existing section = the 15px default.
        'label_font_size', sec.label_font_size
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY. All read-only.
-- ─────────────────────────────────────────────────────────────────────────────

-- One copy, still STABLE + DEFINER, and carrying every field added today.
select p.proname, p.pronargs, p.provolatile as s_is_stable, p.prosecdef,
       pg_get_functiondef(p.oid) ilike '%canvas_background%'  as backdrop,
       pg_get_functiondef(p.oid) ilike '%chair_scale%'        as chair_scale,
       pg_get_functiondef(p.oid) ilike '%label_offset%'       as label_offset,
       pg_get_functiondef(p.oid) ilike '%label_font_size%'    as label_font_size,
       (select count(*) from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
         where n2.nspname='public' and p2.proname='get_event_seat_geometry') as copies
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='get_event_seat_geometry';

-- A real call: the key is present and null on every existing map.
select (public.get_event_seat_geometry(m.event_id)::jsonb) ? 'canvas_background' as key_present,
       (public.get_event_seat_geometry(m.event_id)::jsonb)->>'canvas_background' as value_is_null,
       (public.get_event_seat_geometry(m.event_id)::jsonb)->>'seat_radius'       as seat_radius_intact
  from event_seat_maps m
 order by m.updated_at desc
 limit 3;

-- ROLLBACK: re-apply rollback/get_event_seat_geometry_before_backdrop.sql

-- LEDGER
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107160000', 'seat_map_canvas_background')
--   on conflict (version) do nothing;
