-- Resend a ticket email to the SAME address.
--
-- correct_order_email already exists and re-sends, but only as a side effect of
-- changing the address -- it raises SAME_EMAIL if the address is unchanged. So
-- the common case has no answer: a perfectly good address that failed once
-- (full mailbox, a transient provider bounce, a greylist) cannot be retried at
-- all. One of the bounced buyers on "Back to the Garden" is a plain gmail.com
-- address; there is nothing to correct, it just needs sending again.

-- ── The payload, in one place ──────────────────────────────────────────────
-- Lifted verbatim from correct_order_email so a resent email is byte-identical
-- to the one the purchase flow sends.
--
-- correct_order_email is deliberately NOT refactored onto this helper in the
-- same migration that introduces it: it is live, money-adjacent, and the only
-- route an organizer currently has to fix a bad address. Unifying them is a
-- separate change with its own test, not a free rider on a feature build.
CREATE OR REPLACE FUNCTION public.enqueue_order_ticket_email(p_intent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_ev      record;
    v_tickets json;
    v_token   uuid;
    v_total   numeric;
    v_method  text;
    v_ref     text;
    v_name    text;
    v_email   text;
    v_event   uuid;
BEGIN
    SELECT pi.event_id, pi.access_token, pi.total_amount, pi.payment_method,
           pi.xendit_external_id, COALESCE(pi.guest_name, u.display_name),
           lower(COALESCE(pi.guest_email, u.email))
      INTO v_event, v_token, v_total, v_method, v_ref, v_name, v_email
      FROM purchase_intents pi
      LEFT JOIN users u ON u.id = pi.user_id
     WHERE pi.id = p_intent_id;

    IF v_event IS NULL OR v_email IS NULL THEN RETURN false; END IF;

    SELECT title, venue_name, start_datetime, end_datetime, cover_image_url
      INTO v_ev FROM events WHERE id = v_event;

    -- Only live tickets. A refunded or cancelled row must never be
    -- re-delivered as though it were still valid.
    SELECT json_agg(jsonb_build_object('ticket_number', t.ticket_number, 'qr_code', t.qr_code))
      INTO v_tickets
      FROM tickets t
     WHERE t.purchase_intent_id = p_intent_id
       AND t.status::text IN ('valid', 'used', 'approved');

    IF v_tickets IS NULL THEN RETURN false; END IF;

    PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
        'type', 'send_ticket_email',
        'data', jsonb_build_object(
            'email', v_email,
            'name', v_name,
            'event_title', COALESCE(v_ev.title, 'Event'),
            'event_venue', COALESCE(v_ev.venue_name, 'Venue'),
            'event_date', v_ev.start_datetime,
            'event_end_date', v_ev.end_datetime,
            'event_cover_image', v_ev.cover_image_url,
            'ticket_quantity', json_array_length(v_tickets),
            'total_amount', COALESCE(v_total, 0),
            'transaction_ref', COALESCE(v_ref, left(p_intent_id::text, 8)),
            'payment_method', COALESCE(v_method, 'Paid'),
            'ticket_url', '/t/' || v_token::text,
            'tickets', v_tickets
        )));
    RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_order_ticket_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_order_ticket_email(uuid) TO service_role;

-- ── The organizer-facing action ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resend_order_email(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_intent uuid;
    v_event  uuid;
    v_org    uuid;
    v_email  text;
    v_sent   boolean;
BEGIN
    SELECT t.purchase_intent_id, t.event_id INTO v_intent, v_event
      FROM tickets t WHERE t.id = p_ticket_id;
    IF v_intent IS NULL THEN RAISE EXCEPTION 'TICKET_NOT_FOUND'; END IF;

    SELECT organizer_id INTO v_org FROM events WHERE id = v_event;
    -- Same authority as the door and as correct_order_email.
    IF NOT can_sell_at_door(v_org) THEN RAISE EXCEPTION 'NOT_YOUR_EVENT'; END IF;

    SELECT lower(COALESCE(pi.guest_email, u.email)) INTO v_email
      FROM purchase_intents pi LEFT JOIN users u ON u.id = pi.user_id
     WHERE pi.id = v_intent;

    -- A suppressed address is one we KNOW is dead -- resending would bounce
    -- again and spend sender reputation to achieve nothing. Say so, and point
    -- at the fix that works.
    IF EXISTS (SELECT 1 FROM email_suppressions s WHERE lower(s.email) = v_email) THEN
        RAISE EXCEPTION 'ADDRESS_SUPPRESSED';
    END IF;

    v_sent := public.enqueue_order_ticket_email(v_intent);
    IF NOT v_sent THEN
        RETURN jsonb_build_object('ok', false, 'error',
            'This order has no live tickets to send.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$fn$;

REVOKE ALL ON FUNCTION public.resend_order_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_order_email(uuid) TO authenticated, service_role;
