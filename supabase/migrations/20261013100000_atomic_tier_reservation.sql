-- Atomic GA inventory reservation.
--
-- THE HOLE
-- create-purchase-intent (deployed v123, byte-identical to the repo) gates tier
-- inventory in TypeScript:
--
--   line 379  .select('price, name, quantity_sold, quantity_total, …')
--   line 482  if (tier.quantity_sold + quantity > tier.quantity_total) → sold out
--   line 697  rpc('reserve_tickets', { p_event_id, p_user_id, p_quantity, … })
--
-- Three separate problems in those three lines:
--   1. No lock is held between the read and the claim.
--   2. reserve_tickets is never told WHICH TIER is being sold, so it could not
--      enforce tier inventory even in principle.
--   3. quantity_sold counts PAID tickets only, because tickets.tier_id is
--      stamped at issue_tickets (payment time). The compared value is therefore
--      blind to every checkout currently in flight.
--
-- Seated tiers are protected by the seat_holds UNIQUE constraint. GA tiers are
-- protected by nothing, and the oversell window is the full checkout duration.
--
-- THE FIX
-- Move the decision into one function that holds a lock across check-and-claim,
-- counts live reservations as well as confirmed sales, and stamps tier_id at
-- RESERVE time so the next caller can see this order.
--
-- Stamping alone would not be enough -- it only makes the count tier-scoped.
-- Correctness comes from three things together:
--   a. a lock on ONE row per price category (tier contention only; GA and VIP
--      never block each other),
--   b. counting tickets directly under that lock rather than reading the
--      quantity_sold cache, which an AFTER trigger has not written yet for
--      concurrent transactions,
--   c. expiry expressed as TIME (held_until > now()), so an abandoned cart
--      stops counting at its deadline without waiting for any sweeper.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- It does not close the anon issue_tickets hole. reserve_tickets keeps its
-- existing grants here so the deployed edge function keeps working; the public
-- EXECUTE revoke and the issue_tickets payment gate remain a separate, urgent
-- task. Do not read this migration as having fixed that.
--
-- SEQUENCING
-- Applying this migration alone changes nothing for tiered events, because
-- create-purchase-intent v123 passes no tier. The fix activates when the edge
-- function is redeployed to call reserve_tickets_for_tier with p_tier_id. That
-- is deliberate: the migration is safe to apply first and verify in isolation.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The one implementation.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_tickets_for_tier(
    p_event_id    uuid,
    p_quantity    integer,
    p_tier_id     uuid    DEFAULT NULL,
    p_user_id     uuid    DEFAULT NULL,
    p_guest_email text    DEFAULT NULL,
    p_guest_name  text    DEFAULT NULL,
    p_guest_phone text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_intent  uuid;
    v_price   numeric(10,2);
    v_cap     integer;
    v_taken   integer;
    v_claimed integer;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;

    -- Unchanged from the original: email is required for ticket delivery and
    -- the customer record. Same wording, so existing callers matching on the
    -- message keep behaving identically.
    IF p_guest_email IS NULL OR btrim(p_guest_email) = '' THEN
        RAISE EXCEPTION 'An email address is required to purchase.';
    END IF;

    IF p_tier_id IS NOT NULL THEN
        -- ── THE LOCK ──────────────────────────────────────────────────────
        -- One row per price category. Every buyer of this tier queues here and
        -- nowhere else, so a GA rush cannot block VIP checkouts.
        SELECT quantity_total, price
          INTO v_cap, v_price
          FROM ticket_tiers
         WHERE id = p_tier_id AND event_id = p_event_id
           FOR UPDATE;

        IF v_cap IS NULL THEN
            RAISE EXCEPTION 'Invalid Ticket Tier';
        END IF;

        -- ── TRUE INVENTORY ────────────────────────────────────────────────
        -- Confirmed sales AND live reservations. Counted from tickets, not
        -- from the quantity_sold cache: that column is maintained by an AFTER
        -- trigger, so inside this transaction it cannot reflect concurrent
        -- orders. pending_approval/approved stay counted exactly as the
        -- trigger counts them today, so approval events are unaffected.
        SELECT count(*)
          INTO v_taken
          FROM tickets t
         WHERE t.event_id = p_event_id
           AND t.tier_id  = p_tier_id
           AND (
                 t.status::text IN ('valid','used','pending_approval','approved')
                 OR (t.status::text = 'reserved' AND t.held_until > now())
               );

        IF v_taken + p_quantity > v_cap THEN
            RAISE EXCEPTION 'Selected ticket tier is sold out (% of % remaining)',
                greatest(v_cap - v_taken, 0), v_cap;
        END IF;
    ELSE
        SELECT capacity, ticket_price
          INTO v_cap, v_price
          FROM events
         WHERE id = p_event_id
           FOR UPDATE;

        IF v_cap IS NULL THEN
            RAISE EXCEPTION 'Event not found';
        END IF;

        -- Event capacity is gated ONLY for a genuinely tier-less event.
        --
        -- Two reasons not to gate a tiered event here. First, this is the shape
        -- the CURRENT caller uses -- create-purchase-intent v123 passes no tier
        -- even for tiered events -- so gating would change live behaviour
        -- before the edge function is updated. Second, 13 live events have
        -- tiers whose quantity_total sums ABOVE events.capacity; capacity is
        -- often a venue estimate while the tiers are the real allocation, so
        -- refusing those sales would override a deliberate configuration.
        --
        -- For a tier-less event, capacity is the only limit there is -- and it
        -- must be checked explicitly, because the blank ticket pool is NOT a
        -- capacity gate: mint_event_tickets mints on capacity increase and
        -- never prunes on decrease, leaving (for example) one event with
        -- capacity 23 and 15,000 available pool rows.
        IF NOT EXISTS (
            SELECT 1 FROM ticket_tiers
             WHERE event_id = p_event_id AND is_active IS NOT FALSE
        ) THEN
            SELECT count(*)
              INTO v_taken
              FROM tickets t
             WHERE t.event_id = p_event_id
               AND (
                     t.status::text IN ('valid','used','pending_approval','approved')
                     OR (t.status::text = 'reserved' AND t.held_until > now())
                   );

            IF v_taken + p_quantity > v_cap THEN
                RAISE EXCEPTION 'Not enough tickets available (% of % remaining)',
                    greatest(v_cap - v_taken, 0), v_cap;
            END IF;
        END IF;
    END IF;

    -- ── INTENT ────────────────────────────────────────────────────────────
    -- Deliberately identical to the original, including pricing from
    -- events.ticket_price and the placeholder 10% fee: create-purchase-intent
    -- overwrites every money column immediately afterwards with the real
    -- waterfall. Changing it here would be an unrelated money-path change.
    -- The one addition is stamping tier_id, which the caller previously set in
    -- that follow-up UPDATE.
    SELECT ticket_price INTO v_price FROM events WHERE id = p_event_id;

    INSERT INTO purchase_intents (
        user_id, event_id, tier_id, quantity, unit_price, subtotal,
        platform_fee, total_amount, status, expires_at,
        xendit_external_id, guest_email, guest_name, guest_phone
    ) VALUES (
        p_user_id, p_event_id, p_tier_id, p_quantity, v_price,
        v_price * p_quantity,
        (v_price * p_quantity) * 0.10,
        (v_price * p_quantity) * 1.10,
        'pending',
        now() + interval '15 minutes',
        'intent_' || gen_random_uuid()::text,
        p_guest_email, p_guest_name, p_guest_phone
    ) RETURNING id INTO v_intent;

    -- ── CLAIM, STAMPING THE TIER ──────────────────────────────────────────
    -- SKIP LOCKED stays: the tier lock above already serialized the DECISION,
    -- so the pool is only row supply and contention here is not a correctness
    -- question. tier_id is assigned (not COALESCEd) so a recycled pool row
    -- carrying a stale tier_id is corrected rather than inherited.
    WITH pick AS (
        SELECT t.id
          FROM tickets t
         WHERE t.event_id = p_event_id
           AND t.status = 'available'
         LIMIT p_quantity
           FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE tickets t
           SET status             = 'reserved',
               purchase_intent_id = v_intent,
               tier_id            = p_tier_id,
               held_until         = now() + interval '15 minutes',
               updated_at         = now()
         WHERE t.id IN (SELECT id FROM pick)
        RETURNING t.id
    )
    SELECT count(*) INTO v_claimed FROM claimed;

    IF v_claimed < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets available (Requested %, Got %)',
            p_quantity, v_claimed;
    END IF;

    RETURN v_intent;
END;
$$;

-- Service role only. The deployed edge functions run as service_role; this is
-- deliberately NOT granted to anon or authenticated.
REVOKE ALL ON FUNCTION public.reserve_tickets_for_tier(uuid,integer,uuid,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_tickets_for_tier(uuid,integer,uuid,uuid,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_tickets_for_tier(uuid,integer,uuid,uuid,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tickets_for_tier(uuid,integer,uuid,uuid,text,text,text) TO service_role;

COMMENT ON FUNCTION public.reserve_tickets_for_tier(uuid,integer,uuid,uuid,text,text,text) IS
    'Atomic ticket reservation. Locks the tier row (or the event row when the '
    'event is tier-less), counts confirmed sales AND live reservations under '
    'that lock, then claims pool rows stamping tier_id so in-flight orders are '
    'visible to the next caller. service_role only.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The existing 6-arg signature keeps working, with ONE implementation
--    behind it. create-purchase-intent v123 keeps calling this until it is
--    redeployed; passing no tier means tiered events behave exactly as today.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_event_id    uuid,
    p_user_id     uuid,
    p_quantity    integer,
    p_guest_email text DEFAULT NULL,
    p_guest_name  text DEFAULT NULL,
    p_guest_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT public.reserve_tickets_for_tier(
        p_event_id, p_quantity, NULL, p_user_id,
        p_guest_email, p_guest_name, p_guest_phone
    );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Legacy overloads, dropped.
--    The 3-arg reserve_tickets is anon-executable and skips the email
--    requirement entirely. It has no caller in the repository.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reserve_tickets(uuid, uuid, integer);

--    The 4-arg assign_seats_to_intent predates session verification and uses
--    older hold semantics (`expires_at > now()` with no grace, no check that
--    the BUYER still holds the seats). service_role only and no caller, so it
--    cannot be reached today -- but it is a bypass of the current protections
--    sitting one typo away from being used.
DROP FUNCTION IF EXISTS public.assign_seats_to_intent(uuid, uuid, integer, uuid[]);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. quantity_sold must keep meaning CONFIRMED sales.
--    Now that tier_id is stamped at reserve time, 'reserved' rows would start
--    inflating it -- and payouts, reports and the "N left" copy all read it as
--    sold. Excluding 'reserved' keeps today's meaning exactly.
--
--    DATA IMPACT: NONE. Reserved rows carry tier_id NULL today (verified: 2
--    reserved rows, 0 with a tier), so recounting every tier produces
--    identical numbers.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_tier_quantity_sold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tier_id UUID;
    v_sold_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tier_id := OLD.tier_id;
    ELSE
        v_tier_id := COALESCE(NEW.tier_id, OLD.tier_id);
    END IF;

    IF v_tier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 'reserved' added: an in-flight checkout is not a sale. Live reservations
    -- are accounted for inside reserve_tickets_for_tier, under the tier lock.
    SELECT COUNT(*) INTO v_sold_count
      FROM tickets
     WHERE tier_id = v_tier_id
       AND status NOT IN ('available', 'cancelled', 'refunded', 'reserved');

    UPDATE ticket_tiers
       SET quantity_sold = v_sold_count
     WHERE id = v_tier_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. The sweeper must fully reset a recycled pool row.
--    It currently clears neither tier_id nor held_until, which is why prod
--    carries 12 'available' rows with a stale tier_id and 608 with a stale
--    held_until. Harmless under the availability formula above, but both
--    columns are now load-bearing, so a recycled row must come back clean.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_purchase_intents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_expired RECORD;
    v_seats   INTEGER;
BEGIN
    FOR v_expired IN
        SELECT id, event_id, quantity
          FROM purchase_intents
         WHERE status = 'pending'
           AND expires_at IS NOT NULL
           AND expires_at < now()
    LOOP
        UPDATE purchase_intents
           SET status = 'expired'
         WHERE id = v_expired.id;

        UPDATE tickets
           SET status             = 'available',
               user_id            = NULL,
               purchase_intent_id = NULL,
               tier_id            = NULL,   -- new: stop a dead order counting
               held_until         = NULL,   -- new: no stale deadline
               updated_at         = now()
         WHERE purchase_intent_id = v_expired.id
           AND status = 'reserved';

        DELETE FROM seat_holds
         WHERE session_id = v_expired.id::text;
        GET DIAGNOSTICS v_seats = ROW_COUNT;

        RAISE LOG 'Expired stale intent % for event %, released % tickets and % seat hold(s)',
            v_expired.id, v_expired.event_id, v_expired.quantity, v_seats;
    END LOOP;
END;
$$;
