-- Verbatim prod definition captured 2026-11-05, BEFORE chair-facing-DEPLOY.sql.
CREATE OR REPLACE FUNCTION public.get_event_section_seats(p_section_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(json_agg(json_build_object(
    'id', s.id,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label,
    'x', s.x,
    'y', s.y,
    'tier_id', COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id)
  ) ORDER BY s.row_label, s.seat_number), '[]'::json)
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.section_id = p_section_id;
$function$;
