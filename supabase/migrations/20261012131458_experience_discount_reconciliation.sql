-- ─────────────────────────────────────────────────────────────────────────────
-- P0 — a promo code on an experience pays the host more than HangHut collected.
--
-- ROOT CAUSE. Two functions compute the same fee from two different bases.
--   reserve_experience  charges the percentage on the DISCOUNTED net (correct,
--                       and deliberate — its own comment says so).
--   confirm_experience_booking  recomputed it on the PRE-discount subtotal and
--                       never referenced discount_amount at all.
--
-- The invariant that breaks: for a completed booking,
--     host_payout + HangHut's take  ==  what the buyer actually paid.
--   correct:  (net − take + passed) + take        = net + passed  = total ✓
--   before:   (subtotal − take' + passed) + take' = subtotal + passed
--                                                 = total + discount ✗
-- The ledger asserted that `total + discount` came in when only `total` did,
-- so the promotional discount was funded by HANGHUT instead of by the host who
-- issued the code.
--
-- Worked example — ₱2,000 experience, 4% host, ₱500 promo, 1 guest:
--     buyer pays ............. 1,500 + 15  = ₱1,515
--     correct host payout .... 1,500 − 75 + 15 = ₱1,440   HangHut  +₱75
--     actual  host payout .... 2,000 − 95 + 15 = ₱1,920   HangHut  −₱405
--     host overpaid by ....... ₱480  (≈ the whole discount)
--
-- BLAST RADIUS: NONE. Verified on prod before writing —
--     experience_purchase_intents ....... 8   (4 completed, all ₱0.00 free)
--     with promo_code_id ................ 0
--     with discount_amount > 0 .......... 0
--     experience_transactions ........... 0   rows, ever
-- confirm_experience_booking's money block has never executed on prod. Nothing
-- to remediate and nothing to back out. But the path is armed: promo codes on
-- experiences shipped 2026-08-31 and reserve_experience prices them today.
--
-- WHO FUNDS A DISCOUNT — verified, not assumed. On five discounted EVENT sales
-- the recorded organizer_payout matches `gross − discount − fees` and is
-- nowhere near `gross − fees`:
--     gross 700 · discount 200 · ppf 16.80 · vat 2
--       actual organizer_payout .. 481.00
--       if the HOST funds it ..... 481.20  ← matches (0.20 = whole-peso rounding)
--       if HANGHUT funds it ...... 681.20  ← not this
-- The host grants the code, so the host funds it. Experiences now match.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1 ─ Record the discount on the ledger row.
--
-- numeric(10,2) to match every other money column on this table (gross_amount,
-- platform_fee, host_payout are all 10,2). NOT NULL DEFAULT 0 so the OTHER
-- writer — the refund path in the request-refund edge function — keeps working
-- untouched: it inserts no discount and correctly gets 0.
--
-- The constraint is >= 0 ONLY. It is deliberately NOT bounded by gross_amount:
-- request-refund writes REVERSAL rows with a NEGATIVE gross_amount
-- (gross_amount: -refundAmount), so `discount_amount <= gross_amount` would
-- evaluate 0 <= -500 and reject every refund.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.experience_transactions
    ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.experience_transactions
    DROP CONSTRAINT IF EXISTS experience_transactions_discount_check;

ALTER TABLE public.experience_transactions
    ADD CONSTRAINT experience_transactions_discount_check
    CHECK (discount_amount >= 0);

COMMENT ON COLUMN public.experience_transactions.discount_amount IS
    'Promo discount the HOST granted, in the same units as gross_amount. gross_amount stays the PRE-discount list amount, matching public.transactions, so the two ledgers mean the same thing by the same column name.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2 ─ confirm_experience_booking: price off the net, and record the discount.
--
-- ALSO ALIGNS THE platform_fee CONVENTION, which the two ledgers had backwards
-- from each other. Verified against prod:
--
--   EVENTS  (transactions)            — platform_fee is the ABSORBED portion.
--     A passed-fee sale reads: gross 350, platform_fee 0.00, fixed_fee 15,
--     buyer_paid 365. Zero, because the BUYER paid that ₱15, not the organizer.
--     fee-model.ts states the same: "HangHut's take that the ORGANIZER
--     absorbed. Zero when passed to the buyer."
--
--   EXPERIENCES (before this change)  — platform_fee was the FULL take
--     (v_real_platform_revenue), whatever the buyer had already paid.
--
-- That mattered because the payout statement sums both ledgers into one
-- `combined` total, so experiences would have overstated fees against events.
-- With platform_fee as the absorbed portion, an experience row reconciles with
-- the SAME waterfall as an event row and computeFees() needs no special case:
--
--     host_payout  ==  gross_amount − discount_amount − platform_fee
--
-- Safe to redefine: experience_transactions has ZERO rows, and the only reader
-- of the column that affects money — get_partner_balance — sums host_payout,
-- not platform_fee.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_experience_booking(
    p_intent_id uuid,
    p_payment_method text,
    p_xendit_id text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_intent      RECORD;
    v_host_id     UUID;
    v_partner_id  UUID;
    v_fixed_fee   DECIMAL(10,2);
    v_pct         DECIMAL(5,2);
    v_discount    DECIMAL(10,2);
    v_net         DECIMAL(10,2);
    v_full_take   DECIMAL(10,2);
    v_passed      DECIMAL(10,2);
    v_absorbed    DECIMAL(10,2);
    v_host_payout DECIMAL(10,2);
BEGIN
    SELECT * INTO v_intent FROM public.experience_purchase_intents WHERE id = p_intent_id;

    IF v_intent IS NULL OR v_intent.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Intent not found or already completed');
    END IF;

    UPDATE public.experience_purchase_intents
    SET status = 'completed', paid_at = NOW(), payment_method = p_payment_method
    WHERE id = p_intent_id;

    -- Only real accounts join the roster. A manually-booked walk-in has no user_id
    -- and is tracked by guest_name on the intent instead.
    IF v_intent.user_id IS NOT NULL THEN
        INSERT INTO public.table_participants (table_id, user_id, status)
        VALUES (v_intent.table_id, v_intent.user_id, 'confirmed')
        ON CONFLICT (table_id, user_id) DO NOTHING;
    END IF;

    SELECT host_id, partner_id INTO v_host_id, v_partner_id
    FROM public.tables WHERE id = v_intent.table_id;

    SELECT COALESCE(fixed_fee_per_ticket, 15.00) INTO v_fixed_fee
    FROM public.partners WHERE id = v_partner_id;
    v_fixed_fee := COALESCE(v_fixed_fee, 15.00);

    -- Percentage is read back from the INTENT, not the partner, so a settings
    -- change between reserve and confirm cannot move the price after the fact.
    -- (The fixed fee has no such snapshot — there is nowhere on the intent to
    -- store it — which remains a latent drift, documented but out of scope for
    -- this P0. It is clamped below so it can never produce a negative fee.)
    v_pct := COALESCE(v_intent.fee_percentage, 2.00);

    -- ── THE FIX ──────────────────────────────────────────────────────────
    -- Everything prices off the net, exactly as reserve_experience charged it.
    v_discount  := COALESCE(v_intent.discount_amount, 0);
    v_net       := v_intent.subtotal - v_discount;
    v_full_take := ROUND(v_net * (v_pct / 100.0)) + ROUND(v_fixed_fee * v_intent.quantity);

    -- experience_purchase_intents.platform_fee stores the portion of the take
    -- the BUYER was charged on top (v_passed_portion in reserve_experience) —
    -- an unfortunate column name, but changing it would touch the money path
    -- for no gain. What the host absorbs is the remainder.
    v_passed   := COALESCE(v_intent.platform_fee, 0);
    v_absorbed := GREATEST(v_full_take - v_passed, 0);

    v_host_payout := v_net - v_absorbed;

    INSERT INTO public.experience_transactions (
        purchase_intent_id, table_id, host_id, user_id,
        gross_amount, discount_amount, platform_fee, host_payout,
        xendit_transaction_id, status, partner_id
    ) VALUES (
        v_intent.id, v_intent.table_id, v_host_id, v_intent.user_id,
        -- gross stays PRE-discount, with the discount beside it, so this table
        -- agrees with public.transactions on what gross_amount means.
        v_intent.subtotal, v_discount, v_absorbed, v_host_payout,
        p_xendit_id, 'completed', v_partner_id
    );

    RETURN jsonb_build_object('success', true);
END;
$function$;

COMMENT ON FUNCTION public.confirm_experience_booking(uuid, text, text) IS
    'Completes a paid experience booking and writes the ledger row. Prices off the DISCOUNTED net so the host funds their own promo; platform_fee is the portion the host absorbed, matching public.transactions, so host_payout = gross_amount - discount_amount - platform_fee.';
