-- Email the buyer when an offline sale DOES capture an address.
--
-- Both offline paths issue real tickets/bookings but neither told the buyer
-- anything: create_box_office_order and create_manual_experience_booking
-- bypass create-purchase-intent and the Xendit webhook, which are the only two
-- places that ever enqueued a confirmation email. A walk-in who handed over
-- their address got nothing.
--
-- Delivery reuses the existing pipeline unchanged:
--   pgmq 'payment_side_effects' → process-payment-queue (cron, 10s)
--     → send-ticket-email / send-experience-confirmation
--
-- Two things that come for free and are worth knowing:
--   * The hosted ticket page link is NOT built here. The consumer resolves it
--     itself: first ticket's qr_code → tickets.purchase_intent_id →
--     purchase_intents.access_token → /t/{token}. access_token defaults to
--     gen_random_uuid(), so a box-office intent already has one.
--   * Email stays OPTIONAL. No address means no email and that is a complete,
--     valid door sale — the ticket is the QR on the screen. We never invent an
--     address to satisfy the pipeline.
--
-- Every enqueue is wrapped in its own exception block. A queue hiccup must
-- never roll back a sale where cash has already changed hands.

-- Human labels: the email prints payment_method verbatim under "Payment
-- Successful", and "TERMINAL" means nothing to a buyer.
CREATE OR REPLACE FUNCTION public.offline_payment_label(p_method text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE upper(COALESCE(p_method, ''))
        WHEN 'CASH'     THEN 'Cash — paid at the door'
        WHEN 'TERMINAL' THEN 'Card — paid at the door'
        WHEN 'BANK'     THEN 'Bank transfer'
        WHEN 'COMP'     THEN 'Complimentary'
        ELSE COALESCE(p_method, 'Paid')
    END;
$function$;

CREATE OR REPLACE FUNCTION public.create_box_office_order(
    p_event_id       uuid,
    p_quantity       integer,
    p_tier_id        uuid    DEFAULT NULL,
    p_buyer_name     text    DEFAULT NULL,
    p_buyer_email    text    DEFAULT NULL,
    p_buyer_phone    text    DEFAULT NULL,
    p_payment_method text    DEFAULT 'CASH',
    p_note           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org     uuid;
    v_price   numeric;
    v_intent  uuid;
    v_tickets json;
    v_got     integer;
    v_method  text;
    v_seated  boolean;
    v_status  text;
    v_email   text;
    v_name    text;
    v_token   uuid;
    v_event   record;
    v_queued  boolean := false;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 20';
    END IF;

    -- A name is the one thing we insist on: it is what check_purchaser_identity
    -- keys the door-sale exemption off, and it is all the door staff has to
    -- match a person to a ticket. Email stays optional on purpose.
    v_name  := NULLIF(btrim(COALESCE(p_buyer_name, '')), '');
    v_email := lower(NULLIF(btrim(COALESCE(p_buyer_email, '')), ''));
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'A buyer name is required';
    END IF;

    v_method := upper(btrim(COALESCE(p_payment_method, 'CASH')));
    IF v_method NOT IN ('CASH', 'TERMINAL', 'BANK', 'COMP') THEN
        RAISE EXCEPTION 'Unknown payment method: %', v_method;
    END IF;

    SELECT organizer_id, status INTO v_org, v_status FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Event not found';
    END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to sell tickets for this event';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'This event is cancelled';
    END IF;

    -- Seat maps are out of scope for v1: picking inventory blindly would assign a
    -- seat without telling the person at the door which seat they just sold.
    SELECT EXISTS (
        SELECT 1 FROM tickets WHERE event_id = p_event_id AND seat_id IS NOT NULL
    ) INTO v_seated;
    IF v_seated THEN
        RAISE EXCEPTION 'This event uses a seat map. Box office cannot assign seats yet.';
    END IF;

    IF v_method = 'COMP' THEN
        v_price := 0;
    ELSIF p_tier_id IS NOT NULL THEN
        SELECT price INTO v_price FROM ticket_tiers
        WHERE id = p_tier_id AND event_id = p_event_id;
        IF v_price IS NULL THEN
            RAISE EXCEPTION 'That ticket type does not belong to this event';
        END IF;
    ELSE
        SELECT ticket_price INTO v_price FROM events WHERE id = p_event_id;
    END IF;
    v_price := COALESCE(v_price, 0);

    INSERT INTO purchase_intents (
        user_id, event_id, tier_id, quantity, unit_price, subtotal,
        platform_fee, total_amount, status, paid_at, expires_at,
        payment_method, source, xendit_external_id,
        guest_email, guest_name, guest_phone, metadata
    ) VALUES (
        NULL,
        p_event_id, p_tier_id, p_quantity, v_price, v_price * p_quantity,
        0,                         -- no commission on money we never touched
        v_price * p_quantity,
        'completed', now(), now(),
        v_method, 'box_office',
        'box_' || gen_random_uuid()::text,
        v_email, v_name,
        NULLIF(btrim(COALESCE(p_buyer_phone, '')), ''),
        jsonb_build_object(
            'box_office', true,
            'sold_by',    auth.uid(),
            'note',       NULLIF(btrim(COALESCE(p_note, '')), '')
        )
    ) RETURNING id, access_token INTO v_intent, v_token;

    WITH picked AS (
        SELECT id FROM tickets
        WHERE event_id = p_event_id
          AND status = 'available'
          AND (p_tier_id IS NULL OR tier_id IS NULL OR tier_id = p_tier_id)
        LIMIT p_quantity
        FOR UPDATE SKIP LOCKED
    ), upd AS (
        UPDATE tickets
        SET status = 'reserved',
            purchase_intent_id = v_intent,
            held_until = now() + interval '5 minutes',
            updated_at = now()
        WHERE id IN (SELECT id FROM picked)
        RETURNING id
    )
    SELECT count(*) INTO v_got FROM upd;

    IF v_got < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets left (asked for %, only % available)',
            p_quantity, v_got;
    END IF;

    SELECT issue_tickets(v_intent, NULL) INTO v_tickets;

    -- Confirmation email, only if the buyer actually gave an address.
    IF v_email IS NOT NULL AND v_tickets IS NOT NULL THEN
        BEGIN
            SELECT title, venue_name, start_datetime, end_datetime, cover_image_url
            INTO v_event FROM events WHERE id = p_event_id;

            PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
                'type', 'send_ticket_email',
                'data', jsonb_build_object(
                    'email',             v_email,
                    'name',              v_name,
                    'event_title',       COALESCE(v_event.title, 'Event'),
                    'event_venue',       COALESCE(v_event.venue_name, 'Venue'),
                    'event_date',        v_event.start_datetime,
                    'event_end_date',    v_event.end_datetime,
                    'event_cover_image', v_event.cover_image_url,
                    'ticket_quantity',   p_quantity,
                    'total_amount',      v_price * p_quantity,
                    'transaction_ref',   'box_office/' || left(v_intent::text, 8),
                    'payment_method',    offline_payment_label(v_method),
                    'tickets',           v_tickets
                )
            ));
            v_queued := true;
        EXCEPTION WHEN OTHERS THEN
            -- Cash has already changed hands. Losing the email is a nuisance;
            -- rolling back the sale at the door is not acceptable.
            RAISE WARNING 'Box office: could not enqueue ticket email for %: %',
                v_intent, SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'intent_id',      v_intent,
        'quantity',       p_quantity,
        'unit_price',     v_price,
        'total',          v_price * p_quantity,
        'payment_method', v_method,
        -- The screen is the delivery channel when there is no email: staff can
        -- show or print this so the buyer keeps their QR codes.
        'ticket_url',     '/t/' || v_token::text,
        'email_sent_to',  CASE WHEN v_queued THEN v_email ELSE NULL END,
        'tickets',        v_tickets
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_manual_experience_booking(
    p_schedule_id    uuid,
    p_quantity       integer,
    p_guest_name     text,
    p_guest_email    text DEFAULT NULL,
    p_guest_phone    text DEFAULT NULL,
    p_payment_method text DEFAULT 'CASH',
    p_note           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_table_id uuid; v_current integer; v_max integer; v_sched_price numeric;
    v_table_price numeric; v_price numeric; v_status text; v_start timestamptz;
    v_method text; v_intent uuid;
    v_email text; v_name text; v_table record; v_host text; v_queued boolean := false;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 50 THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 50';
    END IF;

    v_name  := NULLIF(btrim(COALESCE(p_guest_name, '')), '');
    v_email := lower(NULLIF(btrim(COALESCE(p_guest_email, '')), ''));
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'A guest name is required';
    END IF;

    v_method := upper(btrim(COALESCE(p_payment_method, 'CASH')));
    IF v_method NOT IN ('CASH', 'TERMINAL', 'BANK', 'COMP') THEN
        RAISE EXCEPTION 'Unknown payment method: %', v_method;
    END IF;

    -- Lock the slot so two people booking the last seat can't both win.
    SELECT table_id, current_guests, max_guests, price_per_person, status, start_time
    INTO v_table_id, v_current, v_max, v_sched_price, v_status, v_start
    FROM public.experience_schedules WHERE id = p_schedule_id FOR UPDATE;

    IF v_table_id IS NULL THEN RAISE EXCEPTION 'That date no longer exists'; END IF;
    IF NOT can_manage_experience(v_table_id) THEN
        RAISE EXCEPTION 'You do not have permission to book for this experience';
    END IF;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'That date is cancelled'; END IF;
    IF COALESCE(v_current, 0) + p_quantity > v_max THEN
        RAISE EXCEPTION 'Only % spot(s) left on that date', GREATEST(0, v_max - COALESCE(v_current, 0));
    END IF;

    SELECT price_per_person INTO v_table_price FROM public.tables WHERE id = v_table_id;
    IF v_method = 'COMP' THEN
        v_price := 0;
    ELSE
        v_price := COALESCE(v_sched_price, v_table_price, 0);
    END IF;

    INSERT INTO public.experience_purchase_intents (
        user_id, table_id, schedule_id, quantity, unit_price, subtotal,
        platform_fee, total_amount, status, paid_at, expires_at,
        payment_method, xendit_external_id,
        guest_email, guest_name, guest_phone, fee_percentage, fees_passed_to_customer
    ) VALUES (
        NULL,  -- walk-in; user_id made nullable by the manual_experience_bookings migration
        v_table_id, p_schedule_id, p_quantity, v_price, v_price * p_quantity,
        0,     -- host collected the money, so no commission
        v_price * p_quantity,
        'completed', now(), now(),
        v_method, 'manual_' || gen_random_uuid()::text,
        v_email, v_name,
        NULLIF(btrim(COALESCE(p_guest_phone, '')), ''),
        0, false
    ) RETURNING id INTO v_intent;

    -- Hold the capacity here rather than via confirm_experience_booking, which
    -- writes an experience_transactions ledger row that must not exist for money
    -- HangHut never received.
    UPDATE public.experience_schedules
    SET current_guests = COALESCE(current_guests, 0) + p_quantity
    WHERE id = p_schedule_id;

    IF v_email IS NOT NULL THEN
        BEGIN
            SELECT title, location_name, image_url, host_id
            INTO v_table FROM public.tables WHERE id = v_table_id;

            SELECT display_name INTO v_host FROM public.users WHERE id = v_table.host_id;

            PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
                'type', 'send_experience_email',
                'data', jsonb_build_object(
                    'email',            v_email,
                    'name',             v_name,
                    'experience_title', COALESCE(v_table.title, 'Experience'),
                    'experience_venue', COALESCE(v_table.location_name, 'Venue'),
                    'experience_date',  v_start,
                    'host_name',        COALESCE(v_host, 'Host'),
                    'quantity',         p_quantity,
                    'total_amount',     v_price * p_quantity,
                    'transaction_ref',  'manual/' || left(v_intent::text, 8),
                    'payment_method',   offline_payment_label(v_method),
                    'intent_id',        v_intent,
                    'cover_image_url',  v_table.image_url
                )
            ));
            v_queued := true;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Manual booking: could not enqueue confirmation for %: %',
                v_intent, SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'intent_id', v_intent, 'table_id', v_table_id, 'quantity', p_quantity,
        'unit_price', v_price, 'total', v_price * p_quantity,
        'payment_method', v_method, 'start_time', v_start,
        'email_sent_to', CASE WHEN v_queued THEN v_email ELSE NULL END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_manual_experience_booking(uuid, integer, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_experience_booking(uuid, integer, text, text, text, text, text) TO authenticated;
