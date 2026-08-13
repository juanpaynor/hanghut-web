-- Merch — Phase 1.4: standalone order money RPCs. Mirror reserve_experience /
-- confirm_experience_booking, with merch fees inheriting the partner's ticket
-- pricing (merch_fee_percentage → custom_percentage; merch_fixed_fee → 0).
--
-- Stock semantics: quantity_sold is decremented at CONFIRM (= paid), not at
-- reserve; reserve only checks availability. Small oversell window between two
-- concurrent unpaid orders is acceptable for merch (not seat-scarce).

-- reserve_merch: create a pending merch order + items, priced. Returns order id.
create or replace function public.reserve_merch(
    p_items jsonb,                       -- [{ variant_id, quantity }]
    p_user_id uuid default null,
    p_guest_email text default null,
    p_guest_name text default null,
    p_guest_phone text default null,
    p_event_id uuid default null,
    p_fulfillment_mode text default 'claim',
    p_shipping_address jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_item jsonb;
    v_variant record;
    v_qty integer;
    v_organizer uuid;
    v_subtotal numeric := 0;
    v_total_qty integer := 0;
    v_pct numeric;
    v_fixed numeric;
    v_pass boolean;
    v_full_take numeric;
    v_passed numeric;
    v_total numeric;
    v_order_id uuid;
begin
    if p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'No items';
    end if;
    if p_fulfillment_mode not in ('claim', 'ship') then
        p_fulfillment_mode := 'claim';
    end if;

    -- Pass 1: validate + price.
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then raise exception 'Invalid quantity'; end if;

        select mv.id, mv.price, mv.quantity_total, mv.quantity_sold, mv.is_active,
               mp.organizer_id, mp.is_active as product_active
        into v_variant
        from merch_variants mv
        join merch_products mp on mp.id = mv.product_id
        where mv.id = (v_item->>'variant_id')::uuid;

        if not found then raise exception 'Variant not found'; end if;
        if not v_variant.is_active or not v_variant.product_active then raise exception 'Item unavailable'; end if;
        if v_variant.quantity_total is not null and (v_variant.quantity_sold + v_qty) > v_variant.quantity_total then
            raise exception 'Out of stock';
        end if;

        if v_organizer is null then
            v_organizer := v_variant.organizer_id;
        elsif v_organizer <> v_variant.organizer_id then
            raise exception 'All items must be from the same organizer';
        end if;

        v_subtotal := v_subtotal + (v_variant.price * v_qty);
        v_total_qty := v_total_qty + v_qty;
    end loop;

    -- Fees: inherit the partner's ticket pricing unless a merch override is set.
    select coalesce(merch_fee_percentage, custom_percentage, 2.00),
           coalesce(merch_fixed_fee, 0),
           coalesce(merch_pass_fees_to_customer, pass_fees_to_customer, true)
    into v_pct, v_fixed, v_pass
    from partners where id = v_organizer;

    v_pct := coalesce(v_pct, 2.00);
    v_fixed := coalesce(v_fixed, 0);
    v_pass := coalesce(v_pass, true);

    v_full_take := round(v_subtotal * (v_pct / 100.0)) + round(v_fixed * v_total_qty);
    v_passed := case when v_pass then v_full_take else 0 end;
    v_total := v_subtotal + v_passed;

    insert into merch_orders (
        organizer_id, event_id, user_id, guest_email, guest_name, guest_phone,
        quantity, subtotal, platform_fee, total_amount, fee_percentage,
        fees_passed_to_customer, fulfillment_mode, shipping_address,
        status, xendit_external_id, expires_at
    ) values (
        v_organizer, p_event_id, p_user_id, p_guest_email, p_guest_name, p_guest_phone,
        v_total_qty, v_subtotal, v_passed, v_total, v_pct,
        v_pass, p_fulfillment_mode, p_shipping_address,
        'pending', 'mer_' || gen_random_uuid()::text, now() + interval '15 minutes'
    ) returning id into v_order_id;

    -- Pass 2: line items with name snapshots.
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := (v_item->>'quantity')::int;
        insert into merch_order_items (order_id, variant_id, product_id, name_snapshot, unit_price, quantity, line_total)
        select v_order_id, mv.id, mp.id,
               mp.name || ' — ' || mv.name, mv.price, v_qty, mv.price * v_qty
        from merch_variants mv join merch_products mp on mp.id = mv.product_id
        where mv.id = (v_item->>'variant_id')::uuid;
    end loop;

    return v_order_id;
end;
$$;

revoke all on function public.reserve_merch(jsonb, uuid, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.reserve_merch(jsonb, uuid, text, text, text, uuid, text, jsonb) to anon, authenticated, service_role;


-- confirm_merch_order: on payment success — mark paid, write payout ledger,
-- decrement stock, and generate the claim. Idempotent.
create or replace function public.confirm_merch_order(
    p_order_id uuid,
    p_payment_method text,
    p_xendit_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order record;
    v_fixed numeric;
    v_full_take numeric;
    v_payout numeric;
    v_claim_id uuid;
    v_claim_token uuid;
    v_email text;
    v_name text;
    v_it record;
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

    -- Payout: full take (HangHut revenue) recomputed; organizer keeps the rest
    -- plus whatever the buyer already covered (platform_fee = passed portion).
    select coalesce(merch_fixed_fee, 0) into v_fixed from partners where id = v_order.organizer_id;
    v_fixed := coalesce(v_fixed, 0);
    v_full_take := round(v_order.subtotal * (coalesce(v_order.fee_percentage, 2.00) / 100.0)) + round(v_fixed * v_order.quantity);
    v_payout := v_order.subtotal - v_full_take + coalesce(v_order.platform_fee, 0);

    insert into merch_transactions (
        organizer_id, merch_order_id, event_id, user_id,
        gross_amount, platform_fee, organizer_payout, status, xendit_transaction_id
    ) values (
        v_order.organizer_id, v_order.id, v_order.event_id, v_order.user_id,
        v_order.subtotal, v_full_take, v_payout, 'completed', p_xendit_id
    );

    -- Decrement stock (paid).
    update merch_variants mv
    set quantity_sold = mv.quantity_sold + oi.quantity
    from merch_order_items oi
    where oi.order_id = v_order.id and oi.variant_id = mv.id;

    -- Buyer identity for the claim.
    v_email := v_order.guest_email;
    v_name := v_order.guest_name;
    if v_email is null and v_order.user_id is not null then
        select email, coalesce(display_name, full_name) into v_email, v_name from users where id = v_order.user_id;
    end if;

    v_claim_token := gen_random_uuid();
    insert into merch_claims (
        claim_token, organizer_id, event_id, source, merch_order_id, user_id,
        buyer_email, buyer_name, fulfillment_mode, shipping_address,
        status
    ) values (
        v_claim_token, v_order.organizer_id, v_order.event_id, 'standalone', v_order.id, v_order.user_id,
        v_email, v_name, v_order.fulfillment_mode, v_order.shipping_address,
        case when v_order.fulfillment_mode = 'ship' then 'unclaimed' else 'unclaimed' end
    ) returning id into v_claim_id;

    insert into merch_claim_items (claim_id, variant_id, product_id, name_snapshot, quantity, unit_price)
    select v_claim_id, oi.variant_id, oi.product_id, oi.name_snapshot, oi.quantity, oi.unit_price
    from merch_order_items oi where oi.order_id = v_order.id;

    return jsonb_build_object('success', true, 'claim_token', v_claim_token);
end;
$$;

revoke all on function public.confirm_merch_order(uuid, text, text) from public;
grant execute on function public.confirm_merch_order(uuid, text, text) to authenticated, service_role;
