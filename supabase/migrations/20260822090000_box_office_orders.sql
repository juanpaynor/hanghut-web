-- Box office: sell a ticket at the door, where the ORGANIZER takes the money.
--
-- The distinction that matters is not cash-vs-card, it is WHO COLLECTED. If the
-- buyer pays by QR or card through a HangHut payment link, that is an ordinary
-- online sale started from the box-office screen — normal fees, normal ledger,
-- normal payout, and it goes through create-purchase-intent like any other.
-- This function is for the other case: cash in a tin, or the venue's own card
-- terminal. That money never touches Xendit or us.
--
-- Consequences of that, all deliberate:
--   * platform_fee = 0. We cannot collect a commission on money we never
--     handled, so no 2% and no ₱15 booking fee (user decision, 2026-08-22).
--   * NO `transactions` ledger row. A cash sale in the payout balance would let
--     an organizer withdraw money HangHut never received. Door sales show up in
--     attendee lists and ticket counts (which come from `tickets`), and nowhere
--     near the withdrawable balance.
--   * The intent is born `completed` — there is nothing to wait for.
--
-- Inventory, tier counts and tickets_sold are NOT touched here on purpose:
-- trg_sync_event_tickets_sold and trigger_update_tier_quantity_sold already
-- maintain them from the `tickets` rows, so doing it again would double count.

-- ── Two live CHECK constraints have to widen first ──────────────────────────
--
-- 1. purchase_intents_source_check allowed only web/app/embed/api. A door sale
--    is genuinely a fifth origin and mislabelling it 'web' would corrupt the
--    channel reporting that marketing attribution reads.
--
-- 2. check_purchaser_identity demanded a user_id OR (guest_email AND guest_name).
--    That is right for online checkout — you cannot deliver a ticket you can't
--    email. At a door it is wrong: a walk-in paying cash often will not give an
--    address, and staff under pressure will type `a@a.com` to get past the form.
--    Fake addresses are worse than none: the canonical customer key across this
--    codebase is the lowercased email, so junk here poisons customer analytics,
--    newsletter lists and win-back automations.
--    So a box_office intent may carry a NAME ONLY. Email stays optional and is
--    used solely to email the ticket when the buyer wants it.
--
-- Both are WIDENING changes, so every existing row still satisfies them.

ALTER TABLE public.purchase_intents DROP CONSTRAINT IF EXISTS purchase_intents_source_check;
ALTER TABLE public.purchase_intents ADD CONSTRAINT purchase_intents_source_check
    CHECK (source IS NULL OR source = ANY (ARRAY['web','app','embed','api','box_office']));

ALTER TABLE public.purchase_intents DROP CONSTRAINT IF EXISTS check_purchaser_identity;
ALTER TABLE public.purchase_intents ADD CONSTRAINT check_purchaser_identity
    CHECK (
        user_id IS NOT NULL
        OR (guest_email IS NOT NULL AND guest_name IS NOT NULL)
        -- Door sales: a name is enough. See note above on why we refuse to
        -- manufacture an email just to satisfy a form.
        OR (source = 'box_office' AND guest_name IS NOT NULL)
    );

-- ── Pre-existing bug this feature would otherwise inherit ───────────────────
--
-- populate_ticket_guest_info() copies the buyer's name/email from the intent
-- onto the ticket, but its trigger is BEFORE INSERT only. Tickets are PRE-MINTED
-- (mint_event_tickets creates them as 'available' long before anyone buys), so
-- a purchase never inserts a ticket row — it UPDATEs one. The trigger has
-- therefore never fired for a real sale: all 47 live guest tickets on this
-- database have guest_name = NULL and guest_email = NULL.
--
-- The attendee list papers over it by falling back to purchase_intents, but a
-- box-office sale with no email would slip through that fallback's guard and
-- show a nameless attendee. Fix the cause rather than adding a second patch.
DROP TRIGGER IF EXISTS trigger_populate_ticket_guest_info ON public.tickets;

CREATE OR REPLACE FUNCTION public.populate_ticket_guest_info()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_guest_name  text;
    v_guest_email text;
BEGIN
    -- Releasing a ticket back to the pool must not leave the previous almost-buyer's
    -- details on it, or a resold ticket would carry a stranger's name.
    IF NEW.purchase_intent_id IS NULL THEN
        NEW.guest_name  := NULL;
        NEW.guest_email := NULL;
        RETURN NEW;
    END IF;

    IF NEW.user_id IS NULL AND (NEW.guest_name IS NULL OR NEW.guest_email IS NULL) THEN
        SELECT guest_name, guest_email INTO v_guest_name, v_guest_email
        FROM public.purchase_intents WHERE id = NEW.purchase_intent_id;

        IF v_guest_name  IS NOT NULL THEN NEW.guest_name  := v_guest_name;  END IF;
        IF v_guest_email IS NOT NULL THEN NEW.guest_email := v_guest_email; END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_populate_ticket_guest_info
    BEFORE INSERT OR UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.populate_ticket_guest_info();

-- Backfill the tickets the broken trigger never populated.
UPDATE public.tickets t
SET guest_name  = COALESCE(t.guest_name,  i.guest_name),
    guest_email = COALESCE(t.guest_email, i.guest_email)
FROM public.purchase_intents i
WHERE i.id = t.purchase_intent_id
  AND t.user_id IS NULL
  AND (t.guest_name IS NULL OR t.guest_email IS NULL)
  AND (i.guest_name IS NOT NULL OR i.guest_email IS NOT NULL);

-- Who may ring up a door sale. Deliberately wider than is_org_member(), which is
-- owner/manager only: the people physically working the door are the scanner
-- role, and they already hold the scanner.
CREATE OR REPLACE FUNCTION public.can_sell_at_door(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM partners p WHERE p.id = p_org AND p.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM partner_team_members m
        WHERE m.partner_id = p_org
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'manager', 'scanner')
    );
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
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 20';
    END IF;

    -- A name is the one thing we insist on: it is what check_purchaser_identity
    -- keys the door-sale exemption off, and it is all the door staff has to
    -- match a person to a ticket. Email stays optional on purpose.
    IF NULLIF(btrim(COALESCE(p_buyer_name, '')), '') IS NULL THEN
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
    -- Better to refuse loudly than to hand over a mystery seat.
    SELECT EXISTS (
        SELECT 1 FROM tickets WHERE event_id = p_event_id AND seat_id IS NOT NULL
    ) INTO v_seated;
    IF v_seated THEN
        RAISE EXCEPTION 'This event uses a seat map. Box office cannot assign seats yet.';
    END IF;

    -- Price. A comp is free by definition; otherwise the tier price, falling back
    -- to the event's headline price.
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
        NULL,                      -- a walk-in has no account; both columns are nullable
        p_event_id, p_tier_id, p_quantity, v_price, v_price * p_quantity,
        0,                         -- see header: no commission on money we never touched
        v_price * p_quantity,
        'completed', now(), now(), -- born settled; there is nothing to wait for
        v_method, 'box_office',
        'box_' || gen_random_uuid()::text,
        NULLIF(btrim(COALESCE(p_buyer_email, '')), ''),
        NULLIF(btrim(COALESCE(p_buyer_name,  '')), ''),
        NULLIF(btrim(COALESCE(p_buyer_phone, '')), ''),
        jsonb_build_object(
            'box_office', true,
            'sold_by',    auth.uid(),
            'note',       NULLIF(btrim(COALESCE(p_note, '')), '')
        )
    ) RETURNING id INTO v_intent;

    -- Claim inventory with the same discipline as the online path: SKIP LOCKED so
    -- two people selling at the door simultaneously can't hand out the same seat.
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
        -- Raising rolls back the intent too, so a short sale leaves nothing behind.
        RAISE EXCEPTION 'Not enough tickets left (asked for %, only % available)',
            p_quantity, v_got;
    END IF;

    -- Reuse the exact minting path the online checkout uses: same ticket numbers,
    -- same QR format, same scanner behaviour. generate_qr_code already encodes a
    -- null buyer as 'GUEST', so a walk-in ticket scans like any other.
    SELECT issue_tickets(v_intent, NULL) INTO v_tickets;

    RETURN jsonb_build_object(
        'intent_id',      v_intent,
        'quantity',       p_quantity,
        'unit_price',     v_price,
        'total',          v_price * p_quantity,
        'payment_method', v_method,
        'tickets',        v_tickets
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_sell_at_door(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_box_office_order(uuid, integer, uuid, text, text, text, text, text) IS
  'Issues tickets for a door sale the ORGANIZER collected (cash / their own terminal / comp). platform_fee = 0 and no transactions row: HangHut never handled the money, so it must never reach the withdrawable payout balance. Card/QR paid through a HangHut link is NOT this — that is an ordinary sale via create-purchase-intent.';
