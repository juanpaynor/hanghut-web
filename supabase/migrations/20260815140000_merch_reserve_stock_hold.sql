-- Merch: hold stock during checkout so a limited drop cannot oversell.
--
-- BEFORE: reserve_merch checked (quantity_sold + qty) > quantity_total, but
-- quantity_sold only moves at CONFIRM (= paid). Nothing was held while an order
-- sat pending, so N concurrent buyers could all clear the check for the last
-- unit and the slowest payers would be charged for stock that was already gone.
-- The original migration called that acceptable "for merch (not seat-scarce)";
-- that is the wrong trade for an album-launch style limited drop.
--
-- AFTER: live pending orders count against stock. Because the reservation is
-- scoped to `expires_at > now()`, abandoned carts release themselves — no
-- sweeper/cron is required for correctness.
--
-- Concurrency: the variant row is locked FOR UPDATE before the availability
-- check, so two simultaneous reservations serialise instead of both reading a
-- stale reserved count.

CREATE OR REPLACE FUNCTION public.reserve_merch(p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_event_id uuid DEFAULT NULL::uuid, p_fulfillment_mode text DEFAULT 'claim'::text, p_shipping_address jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_item jsonb;
    v_variant record;
    v_qty integer;
    v_reserved integer;
    v_organizer uuid;
    v_subtotal numeric := 0;
    v_total_qty integer := 0;
    v_pct numeric;
    v_fixed numeric;
    v_pass boolean;
    v_merch_enabled boolean;
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

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then raise exception 'Invalid quantity'; end if;

        -- Lock the variant so concurrent reservations serialise on it.
        select mv.id, mv.price, mv.quantity_total, mv.quantity_sold, mv.is_active,
               mp.organizer_id, mp.is_active as product_active
        into v_variant
        from merch_variants mv
        join merch_products mp on mp.id = mv.product_id
        where mv.id = (v_item->>'variant_id')::uuid
        for update of mv;

        if not found then raise exception 'Variant not found'; end if;
        if not v_variant.is_active or not v_variant.product_active then raise exception 'Item unavailable'; end if;

        -- Stock held by other live (unexpired, unpaid) carts.
        select coalesce(sum(oi.quantity), 0) into v_reserved
        from merch_order_items oi
        join merch_orders o on o.id = oi.order_id
        where oi.variant_id = v_variant.id
          and o.status = 'pending'
          and o.expires_at > now();

        if v_variant.quantity_total is not null
           and (v_variant.quantity_sold + v_reserved + v_qty) > v_variant.quantity_total then
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

    select coalesce(merch_fee_percentage, custom_percentage, 2.00),
           coalesce(merch_fixed_fee, 0),
           coalesce(merch_pass_fees_to_customer, pass_fees_to_customer, true),
           merch_enabled
    into v_pct, v_fixed, v_pass, v_merch_enabled
    from partners where id = v_organizer;

    -- Feature gate: merch must be enabled for this organizer.
    if not coalesce(v_merch_enabled, false) then
        raise exception 'Merch is not enabled for this organizer';
    end if;

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
$function$;

-- Public read for the storefront/event page: how much stock is currently held by
-- live carts. Without this the UI computes sold-out from quantity_sold alone and
-- keeps offering an item that reserve_merch will now reject at checkout.
-- SECURITY DEFINER because merch_orders is not readable by anon.
CREATE OR REPLACE FUNCTION public.get_merch_reserved_counts(p_variant_ids uuid[])
 RETURNS TABLE(variant_id uuid, reserved int)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT v.id,
           coalesce((
             SELECT sum(oi.quantity)::int
               FROM merch_order_items oi
               JOIN merch_orders o ON o.id = oi.order_id
              WHERE oi.variant_id = v.id
                AND o.status = 'pending'
                AND o.expires_at > now()
           ), 0)
      FROM merch_variants v
     WHERE v.id = ANY(p_variant_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_merch_reserved_counts(uuid[]) TO anon, authenticated;
