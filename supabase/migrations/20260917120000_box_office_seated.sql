-- Box office on seated events: the seller picks a section + quantity, the
-- shared best-available ranking seats the party (splits auto-accepted — the
-- seller reads the seats out), the seats are booked on the spot (door sales
-- are paid in hand; no hold, no intent race). Voiding frees the seats again.

DROP FUNCTION IF EXISTS public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text, boolean, numeric);

CREATE OR REPLACE FUNCTION public.create_box_office_order(
    p_event_id uuid, p_quantity integer, p_tier_id uuid DEFAULT NULL::uuid,
    p_buyer_name text DEFAULT NULL::text, p_buyer_email text DEFAULT NULL::text, p_buyer_phone text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'CASH'::text, p_note text DEFAULT NULL::text, p_admit_now boolean DEFAULT true,
    p_cash_tendered numeric DEFAULT NULL::numeric,
    p_section_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_org uuid; v_price numeric; v_intent uuid; v_tickets json; v_got integer;
    v_method text; v_seated boolean; v_status text;
    v_email text; v_name text; v_token uuid; v_event record;
    v_queued boolean := false; v_admitted integer := 0;
    v_total numeric; v_tendered numeric; v_change numeric;
    v_tier uuid; v_seats json; v_sec record;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 20';
    END IF;

    v_name  := NULLIF(btrim(COALESCE(p_buyer_name, '')), '');
    v_email := lower(NULLIF(btrim(COALESCE(p_buyer_email, '')), ''));
    IF v_name IS NULL THEN RAISE EXCEPTION 'A buyer name is required'; END IF;

    v_method := upper(btrim(COALESCE(p_payment_method, 'CASH')));
    IF v_method NOT IN ('CASH','TERMINAL','BANK','COMP') THEN
        RAISE EXCEPTION 'Unknown payment method: %', v_method;
    END IF;

    SELECT organizer_id, status INTO v_org, v_status FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to sell tickets for this event';
    END IF;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'This event is cancelled'; END IF;

    -- Seated event = has a seat map with actual seats. The seller must say where.
    -- A GA-only zone inside a seat map (no seat dots) sells by quantity as before.
    SELECT EXISTS (SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id)
       AND EXISTS (SELECT 1 FROM seats s WHERE s.event_id = p_event_id) INTO v_seated;
    v_tier := p_tier_id;
    IF v_seated THEN
        IF p_section_id IS NULL THEN
            RAISE EXCEPTION 'Pick a section for this seated event';
        END IF;
        SELECT id, tier_id, label INTO v_sec FROM event_sections
        WHERE id = p_section_id AND event_id = p_event_id AND is_active;
        IF v_sec.id IS NULL THEN RAISE EXCEPTION 'That section does not belong to this event'; END IF;
        v_tier := COALESCE(v_tier, v_sec.tier_id);
        IF v_tier IS NULL THEN
            -- Prices can live on the seats themselves (seat/row overrides with no
            -- section default): take the section's most common resolved category.
            SELECT t INTO v_tier FROM (
                SELECT COALESCE(s.tier_id, NULLIF(x.row_tier_overrides->>s.row_label, '')::uuid, x.tier_id) AS t, count(*) n
                FROM seats s JOIN event_sections x ON x.id = s.section_id
                WHERE s.section_id = p_section_id
                GROUP BY 1 ORDER BY n DESC LIMIT 1
            ) q WHERE t IS NOT NULL;
        END IF;
        IF v_tier IS NULL THEN
            RAISE EXCEPTION 'Section % has no price category — set one in the seat map editor', v_sec.label;
        END IF;
        -- GA zone (no seats) → nothing to assign
        IF NOT EXISTS (SELECT 1 FROM seats WHERE section_id = p_section_id) THEN
            v_seated := false;
        END IF;
    END IF;

    IF v_method = 'COMP' THEN
        v_price := 0;
    ELSIF v_tier IS NOT NULL THEN
        SELECT price INTO v_price FROM ticket_tiers WHERE id = v_tier AND event_id = p_event_id;
        IF v_price IS NULL THEN
            RAISE EXCEPTION 'That ticket type does not belong to this event';
        END IF;
    ELSE
        SELECT ticket_price INTO v_price FROM events WHERE id = p_event_id;
    END IF;
    v_price := COALESCE(v_price, 0);
    v_total := v_price * p_quantity;

    IF v_method = 'CASH' AND p_cash_tendered IS NOT NULL AND p_cash_tendered > 0 THEN
        v_tendered := round(p_cash_tendered, 2);
        IF v_tendered < v_total THEN
            RAISE EXCEPTION 'Cash received (%) is less than the total (%)', v_tendered, v_total;
        END IF;
        v_change := v_tendered - v_total;
    END IF;

    INSERT INTO purchase_intents (
        user_id, event_id, tier_id, quantity, unit_price, subtotal,
        platform_fee, total_amount, status, paid_at, expires_at,
        payment_method, source, xendit_external_id,
        guest_email, guest_name, guest_phone, metadata
    ) VALUES (
        NULL, p_event_id, v_tier, p_quantity, v_price, v_total,
        0, v_total, 'completed', now(), now(),
        v_method, 'box_office', 'box_' || gen_random_uuid()::text,
        v_email, v_name, NULLIF(btrim(COALESCE(p_buyer_phone, '')), ''),
        jsonb_build_object('box_office', true, 'sold_by', auth.uid(),
                           'note', NULLIF(btrim(COALESCE(p_note, '')), ''),
                           'cash_tendered', v_tendered,
                           'change_given', v_change,
                           'section_id', p_section_id)
    ) RETURNING id, access_token INTO v_intent, v_token;

    WITH picked AS (
        SELECT id FROM tickets
        WHERE event_id = p_event_id AND status = 'available'
          AND (v_tier IS NULL OR tier_id IS NULL OR tier_id = v_tier)
        LIMIT p_quantity FOR UPDATE SKIP LOCKED
    ), upd AS (
        UPDATE tickets SET status = 'reserved', purchase_intent_id = v_intent,
            held_until = now() + interval '5 minutes', updated_at = now()
        WHERE id IN (SELECT id FROM picked) RETURNING id
    )
    SELECT count(*) INTO v_got FROM upd;

    IF v_got < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets left (asked for %, only % available)',
            p_quantity, v_got;
    END IF;

    -- Seat the party: shared ranking, splits allowed, stamps seat_id/seat_info
    -- on the reserved tickets. Then book immediately — cash is in hand.
    IF v_seated THEN
        BEGIN
            v_seats := assign_seats_to_intent(v_intent, v_tier, p_quantity, NULL, NULL, p_section_id);
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%SEATS_UNAVAILABLE%' THEN
                RAISE EXCEPTION 'Not enough seats left in % for %', v_sec.label, p_quantity;
            END IF;
            RAISE;
        END;
        IF v_seats IS NULL THEN
            RAISE EXCEPTION 'No seats in % are sold at that price', v_sec.label;
        END IF;
    END IF;

    SELECT issue_tickets(v_intent, NULL) INTO v_tickets;

    IF v_seated THEN
        PERFORM book_seats_for_intent(v_intent);
    END IF;

    IF p_admit_now THEN
        WITH adm AS (
            UPDATE tickets
            SET status = 'used', checked_in_at = now(), checked_in_by = auth.uid(),
                updated_at = now()
            WHERE purchase_intent_id = v_intent AND checked_in_at IS NULL
            RETURNING id
        )
        SELECT count(*) INTO v_admitted FROM adm;
    END IF;

    IF v_email IS NOT NULL AND v_tickets IS NOT NULL THEN
        BEGIN
            SELECT title, venue_name, start_datetime, end_datetime, cover_image_url
            INTO v_event FROM events WHERE id = p_event_id;

            PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
                'type', 'send_ticket_email',
                'data', jsonb_build_object(
                    'email', v_email, 'name', v_name,
                    'event_title', COALESCE(v_event.title, 'Event'),
                    'event_venue', COALESCE(v_event.venue_name, 'Venue'),
                    'event_date', v_event.start_datetime,
                    'event_end_date', v_event.end_datetime,
                    'event_cover_image', v_event.cover_image_url,
                    'ticket_quantity', p_quantity,
                    'total_amount', v_total,
                    'transaction_ref', 'box_office/' || left(v_intent::text, 8),
                    'payment_method', offline_payment_label(v_method),
                    'tickets', v_tickets
                )));
            v_queued := true;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Box office: could not enqueue ticket email for %: %', v_intent, SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'intent_id', v_intent, 'quantity', p_quantity, 'unit_price', v_price,
        'total', v_total, 'payment_method', v_method,
        'ticket_url', '/t/' || v_token::text,
        'email_sent_to', CASE WHEN v_queued THEN v_email ELSE NULL END,
        'admitted', v_admitted,
        'cash_tendered', v_tendered,
        'change_given', v_change,
        'tickets', v_tickets,
        'seats', v_seats
    );
END;
$function$;

-- Voiding a seated door sale puts the seats back on sale.
CREATE OR REPLACE FUNCTION public.void_box_office_order(p_intent_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_intent record; v_org uuid; v_seller uuid; v_released integer;
BEGIN
    SELECT * INTO v_intent FROM purchase_intents WHERE id = p_intent_id FOR UPDATE;
    IF v_intent.id IS NULL THEN RAISE EXCEPTION 'That sale no longer exists'; END IF;

    IF v_intent.source IS DISTINCT FROM 'box_office' THEN
        RAISE EXCEPTION 'Only box office sales can be voided. Use a refund for online orders.';
    END IF;
    IF v_intent.status = 'cancelled' THEN
        RAISE EXCEPTION 'That sale is already voided';
    END IF;

    SELECT organizer_id INTO v_org FROM events WHERE id = v_intent.event_id;
    v_seller := (v_intent.metadata ->> 'sold_by')::uuid;

    IF NOT (can_manage_door_sales(v_org)
            OR (v_seller = auth.uid() AND can_sell_at_door(v_org))) THEN
        RAISE EXCEPTION 'Only the person who made this sale, or a manager, can void it';
    END IF;

    UPDATE seats SET status = 'available'
    WHERE id IN (SELECT seat_id FROM tickets WHERE purchase_intent_id = p_intent_id AND seat_id IS NOT NULL)
      AND status = 'booked';
    DELETE FROM seat_holds WHERE session_id = p_intent_id::text;

    WITH released AS (
        UPDATE tickets
        SET status = 'available', purchase_intent_id = NULL, user_id = NULL,
            qr_code = NULL, held_until = NULL,
            checked_in_at = NULL, checked_in_by = NULL, updated_at = now(),
            seat_id = NULL, seat_info = NULL
        WHERE purchase_intent_id = p_intent_id
        RETURNING id
    )
    SELECT count(*) INTO v_released FROM released;

    UPDATE purchase_intents
    SET status = 'cancelled',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'voided_at', now(), 'voided_by', auth.uid(),
            'void_reason', NULLIF(btrim(COALESCE(p_reason, '')), ''))
    WHERE id = p_intent_id;

    RETURN jsonb_build_object('intent_id', p_intent_id, 'tickets_released', v_released);
END;
$function$;

-- Keep the grants the previous signature had (can_sell_at_door gates inside).
REVOKE ALL ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text, boolean, numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text, boolean, numeric, uuid) TO authenticated, service_role;
