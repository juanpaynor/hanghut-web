-- Verbatim prod definitions captured 2026-11-05, BEFORE phase1b.
-- Restore by running this whole file. See phase1b-seat-leak-and-idempotency-DEPLOY.sql.
--
-- Also part of the phase1b rollback (not in this file, it is a new object):
--   drop trigger if exists trg_clear_seat_on_release on public.tickets;
--   drop function if exists public.clear_seat_on_release();

-- ─────────────────────────────────────────────────────────────────────────────
-- assign_seats_to_intent (6-arg) -- as it stood before phase1b
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[], p_session_id text, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_chosen uuid[];
  v_held integer;
  v_own_live integer;
  v_result json;
  v_avoid boolean;
  v_pick jsonb;
  v_sec record;
BEGIN
  SELECT event_id INTO v_event_id FROM purchase_intents WHERE id = p_intent_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.event_id = v_event_id
      AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN
    IF array_length(p_seat_ids, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
    END IF;

    IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
      SELECT count(*) INTO v_own_live
      FROM seat_holds h
      WHERE h.seat_id = ANY(p_seat_ids)
        AND h.session_id = p_session_id
        AND h.expires_at > now() - interval '30 seconds';

      IF v_own_live <> array_length(p_seat_ids, 1) THEN
        RAISE EXCEPTION 'SEATS_EXPIRED';
      END IF;
    END IF;

    WITH locked AS (
      SELECT s.id
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.id = ANY(p_seat_ids)
        AND s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now() - interval '30 seconds'
            AND h.session_id != p_intent_id::text
            AND (p_session_id IS NULL OR h.session_id != p_session_id)
        )
      FOR UPDATE OF s SKIP LOCKED
    )
    SELECT array_agg(id) INTO v_chosen FROM locked;

    IF v_chosen IS NULL OR array_length(v_chosen, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  ELSE
    SELECT avoid_orphan_seats INTO v_avoid FROM events WHERE id = v_event_id;
    v_pick := NULL;
    FOR v_sec IN
      SELECT sec.id FROM event_sections sec
      WHERE sec.event_id = v_event_id AND sec.is_active
        AND (p_section_id IS NULL OR sec.id = p_section_id)
      ORDER BY sec.sort_order, sec.created_at
    LOOP
      v_pick := pick_best_available(v_sec.id, p_tier_id, p_quantity, p_session_id, NULL, COALESCE(v_avoid, true), true, true);
      EXIT WHEN (v_pick->>'ok')::boolean;
    END LOOP;
    IF v_pick IS NULL OR NOT (v_pick->>'ok')::boolean THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
    SELECT array_agg((e->>'seat_id')::uuid) INTO v_chosen FROM jsonb_array_elements(v_pick->'seats') e;
  END IF;

  IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
    DELETE FROM seat_holds
    WHERE seat_id = ANY(v_chosen) AND session_id = p_session_id;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at, origin)
  SELECT unnest(v_chosen), p_intent_id::text,
         (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
         now() + interval '18 minutes',
         CASE WHEN p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN 'pick' ELSE 'auto' END
  ON CONFLICT (seat_id) DO NOTHING;

  SELECT count(*) INTO v_held FROM seat_holds
  WHERE session_id = p_intent_id::text AND seat_id = ANY(v_chosen);

  IF v_held != p_quantity THEN
    DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
    RAISE EXCEPTION 'SEATS_UNAVAILABLE';
  END IF;

  WITH ordered_tickets AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM tickets
    WHERE purchase_intent_id = p_intent_id AND status = 'reserved'
  ),
  ordered_seats AS (
    SELECT s.id AS seat_id,
           jsonb_build_object(
             'section', sec.label,
             'row', s.row_label,
             'seat', s.seat_number,
             'label', s.label
           ) AS info,
           row_number() OVER (ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number) AS rn
    FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.id = ANY(v_chosen)
  )
  UPDATE tickets t
  SET seat_id = os.seat_id, seat_info = os.info
  FROM ordered_tickets ot
  JOIN ordered_seats os ON os.rn = ot.rn
  WHERE t.id = ot.id;

  SELECT json_agg(jsonb_build_object(
    'seat_id', s.id,
    'section', sec.label,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label
  ) ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number)
  INTO v_result
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = ANY(v_chosen);

  RETURN v_result;
END;
$function$;
