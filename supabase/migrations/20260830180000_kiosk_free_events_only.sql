-- Check-in kiosk: free events only.
--
-- Typing an email is not authentication. Anyone who knows an attendee's address
-- could claim their seat, so the kiosk is a fair trade for a free RSVP door and
-- not for a ticketed one. Paid events check in through /scan (which verifies a
-- QR) or the box office (which is operated by staff). A ticketed event is now
-- refused outright rather than partially served.
--
-- This also replaces the old "is it free" test, which was wrong twice:
--
--   OLD:  has a 0-priced tier  OR  COALESCE(ticket_price, 0) = 0
--
--   1. An event can carry a free tier alongside paid ones — the OR called that
--      whole event free.
--   2. ticket_price is NULL on tier-based events, so COALESCE(...,0) = 0 is TRUE
--      for essentially every paid event that prices through tiers.
--
-- Either reading would have let the kiosk mint free entry to a paid show. No
-- live event hit it (checked: 0 rows), but it was one paid event away.

CREATE OR REPLACE FUNCTION public.event_is_free(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT NOT EXISTS (
             SELECT 1 FROM ticket_tiers t
             WHERE t.event_id = p_event_id AND t.price > 0
           )
       AND COALESCE((SELECT ticket_price FROM events WHERE id = p_event_id), 0) = 0;
$function$;

REVOKE ALL ON FUNCTION public.event_is_free(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_is_free(uuid) TO authenticated;

COMMENT ON FUNCTION public.event_is_free(uuid) IS
  'True only when an event has no paid tier and no paid base price. The single definition of "free" for the check-in kiosk — a ticketed event must never be admissible by typing an email.';
-- kiosk_check_in is redefined below exactly as applied to production.

CREATE OR REPLACE FUNCTION public.kiosk_check_in(
    p_event_id uuid,
    p_name     text,
    p_email    text,
    p_pax      integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org      uuid;
    v_status   text;
    v_name     text;
    v_email    text;
    v_pax      integer;
    v_unused   integer := 0;
    v_used     integer := 0;
    v_who      text;
    v_admit    integer := 0;
    v_short    integer := 0;
    v_order    jsonb;
    v_first    text;
BEGIN
    v_name  := NULLIF(btrim(COALESCE(p_name, '')), '');
    v_email := lower(NULLIF(btrim(COALESCE(p_email, '')), ''));

    IF v_name IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED',
                                  'message', 'Please enter your name.');
    END IF;
    IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_REQUIRED',
                                  'message', 'Please enter a valid email address.');
    END IF;

    v_pax := LEAST(GREATEST(COALESCE(p_pax, 1), 1), 10);

    SELECT organizer_id, status INTO v_org, v_status FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to check people in for this event';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'This event is cancelled';
    END IF;

    -- ── Free events only, and refused outright ───────────────────────────────
    IF NOT event_is_free(p_event_id) THEN
        RAISE EXCEPTION 'KIOSK_NOT_AVAILABLE';
    END IF;

    SELECT count(*) FILTER (WHERE t.checked_in_at IS NULL),
           count(*) FILTER (WHERE t.checked_in_at IS NOT NULL),
           max(COALESCE(u.display_name, t.guest_name))
    INTO v_unused, v_used, v_who
    FROM tickets t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.event_id = p_event_id
      AND t.status IN ('valid', 'reserved', 'approved', 'used')
      AND (lower(t.guest_email) = v_email OR lower(u.email) = v_email);

    v_first := split_part(COALESCE(v_who, v_name), ' ', 1);

    IF v_unused = 0 AND v_used > 0 THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'ALREADY_IN',
            'first_name', v_first, 'already_in', v_used,
            'message', CASE WHEN v_used = 1
                THEN 'This ticket has already been checked in.'
                ELSE v_used || ' tickets on this email have already been checked in.' END);
    END IF;

    IF v_unused > 0 THEN
        v_admit := LEAST(v_pax, v_unused);

        UPDATE tickets SET
            status = 'used', checked_in_at = now(), checked_in_by = auth.uid(),
            updated_at = now()
        WHERE id IN (
            SELECT t.id FROM tickets t
            LEFT JOIN users u ON u.id = t.user_id
            WHERE t.event_id = p_event_id
              AND t.checked_in_at IS NULL
              AND t.status IN ('valid', 'reserved', 'approved')
              AND (lower(t.guest_email) = v_email OR lower(u.email) = v_email)
            ORDER BY t.created_at
            LIMIT v_admit
        );
    END IF;

    v_short := v_pax - v_admit;

    -- The event is free by the check above, so the balance of the party is
    -- always issued rather than sent anywhere.
    IF v_short > 0 THEN
        BEGIN
            v_order := create_box_office_order(
                p_event_id      := p_event_id,
                p_quantity      := v_short,
                p_payment_method:= 'COMP',
                p_buyer_name    := v_name,
                p_buyer_email   := v_email,
                p_admit_now     := true,
                p_note          := 'Walk-up check-in kiosk'
            );
            v_admit := v_admit + v_short;
            v_short := 0;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Kiosk walk-up failed for event %: %', p_event_id, SQLERRM;
            RETURN jsonb_build_object(
                'ok', v_admit > 0,
                'code', CASE WHEN v_admit > 0 THEN 'PARTIAL' ELSE 'SEE_BOX_OFFICE' END,
                'first_name', v_first, 'admitted', v_admit, 'short', v_short,
                'message', CASE
                    WHEN SQLERRM ILIKE '%not enough tickets%' THEN
                        'This event is full. Please see a staff member.'
                    WHEN SQLERRM ILIKE '%seat map%' THEN
                        'This event has assigned seating. Please see a staff member.'
                    ELSE 'We could not check everyone in. Please see a staff member.'
                END);
        END;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'code', CASE WHEN v_order IS NOT NULL AND v_unused = 0 THEN 'REGISTERED' ELSE 'ADMITTED' END,
        'first_name', v_first,
        'admitted', v_admit,
        'ticket_url', v_order ->> 'ticket_url');
END;
$function$;

COMMENT ON FUNCTION public.kiosk_check_in(uuid, text, text, integer) IS
  'Self-service door check-in for FREE events only (see event_is_free) — a ticketed event raises KIOSK_NOT_AVAILABLE, because typing an email is not authentication. Admits what the email holds, issues the rest of the party. Exact-email match, returns a first name and counts, never a list.';
