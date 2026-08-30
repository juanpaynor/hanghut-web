-- Walk-up check-in desk: one screen a guest types their own name and email into.
--
-- This is the SELF-SERVICE twin of find_attendees_at_door. The difference is not
-- cosmetic and drives most of what follows: at the box office a trusted staff
-- member is reading the screen, so fuzzy search returning full names and emails
-- is exactly right. Here a stranger is looking at it. Typing "a" into a fuzzy
-- search would print the guest list to whoever is next in the queue.
--
-- So this function matches on EXACT email only, never returns a list, and gives
-- back a first name and nothing else.
--
-- Three outcomes, in the order they are tried:
--   1. They already have a ticket        → admit it
--   2. They already used it               → say so (staff needs to see doubles)
--   3. No ticket, and the event is FREE   → issue one and admit in the same step
--
-- Case 3 is deliberately gated on the event being free. A kiosk that hands out
-- paid entry to anyone who types a name is a hole you find out about after the
-- show, so a paid event sends them to the box office instead.

CREATE OR REPLACE FUNCTION public.kiosk_check_in(
    p_event_id uuid,
    p_name     text,
    p_email    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org        uuid;
    v_status     text;
    v_name       text;
    v_email      text;
    v_ticket     record;
    v_is_free    boolean;
    v_order      jsonb;
    v_first      text;
BEGIN
    v_name  := NULLIF(btrim(COALESCE(p_name, '')), '');
    v_email := lower(NULLIF(btrim(COALESCE(p_email, '')), ''));

    IF v_name IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED',
                                  'message', 'Please enter your name.');
    END IF;
    -- Deliberately loose. A door queue is the wrong place to argue with someone
    -- about their address format; we only need it to be usable as a key.
    IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_REQUIRED',
                                  'message', 'Please enter a valid email address.');
    END IF;

    SELECT organizer_id, status INTO v_org, v_status FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

    -- Authorization rides on the STAFF session that opened the kiosk, not on the
    -- guest. The guest is anonymous and stays that way.
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to check people in for this event';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'This event is cancelled';
    END IF;

    -- ── 1/2. Do they already have a ticket? ──────────────────────────────────
    -- Exact email, on either the guest field or the account the ticket belongs
    -- to. Un-used tickets sort first so a guest holding two does not get told
    -- "already checked in" because we happened to look at the spent one.
    SELECT t.id, t.checked_in_at,
           COALESCE(u.display_name, t.guest_name) AS who
    INTO v_ticket
    FROM tickets t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.event_id = p_event_id
      AND t.status IN ('valid', 'reserved', 'approved', 'used')
      AND (lower(t.guest_email) = v_email OR lower(u.email) = v_email)
    ORDER BY (t.checked_in_at IS NOT NULL), t.created_at
    LIMIT 1;

    IF v_ticket.id IS NOT NULL THEN
        v_first := split_part(COALESCE(v_ticket.who, v_name), ' ', 1);

        IF v_ticket.checked_in_at IS NOT NULL THEN
            RETURN jsonb_build_object(
                'ok', false, 'code', 'ALREADY_IN',
                'first_name', v_first,
                'checked_in_at', v_ticket.checked_in_at,
                'message', 'This ticket has already been checked in.');
        END IF;

        UPDATE tickets
        SET status = 'used', checked_in_at = now(), checked_in_by = auth.uid(),
            updated_at = now()
        WHERE id = v_ticket.id;

        RETURN jsonb_build_object('ok', true, 'code', 'ADMITTED',
                                  'first_name', v_first);
    END IF;

    -- ── 3. Walk-up. Free events only. ────────────────────────────────────────
    SELECT COALESCE(
             EXISTS (SELECT 1 FROM ticket_tiers tt
                     WHERE tt.event_id = p_event_id AND tt.price = 0),
             false)
           OR COALESCE((SELECT ticket_price FROM events WHERE id = p_event_id), 0) = 0
    INTO v_is_free;

    IF NOT v_is_free THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'SEE_BOX_OFFICE',
            'message', 'We could not find a ticket for that email. Please see the box office.');
    END IF;

    -- Reuse the door path rather than minting tickets a second way: it already
    -- provisions from the pre-created ticket rows, issues ticket numbers/QRs,
    -- and queues the confirmation email. COMP forces price 0, so a walk-up can
    -- never be recorded as revenue that was never collected.
    -- It raises on the two cases a door actually hits: the event ran out of
    -- ticket rows, and seated events it cannot assign for. Both must read as
    -- plain English on a screen a guest is standing in front of, so they are
    -- caught here rather than surfacing as a generic server error.
    BEGIN
        v_order := create_box_office_order(
            p_event_id      := p_event_id,
            p_quantity      := 1,
            p_payment_method:= 'COMP',
            p_buyer_name    := v_name,
            p_buyer_email   := v_email,
            p_admit_now     := true,
            p_note          := 'Walk-up check-in kiosk'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Kiosk walk-up failed for event %: %', p_event_id, SQLERRM;
        RETURN jsonb_build_object(
            'ok', false, 'code', 'SEE_BOX_OFFICE',
            'message', CASE
                WHEN SQLERRM ILIKE '%not enough tickets%' THEN
                    'This event is full. Please see a staff member.'
                WHEN SQLERRM ILIKE '%seat map%' THEN
                    'This event has assigned seating. Please see the box office.'
                ELSE
                    'We could not check you in. Please see a staff member.'
            END);
    END;

    RETURN jsonb_build_object('ok', true, 'code', 'REGISTERED',
                              'first_name', split_part(v_name, ' ', 1),
                              'ticket_url', v_order ->> 'ticket_url');
END;
$function$;

REVOKE ALL ON FUNCTION public.kiosk_check_in(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiosk_check_in(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.kiosk_check_in(uuid, text, text) IS
  'Self-service door check-in. Exact-email match only and returns a first name, never a list — unlike find_attendees_at_door, a stranger is reading this screen. Issues a COMP ticket for walk-ups at FREE events; paid events are sent to the box office.';


-- Running tally for the kiosk header, so staff can see the door working without
-- a separate dashboard. Counts only, never names.
CREATE OR REPLACE FUNCTION public.get_kiosk_counts(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
    SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to view this door';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'checked_in', count(*) FILTER (WHERE checked_in_at IS NOT NULL),
            'expected',   count(*) FILTER (WHERE status IN ('valid','reserved','approved','used'))
        )
        FROM tickets WHERE event_id = p_event_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_kiosk_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_counts(uuid) TO authenticated;
