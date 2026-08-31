-- reserve_experience + preview_experience_promo, as applied to prod 2026-08-31.
--
-- Promo validation lives in reserve_experience, not in the edge function: the
-- discount and the amount Xendit is then asked for must be decided in one
-- place, under the same lock that reserves the slot. preview_experience_promo
-- repeats the arithmetic read-only for the booking screen — duplication worth
-- accepting, since the alternative is showing a price the reservation
-- disagrees with. Change the fee math in BOTH.
--
-- The 7-arg reserve_experience is dropped; its callers resolve into the new
-- signature through the defaults, so the deployed edge function keeps working
-- until it is redeployed.

CREATE OR REPLACE FUNCTION public.reserve_experience(
    p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer,
    p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text,
    p_guest_phone text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text,
    -- 'web' or 'app'. app_only codes are refused from the web — the check the
    -- events path is still missing.
    p_source text DEFAULT 'web'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_intent_id UUID; v_current_guests INTEGER; v_max_guests INTEGER;
    v_price DECIMAL(10,2); v_table_price DECIMAL(10,2); v_schedule_price DECIMAL(10,2);
    v_partner_id UUID; v_pct DECIMAL(5,2); v_fixed_fee DECIMAL(10,2);
    v_pass_fixed BOOLEAN; v_pass_pct BOOLEAN;
    v_subtotal DECIMAL(10,2); v_discount DECIMAL(10,2) := 0; v_net DECIMAL(10,2);
    v_promo RECORD; v_promo_id UUID := NULL;
    v_pct_take DECIMAL(10,2); v_fixed_take DECIMAL(10,2);
    v_passed_portion DECIMAL(10,2); v_total_amount DECIMAL(10,2);
BEGIN
    IF p_schedule_id IS NOT NULL THEN
        SELECT current_guests, max_guests, price_per_person
        INTO v_current_guests, v_max_guests, v_schedule_price
        FROM public.experience_schedules WHERE id = p_schedule_id FOR UPDATE;
        IF v_current_guests + p_quantity > v_max_guests THEN
            RAISE EXCEPTION 'Schedule is full';
        END IF;
    END IF;

    SELECT price_per_person, partner_id INTO v_table_price, v_partner_id
    FROM public.tables WHERE id = p_table_id;
    v_price := COALESCE(v_schedule_price, v_table_price, 0);

    SELECT COALESCE(custom_percentage, 2.00), COALESCE(fixed_fee_per_ticket, 15.00),
           COALESCE(pass_fixed_to_customer, TRUE), COALESCE(pass_percentage_to_customer, FALSE)
    INTO v_pct, v_fixed_fee, v_pass_fixed, v_pass_pct
    FROM public.partners WHERE id = v_partner_id;

    v_pct := COALESCE(v_pct, 2.00); v_fixed_fee := COALESCE(v_fixed_fee, 15.00);
    v_pass_fixed := COALESCE(v_pass_fixed, TRUE); v_pass_pct := COALESCE(v_pass_pct, FALSE);

    v_subtotal := v_price * p_quantity;

    IF p_promo_code IS NOT NULL AND btrim(p_promo_code) <> '' THEN
        SELECT * INTO v_promo FROM promo_codes
        WHERE experience_id = p_table_id
          AND code = upper(btrim(p_promo_code))
          AND COALESCE(is_active, true)
        LIMIT 1;

        IF v_promo.id IS NULL THEN RAISE EXCEPTION 'PROMO_INVALID'; END IF;
        IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > now() THEN
            RAISE EXCEPTION 'PROMO_NOT_STARTED'; END IF;
        IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
            RAISE EXCEPTION 'PROMO_EXPIRED'; END IF;
        IF v_promo.usage_limit IS NOT NULL
           AND COALESCE(v_promo.usage_count, 0) >= v_promo.usage_limit THEN
            RAISE EXCEPTION 'PROMO_LIMIT_REACHED'; END IF;
        IF v_promo.app_only AND COALESCE(p_source, 'web') <> 'app' THEN
            RAISE EXCEPTION 'PROMO_APP_ONLY'; END IF;

        v_promo_id := v_promo.id;
        IF v_promo.discount_type = 'percentage' THEN
            v_discount := ROUND(v_subtotal * (v_promo.discount_amount / 100.0), 2);
        ELSE
            v_discount := v_promo.discount_amount;
        END IF;
        IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
        IF v_discount < 0 THEN v_discount := 0; END IF;
    END IF;

    v_net := v_subtotal - v_discount;

    -- Percentage take follows what the experience actually sold for. The fixed
    -- fee stays per-person: it is a per-head cost, not a share of the price.
    v_pct_take := ROUND(v_net * (v_pct / 100.0));
    v_fixed_take := ROUND(v_fixed_fee * p_quantity);
    v_passed_portion := (CASE WHEN v_pass_pct THEN v_pct_take ELSE 0 END)
                      + (CASE WHEN v_pass_fixed THEN v_fixed_take ELSE 0 END);
    v_total_amount := v_net + v_passed_portion;

    -- subtotal stays GROSS with the discount beside it, so reporting can tell a
    -- discounted sale from a cheap one.
    INSERT INTO public.experience_purchase_intents (
        user_id, table_id, schedule_id, quantity, unit_price, subtotal,
        platform_fee, total_amount, status, expires_at, xendit_external_id,
        guest_email, guest_name, guest_phone, fee_percentage, fees_passed_to_customer,
        promo_code_id, discount_amount
    ) VALUES (
        p_user_id, p_table_id, p_schedule_id, p_quantity, v_price, v_subtotal,
        v_passed_portion, v_total_amount, 'pending',
        NOW() + INTERVAL '15 minutes', 'exp_' || gen_random_uuid()::text,
        p_guest_email, p_guest_name, p_guest_phone,
        v_pct, (v_pass_pct OR v_pass_fixed), v_promo_id, v_discount
    ) RETURNING id INTO v_intent_id;

    IF p_schedule_id IS NOT NULL THEN
        UPDATE public.experience_schedules
        SET current_guests = current_guests + p_quantity WHERE id = p_schedule_id;
    END IF;

    RETURN v_intent_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.reserve_experience(uuid, uuid, uuid, integer, text, text, text);


-- Read-only price preview for the booking screen. Reserves nothing — the buyer
-- is still deciding.
CREATE OR REPLACE FUNCTION public.preview_experience_promo(
    p_table_id uuid, p_code text, p_quantity integer DEFAULT 1,
    p_schedule_id uuid DEFAULT NULL, p_source text DEFAULT 'web'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_price DECIMAL(10,2); v_schedule_price DECIMAL(10,2); v_partner_id UUID;
    v_pct DECIMAL(5,2); v_fixed_fee DECIMAL(10,2);
    v_pass_fixed BOOLEAN; v_pass_pct BOOLEAN;
    v_subtotal DECIMAL(10,2); v_discount DECIMAL(10,2) := 0; v_net DECIMAL(10,2);
    v_promo RECORD; v_total DECIMAL(10,2); v_passed DECIMAL(10,2); v_qty integer;
BEGIN
    v_qty := GREATEST(COALESCE(p_quantity, 1), 1);

    IF p_schedule_id IS NOT NULL THEN
        SELECT price_per_person INTO v_schedule_price
        FROM experience_schedules WHERE id = p_schedule_id;
    END IF;

    SELECT price_per_person, partner_id INTO v_price, v_partner_id
    FROM tables WHERE id = p_table_id;
    v_price := COALESCE(v_schedule_price, v_price, 0);

    SELECT COALESCE(custom_percentage, 2.00), COALESCE(fixed_fee_per_ticket, 15.00),
           COALESCE(pass_fixed_to_customer, TRUE), COALESCE(pass_percentage_to_customer, FALSE)
    INTO v_pct, v_fixed_fee, v_pass_fixed, v_pass_pct
    FROM partners WHERE id = v_partner_id;

    v_pct := COALESCE(v_pct, 2.00); v_fixed_fee := COALESCE(v_fixed_fee, 15.00);
    v_pass_fixed := COALESCE(v_pass_fixed, TRUE); v_pass_pct := COALESCE(v_pass_pct, FALSE);

    v_subtotal := v_price * v_qty;

    SELECT * INTO v_promo FROM promo_codes
    WHERE experience_id = p_table_id
      AND code = upper(btrim(COALESCE(p_code, '')))
      AND COALESCE(is_active, true)
    LIMIT 1;

    IF v_promo.id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'PROMO_INVALID',
                                  'message', 'That code isn''t valid for this experience.');
    END IF;
    IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > now() THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'PROMO_NOT_STARTED',
                                  'message', 'This code isn''t active yet.');
    END IF;
    IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'PROMO_EXPIRED',
                                  'message', 'This code has expired.');
    END IF;
    IF v_promo.usage_limit IS NOT NULL
       AND COALESCE(v_promo.usage_count, 0) >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'PROMO_LIMIT_REACHED',
                                  'message', 'This code has been fully claimed.');
    END IF;
    IF v_promo.app_only AND COALESCE(p_source, 'web') <> 'app' THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'PROMO_APP_ONLY',
                                  'message', 'This code only works in the HangHut app.');
    END IF;

    IF v_promo.discount_type = 'percentage' THEN
        v_discount := ROUND(v_subtotal * (v_promo.discount_amount / 100.0), 2);
    ELSE
        v_discount := v_promo.discount_amount;
    END IF;
    IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
    IF v_discount < 0 THEN v_discount := 0; END IF;

    v_net := v_subtotal - v_discount;
    v_passed := (CASE WHEN v_pass_pct THEN ROUND(v_net * (v_pct / 100.0)) ELSE 0 END)
              + (CASE WHEN v_pass_fixed THEN ROUND(v_fixed_fee * v_qty) ELSE 0 END);
    v_total := v_net + v_passed;

    RETURN jsonb_build_object(
        'valid', true, 'code', v_promo.code,
        'discount_type', v_promo.discount_type, 'discount_amount', v_promo.discount_amount,
        'subtotal', v_subtotal, 'discount', v_discount,
        'fees', v_passed, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_experience_promo(uuid, text, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_experience_promo(uuid, text, integer, uuid, text) TO anon, authenticated;
