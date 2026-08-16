-- Merch money-path correctness, part 1 of 2.
--
-- THREE FIXES, all inside confirm_merch_order:
--
-- 1. THE XENDIT PROCESSING FEE WAS NEVER DEDUCTED.
--    merch_transactions.payment_processing_fee exists and was left NULL/0 on every
--    sale, so organizer_payout overstated by the full Xendit cut (~2-3%). The event
--    path has always deducted it. The fee schedule lives in TypeScript
--    (PROCESSING_FEE_RATES, mirrored in xendit-webhook + src/lib/payment/processing-fees.ts)
--    and is deliberately NOT duplicated here — one table, one source of truth. The
--    webhook computes it from the resolved payment method and passes it in.
--
-- 2. users.full_name DOES NOT EXIST (the column is display_name; full_name lives only
--    on waitlist / partner_subscribers). The old body ran
--        select email, coalesce(display_name, full_name) ... from users
--    which throws 42703. It was unreachable only because create-merch-intent always
--    populates guest_email (falling back to user.email) — but the webhook does
--    `throw new Error(merchError.message)` on RPC failure, AFTER Xendit has captured
--    payment. Had that branch ever run: money taken, no stock decrement, no claim
--    record, no buyer email, and a webhook that keeps retrying into the same error.
--
-- 3. Signature change is a DROP + CREATE, not CREATE OR REPLACE. Adding a defaulted
--    4th argument would register an OVERLOAD, leaving the old 3-arg version callable —
--    and PostgREST resolves by named arguments, so the deployed webhook would have kept
--    silently hitting the buggy one. Dropping first makes the swap total.
--
-- NO VAT LINE IS ADDED, deliberately: create-merch-intent sends NO inline
-- `fees: [{ type: 'PLATFORM' }]` (it uses the legacy `with-split-rule` header), so
-- Xendit charges no platform fee on merch and therefore no 12% VAT on one. Adding a
-- VAT deduction here would invent a charge that does not exist — the same bug just
-- fixed for main-wallet partners on the event path.
--
-- Safe to apply: all 4 existing merch_orders belong to internal test partners and
-- merch checkout is still switched off.

DROP FUNCTION IF EXISTS public.confirm_merch_order(uuid, text, text);

CREATE OR REPLACE FUNCTION public.confirm_merch_order(
    p_order_id uuid,
    p_payment_method text,
    p_xendit_id text,
    p_processing_fee numeric DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_order record;
    v_fixed numeric;
    v_full_take numeric;
    v_processing numeric;
    v_payout numeric;
    v_claim_id uuid;
    v_claim_token uuid;
    v_email text;
    v_name text;
begin
    select * into v_order from merch_orders where id = p_order_id;
    if v_order is null then
        return jsonb_build_object('success', false, 'message', 'Order not found');
    end if;
    if v_order.status in ('completed', 'refunded') then
        return jsonb_build_object('success', true, 'message', 'Already ' || v_order.status);
    end if;

    update merch_orders
    set status = 'completed', paid_at = now(), payment_method = p_payment_method, updated_at = now()
    where id = p_order_id;

    select coalesce(merch_fixed_fee, 0) into v_fixed from partners where id = v_order.organizer_id;
    v_fixed := coalesce(v_fixed, 0);
    v_full_take := round(v_order.subtotal * (coalesce(v_order.fee_percentage, 2.00) / 100.0))
                 + round(v_fixed * v_order.quantity);

    -- Never let a bad/absent value silently become a credit to the organizer.
    v_processing := greatest(coalesce(p_processing_fee, 0), 0);

    -- + platform_fee adds back the take when it was passed on to the buyer (the buyer
    -- paid subtotal + platform_fee), so the organizer nets their subtotal either way.
    -- Processing is always organizer-absorbed, exactly as on the event path.
    v_payout := v_order.subtotal - v_full_take + coalesce(v_order.platform_fee, 0) - v_processing;

    insert into merch_transactions (
        organizer_id, merch_order_id, event_id, user_id,
        gross_amount, platform_fee, payment_processing_fee, organizer_payout,
        status, xendit_transaction_id
    ) values (
        v_order.organizer_id, v_order.id, v_order.event_id, v_order.user_id,
        v_order.subtotal, v_full_take, v_processing, v_payout,
        'completed', p_xendit_id
    );

    update merch_variants mv
    set quantity_sold = mv.quantity_sold + oi.quantity
    from merch_order_items oi
    where oi.order_id = v_order.id and oi.variant_id = mv.id;

    v_email := v_order.guest_email;
    v_name := v_order.guest_name;
    if v_email is null and v_order.user_id is not null then
        -- display_name only. See note 2 above.
        select email, display_name into v_email, v_name from users where id = v_order.user_id;
    end if;

    v_claim_token := gen_random_uuid();
    insert into merch_claims (
        claim_token, organizer_id, event_id, source, merch_order_id, user_id,
        buyer_email, buyer_name, fulfillment_mode, shipping_address, status
    ) values (
        v_claim_token, v_order.organizer_id, v_order.event_id, 'standalone', v_order.id, v_order.user_id,
        v_email, v_name, v_order.fulfillment_mode, v_order.shipping_address, 'unclaimed'
    ) returning id into v_claim_id;

    insert into merch_claim_items (claim_id, variant_id, product_id, name_snapshot, quantity, unit_price)
    select v_claim_id, oi.variant_id, oi.product_id, oi.name_snapshot, oi.quantity, oi.unit_price
    from merch_order_items oi where oi.order_id = v_order.id;

    return jsonb_build_object('success', true, 'claim_token', v_claim_token);
end;
$function$;

-- Financial SECURITY DEFINER function: CREATE grants EXECUTE to PUBLIC by default,
-- so a REVOKE naming only anon/authenticated would leave it world-callable.
REVOKE ALL ON FUNCTION public.confirm_merch_order(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_merch_order(uuid, text, text, numeric) TO service_role;
