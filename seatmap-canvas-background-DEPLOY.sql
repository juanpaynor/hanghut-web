-- DEPLOY: the app's seat map RPC returns the backdrop colour.
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- THE SAME GAP AS THE FIVE SECTION FIELDS. get_event_seat_geometry (web) has
-- returned 'canvas_background' since the backdrop feature shipped;
-- get_event_seat_map (the app) never got it. We built a feature for our own
-- renderer and left the other surface drawing white.
--
-- It is a COLOUR, not an image. canvas_data->>'canvasBackground' is a hex
-- string, validated client-side against ^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$
-- (canvas-state.ts, SET_CANVAS_BACKGROUND). Seat maps have no background-image
-- feature at all, so nothing else of this kind is owed to the app.
--
-- Purely additive. 19 maps carry canvas_data, 2 have the key, exactly 1 has a
-- real value ('#2d2324' on the hidden "Monarch Manila Seat Map Example'). NULL
-- means "the white the picker already draws", so an app build that ignores the
-- field is unaffected, and so is web (which reads its own RPC).
--
-- Expression and placement copied verbatim from get_event_seat_geometry: two
-- RPCs answering the same question differently will drift.
--
-- ROLLBACK: delete the single 'canvas_background' line and re-run.

BEGIN;

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
    -- The organizer's backdrop colour. NULL on every existing map = the white
    -- the picker already draws.
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
VALUES ('20261115110000', 'seat_map_rpc_returns_canvas_background')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY (read-only). Expect has_canvas_background = true, and the Monarch
-- map to come back as '#2d2324' while TRESPASSING comes back NULL.
-- Note the ::jsonb cast -- the ? operator does not exist for plain json.
-- ===========================================================================
SELECT (get_event_seat_map(m.event_id)::jsonb) ? 'canvas_background' AS has_canvas_background,
       get_event_seat_map(m.event_id)->>'canvas_background'          AS value,
       e.title
  FROM event_seat_maps m
  JOIN events e ON e.id = m.event_id
 WHERE e.title IN ('Monarch Manila Seat Map Example', 'TRESPASSING SA MUSIC MUSEUM')
 ORDER BY e.title;
