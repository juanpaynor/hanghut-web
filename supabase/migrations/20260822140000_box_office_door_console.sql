-- Box office v2: admit-on-sale, void, and the cash close-out.
--
-- Driven by how a door actually works rather than by the data model:
--   * A walk-up is standing in front of you. Selling them a ticket and then
--     scanning it is theatre, so a door sale ADMITS by default.
--   * Someone will type 3 when they meant 1. Without an undo the count is wrong
--     all night and the cash tin never reconciles, so voids are v1, not v2.
--   * Cash never touches Xendit. The only thing that makes it trustworthy is a
--     number to count against at the end of the night.

-- 'cashier' already appears in the /scan page's allowlist and is literally the
-- box-office role, but can_sell_at_door omitted it. (role is free text — there is
-- no CHECK constraint on partner_team_members.role.)
CREATE OR REPLACE FUNCTION public.can_sell_at_door(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT EXISTS (SELECT 1 FROM partners p WHERE p.id = p_org AND p.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM partner_team_members m
                   WHERE m.partner_id = p_org AND m.user_id = auth.uid()
                     AND COALESCE(m.is_active, true)
                     AND m.role IN ('owner','manager','scanner','cashier'));
$function$;

-- Voiding someone ELSE's sale is a cash-control question, not a convenience one:
-- a seller may undo their own mistake, a boss may undo anyone's.
CREATE OR REPLACE FUNCTION public.can_manage_door_sales(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT EXISTS (SELECT 1 FROM partners p WHERE p.id = p_org AND p.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM partner_team_members m
                   WHERE m.partner_id = p_org AND m.user_id = auth.uid()
                     AND COALESCE(m.is_active, true)
                     AND m.role IN ('owner','manager'));
$function$;

-- ── Void ────────────────────────────────────────────────────────────────────
-- Releasing tickets to 'available' is all the bookkeeping needed: both
-- sync_event_tickets_sold and update_tier_quantity_sold key off the status
-- transition, so counts unwind themselves. There is no ledger row to reverse
-- because a door sale never wrote one.
CREATE OR REPLACE FUNCTION public.void_box_office_order(
    p_intent_id uuid,
    p_reason    text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_intent record; v_org uuid; v_seller uuid; v_released integer;
BEGIN
    SELECT * INTO v_intent FROM purchase_intents WHERE id = p_intent_id FOR UPDATE;
    IF v_intent.id IS NULL THEN RAISE EXCEPTION 'That sale no longer exists'; END IF;

    -- Only door sales. An online sale involves real money at Xendit and must go
    -- through the refund flow, never a void.
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

    -- Hand the inventory back. Clearing purchase_intent_id also fires
    -- populate_ticket_guest_info's release branch, which wipes the buyer's name
    -- and email so a resold ticket can never carry a stranger's details.
    WITH released AS (
        UPDATE tickets
        SET status = 'available', purchase_intent_id = NULL, user_id = NULL,
            qr_code = NULL, held_until = NULL,
            checked_in_at = NULL, checked_in_by = NULL, updated_at = now()
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

-- ── Close-out ───────────────────────────────────────────────────────────────
-- The number staff counts the tin against. Deliberately splits money the
-- organizer is HOLDING (cash) from money that went to Xendit (QR), because only
-- the first should be in the envelope at the end of the night.
CREATE OR REPLACE FUNCTION public.get_box_office_summary(p_event_id uuid)
RETURNS TABLE (
    seller_id uuid, seller_name text,
    units integer, gross numeric,
    cash_amount numeric, terminal_amount numeric, bank_amount numeric,
    comp_units integer, online_amount numeric,
    voided_units integer, voided_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
    SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to view door sales for this event';
    END IF;

    RETURN QUERY
    SELECT
        s.sold_by,
        COALESCE(u.display_name, 'Unknown'),
        COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.quantity END), 0)::integer,
        COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'CASH'     THEN s.total_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'TERMINAL' THEN s.total_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'BANK'     THEN s.total_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'COMP'     THEN s.quantity END), 0)::integer,
        -- Anything not one of the four organizer-collected methods reached us
        -- through Xendit, so it is NOT in the tin.
        COALESCE(SUM(CASE WHEN s.status = 'completed'
                           AND s.payment_method NOT IN ('CASH','TERMINAL','BANK','COMP')
                          THEN s.total_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN s.quantity END), 0)::integer,
        COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN s.total_amount END), 0)::numeric
    FROM (
        SELECT pi.*, (pi.metadata ->> 'sold_by')::uuid AS sold_by
        FROM purchase_intents pi
        WHERE pi.event_id = p_event_id AND pi.source = 'box_office'
    ) s
    LEFT JOIN users u ON u.id = s.sold_by
    GROUP BY s.sold_by, u.display_name
    ORDER BY 4 DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_box_office_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_box_office_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_door_sales(uuid) TO authenticated;

-- ── Admit on sale ───────────────────────────────────────────────────────────
-- The 8-arg version is DROPped rather than left in place: adding a defaulted
-- 9th argument would create an overload, and every existing 8-arg call would
-- then be ambiguous.
DROP FUNCTION IF EXISTS public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_box_office_order(
    p_event_id uuid, p_quantity integer, p_tier_id uuid DEFAULT NULL,
    p_buyer_name text DEFAULT NULL, p_buyer_email text DEFAULT NULL,
    p_buyer_phone text DEFAULT NULL, p_payment_method text DEFAULT 'CASH',
    p_note text DEFAULT NULL,
    -- Defaults TRUE: the buyer is standing at the door. "Sell without admitting"
    -- is the exception (buying for a friend arriving later), not the rule.
    p_admit_now boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_org uuid; v_price numeric; v_intent uuid; v_tickets json; v_got integer;
    v_method text; v_seated boolean; v_status text;
    v_email text; v_name text; v_token uuid; v_event record;
    v_queued boolean := false; v_admitted integer := 0;
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

    SELECT EXISTS (SELECT 1 FROM tickets WHERE event_id = p_event_id AND seat_id IS NOT NULL)
    INTO v_seated;
    IF v_seated THEN
        RAISE EXCEPTION 'This event uses a seat map. Box office cannot assign seats yet.';
    END IF;

    IF v_method = 'COMP' THEN
        v_price := 0;
    ELSIF p_tier_id IS NOT NULL THEN
        SELECT price INTO v_price FROM ticket_tiers WHERE id = p_tier_id AND event_id = p_event_id;
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
        NULL, p_event_id, p_tier_id, p_quantity, v_price, v_price * p_quantity,
        0, v_price * p_quantity, 'completed', now(), now(),
        v_method, 'box_office', 'box_' || gen_random_uuid()::text,
        v_email, v_name, NULLIF(btrim(COALESCE(p_buyer_phone, '')), ''),
        jsonb_build_object('box_office', true, 'sold_by', auth.uid(),
                           'note', NULLIF(btrim(COALESCE(p_note, '')), ''))
    ) RETURNING id, access_token INTO v_intent, v_token;

    WITH picked AS (
        SELECT id FROM tickets
        WHERE event_id = p_event_id AND status = 'available'
          AND (p_tier_id IS NULL OR tier_id IS NULL OR tier_id = p_tier_id)
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

    SELECT issue_tickets(v_intent, NULL) INTO v_tickets;

    -- Walk them in. 'used' + checked_in_at is exactly what scan_ticket writes, so
    -- a door-sold guest is indistinguishable from a scanned one downstream, and
    -- re-scanning their QR correctly reports ALREADY SCANNED.
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
                    'total_amount', v_price * p_quantity,
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
        'total', v_price * p_quantity, 'payment_method', v_method,
        'ticket_url', '/t/' || v_token::text,
        'email_sent_to', CASE WHEN v_queued THEN v_email ELSE NULL END,
        'admitted', v_admitted,
        'tickets', v_tickets
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text, boolean) TO authenticated;
