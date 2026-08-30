-- Kiosk check-in: party size.
--
-- Two things drove this, and the second matters more than the first.
--
--  1. A walk-up group had to queue four times to get four people in.
--  2. A party that BOUGHT TOGETHER shares one email. The previous version
--     admitted a single ticket per submission, so a group of four checked in
--     one person, left three tickets unused, and the door count was wrong.
--     Counting their tickets instead of fetching one row fixes that.
--
-- The shortfall rule mirrors the walk-up rule already in place: at a FREE event
-- we issue the difference (someone RSVP'd for themselves and brought friends —
-- the normal case), at a PAID event we admit what they hold and send the rest to
-- the box office. A kiosk must never be the thing that gives paid entry away.
--
-- p_pax is CLAMPED to 1..10 rather than rejected: a guest mistyping the party
-- size should not get an error at the door, and 10 is far below a number that
-- could empty an event's inventory by accident.
--
-- Replaces the 3-arg version. p_pax defaults to 1, so existing 3-argument calls
-- keep resolving to this function and the old one is dropped to avoid ambiguity.

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
    v_is_free  boolean;
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

    -- Clamped, not rejected. A guest mistyping the party size should not get an
    -- error at the door; 10 is well above a real walk-up group and far below a
    -- number that could empty an event's inventory by accident.
    v_pax := LEAST(GREATEST(COALESCE(p_pax, 1), 1), 10);

    SELECT organizer_id, status INTO v_org, v_status FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to check people in for this event';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'This event is cancelled';
    END IF;

    -- ── What does this email already hold? ───────────────────────────────────
    -- Counted rather than fetched one row: a party that bought together shares
    -- one email, and admitting only the first ticket (the old behaviour) left
    -- the rest of the group unable to get in without typing their own address.
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

    -- Everything they hold is already spent.
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

    -- ── Anyone in the party still outside ────────────────────────────────────
    IF v_short > 0 THEN
        SELECT COALESCE(
                 EXISTS (SELECT 1 FROM ticket_tiers tt
                         WHERE tt.event_id = p_event_id AND tt.price = 0), false)
               OR COALESCE((SELECT ticket_price FROM events WHERE id = p_event_id), 0) = 0
        INTO v_is_free;

        IF NOT v_is_free THEN
            -- Whatever they held is now admitted; the extras are a sale, and a
            -- kiosk must never be the thing that gives paid entry away.
            RETURN jsonb_build_object(
                'ok', v_admit > 0, 'code',
                CASE WHEN v_admit > 0 THEN 'PARTIAL' ELSE 'SEE_BOX_OFFICE' END,
                'first_name', v_first, 'admitted', v_admit, 'short', v_short,
                'message', CASE WHEN v_admit > 0
                    THEN v_admit || ' checked in. The other ' || v_short ||
                         ' need tickets — please see the box office.'
                    ELSE 'We could not find a ticket for that email. Please see the box office.' END);
        END IF;

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
                        'This event has assigned seating. Please see the box office.'
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

REVOKE ALL ON FUNCTION public.kiosk_check_in(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_check_in(uuid, text, text, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.kiosk_check_in(uuid, text, text);

COMMENT ON FUNCTION public.kiosk_check_in(uuid, text, text, integer) IS
  'Self-service door check-in for a party of p_pax (clamped 1-10). Admits the tickets that email already holds, then issues the shortfall at FREE events only; paid events send the balance to the box office. Exact-email match, returns a first name and counts, never a list.';
