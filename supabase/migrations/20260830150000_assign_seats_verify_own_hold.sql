-- Seat holds: make the checkout timer mean something on the SERVER.
--
-- The bug, as reported: wait out the countdown on the checkout page, then pay
-- anyway. Two independent faults lined up.
--
--  1. Client — get_seat_hold_expiry filters `expires_at > now()`, so a LAPSED
--     hold and a hold that NEVER EXISTED both come back as NULL. The pay button
--     was gated on `secondsLeft === 0`, but a lapsed hold sets secondsLeft to
--     null, and `null === 0` is false. The guard failed open on precisely the
--     case it existed to catch. (Fixed separately, in seat-hold-timer.tsx.)
--
--  2. Server — this function. It rejects seats held by a DIFFERENT session, but
--     never checks that the buyer's own hold is still alive; it was not even
--     given the picker session id. So the countdown was decoration: a buyer on
--     an expired page whose seats nobody else had claimed sailed through and
--     took seats that were legitimately released back to the pool.
--
-- Fault 1 alone is a UI bug. Fault 2 is why fixing the UI is not enough: the
-- timer is not a security boundary until the server enforces it.
--
-- ROLLOUT — this is the live money path and there is no staging.
-- This migration ADDS a 5-argument overload and leaves the existing 4-argument
-- function untouched and serving traffic. The new parameter has NO DEFAULT, so
-- 4-arg calls stay unambiguous and nothing changes until create-purchase-intent
-- is deployed to pass the session id. Rollback is redeploying the old function;
-- the 4-arg version is only dropped in a later migration, once verified.

CREATE OR REPLACE FUNCTION public.assign_seats_to_intent(
  p_intent_id  uuid,
  p_tier_id    uuid,
  p_quantity   integer,
  p_seat_ids   uuid[],
  -- The buyer's picker session (sessionStorage 'hh_seat_session'). NULL means
  -- the caller cannot prove a hold — see the guard below for why that is only
  -- tolerated for auto-assignment.
  p_session_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_candidates RECORD;
  v_chosen uuid[];
  v_run uuid[];
  v_best_run uuid[];
  v_prev_section uuid;
  v_prev_row text;
  v_prev_num integer;
  v_held integer;
  v_own_live integer;
  v_result json;
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

    -- THE FIX. When the buyer named specific seats, they must still hold every
    -- one of them. Checked BEFORE the availability scan so the buyer gets
    -- "your hold expired, please pick again" rather than the misleading
    -- "those seats are unavailable" — they may well still be free, the buyer
    -- simply no longer has any claim on them.
    --
    -- Only enforced when a session id is supplied. Callers that cannot supply
    -- one (the Flutter app today) keep the old behaviour rather than having
    -- checkout break under them; closing that path is a follow-up that needs
    -- the app shipped first.
    IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
      SELECT count(*) INTO v_own_live
      FROM seat_holds h
      WHERE h.seat_id = ANY(p_seat_ids)
        AND h.session_id = p_session_id
        AND h.expires_at > now();

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
          WHERE h.seat_id = s.id AND h.expires_at > now()
            AND h.session_id != p_intent_id::text
            -- The buyer's own picker hold is not a competitor with itself.
            -- Without this the check above would guarantee a hold exists and
            -- then this clause would reject the seat for existing.
            AND (p_session_id IS NULL OR h.session_id != p_session_id)
        )
      FOR UPDATE OF s SKIP LOCKED
    )
    SELECT array_agg(id) INTO v_chosen FROM locked;

    IF v_chosen IS NULL OR array_length(v_chosen, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  ELSE
    -- Auto-assignment: the buyer named no seats, so there is no hold of theirs
    -- to verify. Unchanged from the original.
    v_run := '{}';
    v_best_run := NULL;
    v_prev_section := NULL;
    v_prev_row := NULL;
    v_prev_num := NULL;
    v_chosen := '{}';

    FOR v_candidates IN
      SELECT s.id, s.section_id, s.row_label, s.seat_number
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now()
        )
      ORDER BY sec.sort_order, s.row_label, s.seat_number
      FOR UPDATE OF s SKIP LOCKED
    LOOP
      IF v_prev_section IS DISTINCT FROM v_candidates.section_id
         OR v_prev_row IS DISTINCT FROM v_candidates.row_label
         OR v_candidates.seat_number != v_prev_num + 1 THEN
        v_run := '{}';
      END IF;
      v_run := v_run || v_candidates.id;
      v_prev_section := v_candidates.section_id;
      v_prev_row := v_candidates.row_label;
      v_prev_num := v_candidates.seat_number;

      IF v_best_run IS NULL AND array_length(v_run, 1) >= p_quantity THEN
        v_best_run := v_run[(array_length(v_run,1) - p_quantity + 1) : array_length(v_run,1)];
      END IF;

      IF array_length(v_chosen, 1) IS NULL OR array_length(v_chosen, 1) < p_quantity THEN
        v_chosen := v_chosen || v_candidates.id;
      END IF;
    END LOOP;

    IF v_best_run IS NOT NULL THEN
      v_chosen := v_best_run;
    ELSIF v_chosen IS NULL OR array_length(v_chosen, 1) < p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    ELSE
      v_chosen := v_chosen[1:p_quantity];
    END IF;
  END IF;

  -- Hand the hold over from the picker session to the intent. The picker hold
  -- is deleted first so the ON CONFLICT below can actually take ownership —
  -- otherwise the buyer's own hold blocks the insert and the count check fires.
  IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
    DELETE FROM seat_holds
    WHERE seat_id = ANY(v_chosen) AND session_id = p_session_id;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at)
  SELECT unnest(v_chosen), p_intent_id::text,
         (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
         now() + interval '10 minutes'
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
           row_number() OVER (ORDER BY sec.sort_order, s.row_label, s.seat_number) AS rn
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
  ) ORDER BY sec.sort_order, s.row_label, s.seat_number)
  INTO v_result
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = ANY(v_chosen);

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.assign_seats_to_intent(uuid, uuid, integer, uuid[], text) IS
  'Assigns seats to a purchase intent. Unlike the 4-arg version it verifies the buyer STILL holds every seat they named (SEATS_EXPIRED), making the checkout countdown enforceable server-side rather than UI-only.';
