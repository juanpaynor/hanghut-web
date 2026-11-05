-- Verbatim pg_get_functiondef output, captured from PRODUCTION 2026-11-05,
-- BEFORE chair-facing-app-path-DEPLOY.sql added `'facing', s.facing`.
-- Paste to roll back. CREATE OR REPLACE, same signature, so nothing is dropped.
--
-- NOTE: SECURITY DEFINER with no `SET search_path` is how it was found. Left
-- as-is so the rollback restores exactly what was there, not an improved copy.

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
        'seats', (
          SELECT COALESCE(json_agg(json_build_object(
            'id', s.id,
            'row', s.row_label,
            'seat', s.seat_number,
            'label', s.label,
            'x', s.x,
            'y', s.y,
            'tier_id', COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id),
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
