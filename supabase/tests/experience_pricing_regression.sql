-- ─────────────────────────────────────────────────────────────────────────────
-- Regression harness: experience pricing, discounts, fees and payout.
--
-- HOW TO RUN. Paste the whole file into the SQL editor and run it. It wraps
-- itself in a transaction and ROLLS BACK at the end, so it leaves nothing
-- behind — no partner, no listing, no slot, no promo code, no ledger row.
-- Every assertion raises an exception on failure, which aborts the run; a
-- clean finish prints a summary and rolls back.
--
-- WHY SQL AND NOT A JS TEST. The money math lives in plpgsql
-- (reserve_experience, confirm_experience_booking). A TypeScript test cannot
-- reach it, so it would assert a re-implementation rather than the thing that
-- actually charges people. This runs the real functions.
--
-- THE INVARIANT, asserted on every case:
--     host_payout + HangHut's take  ==  what the buyer paid
--     host_payout  ==  gross_amount − discount_amount − platform_fee
-- where platform_fee is the portion the HOST absorbed, matching the convention
-- in public.transactions.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
    v_user       uuid;
    v_partner    uuid;
    v_exp        uuid;
    v_slot       uuid;
    v_intent     uuid;
    v_txn        RECORD;
    v_in         RECORD;
    v_cases      int := 0;

    -- case matrix
    c_pct        numeric;
    c_fixed      numeric;
    c_pass_fixed boolean;
    c_pass_pct   boolean;
    c_qty        int;
    c_discount   numeric;
    c_promo      text;

    v_expected_take    numeric;
    v_expected_payout  numeric;
    v_net              numeric;
BEGIN
    -- ── Fixtures ────────────────────────────────────────────────────────
    -- An existing auth user is borrowed rather than created: experience
    -- intents are NOT NULL on user_id and auth.users has its own triggers.
    SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
    IF v_user IS NULL THEN RAISE EXCEPTION 'No auth user to test with'; END IF;

    -- Only the two genuinely-required columns. partners has no `email` column,
    -- and `status` is left alone because protect_partner_status_fields rewrites
    -- it on service-role writes — neither matters here, since reserve_experience
    -- reads only the four fee columns set per case below.
    INSERT INTO public.partners (user_id, business_name)
    VALUES (v_user, 'ZZ PRICING TEST')
    RETURNING id INTO v_partner;

    INSERT INTO public.tables (
        host_id, partner_id, title, description, location_name,
        price_per_person, max_guests, is_experience, status, datetime,
        latitude, longitude
    ) VALUES (
        v_user, v_partner, 'ZZ PRICING TEST', 'regression fixture', 'Nowhere',
        2000, 10, true, 'open', now() + interval '400 days', 14.5, 121.0
    ) RETURNING id INTO v_exp;

    -- ── Case matrix ─────────────────────────────────────────────────────
    FOREACH c_qty IN ARRAY ARRAY[1, 3] LOOP
    FOR c_pct, c_fixed, c_pass_fixed, c_pass_pct IN
        SELECT * FROM (VALUES
            (0.00,  0.00, true,  false),   -- Paint and Sip: HangHut earns nothing
            (0.00, 15.00, true,  false),   -- the common prod shape
            (4.00, 15.00, true,  false),   -- Pickle Project
            (4.00, 15.00, false, false),   -- host absorbs everything
            (4.00, 15.00, true,  true)     -- buyer pays the whole take
        ) AS m(pct, fixed, pf, pp)
    LOOP
    FOREACH c_discount IN ARRAY ARRAY[0, 500, 2000] LOOP

        UPDATE public.partners SET
            custom_percentage          = c_pct,
            fixed_fee_per_ticket       = c_fixed,
            pass_fixed_to_customer     = c_pass_fixed,
            pass_percentage_to_customer= c_pass_pct
        WHERE id = v_partner;

        -- A fresh slot per case: (table_id, start_time) is unique, and each
        -- case must start from current_guests = 0.
        INSERT INTO public.experience_schedules (table_id, start_time, end_time, max_guests, status)
        VALUES (v_exp, now() + (v_cases + 1) * interval '1 day',
                       now() + (v_cases + 1) * interval '1 day' + interval '2 hours',
                10, 'open')
        RETURNING id INTO v_slot;

        c_promo := NULL;
        IF c_discount > 0 THEN
            c_promo := 'ZZTEST' || v_cases;
            INSERT INTO public.promo_codes (experience_id, code, discount_type, discount_amount, is_active)
            -- discount_type is an ENUM: ('percentage','fixed_amount'). 'fixed' fails.
            VALUES (v_exp, c_promo, 'fixed_amount', c_discount, true);
        END IF;

        -- ── Act ─────────────────────────────────────────────────────────
        v_intent := public.reserve_experience(
            v_exp, v_slot, v_user, c_qty, NULL, NULL, NULL, c_promo, 'web'
        );
        PERFORM public.confirm_experience_booking(v_intent, 'TEST', 'test_' || v_cases);

        SELECT * INTO v_in  FROM public.experience_purchase_intents WHERE id = v_intent;
        SELECT * INTO v_txn FROM public.experience_transactions WHERE purchase_intent_id = v_intent;

        -- ── Assert ──────────────────────────────────────────────────────
        v_net := v_in.subtotal - v_in.discount_amount;
        -- Mirrors the events rule (create-purchase-intent:835): net 0 charges
        -- no platform fee at all, so a 100% code never produces a negative payout.
        v_expected_take := CASE WHEN v_net > 0
            THEN ROUND(v_net * (c_pct / 100.0)) + ROUND(c_fixed * c_qty) ELSE 0 END;

        IF v_txn IS NULL THEN
            RAISE EXCEPTION 'case %: no ledger row written', v_cases;
        END IF;

        -- 1. The discount is clamped at the subtotal, never a credit.
        IF v_in.discount_amount > v_in.subtotal OR v_in.discount_amount < 0 THEN
            RAISE EXCEPTION 'case %: discount % outside [0, subtotal %]',
                v_cases, v_in.discount_amount, v_in.subtotal;
        END IF;

        -- 2. The buyer was charged the net plus whatever take was passed on.
        IF v_in.total_amount <> v_net + v_in.platform_fee THEN
            RAISE EXCEPTION 'case %: buyer charged %, expected net % + passed %',
                v_cases, v_in.total_amount, v_net, v_in.platform_fee;
        END IF;

        -- 3. A fully-discounted booking costs the buyer nothing at all.
        IF v_net = 0 AND v_in.total_amount <> 0 THEN
            RAISE EXCEPTION 'case %: fully-discounted booking charged the buyer %',
                v_cases, v_in.total_amount;
        END IF;

        -- 4. gross_amount stays PRE-discount, matching public.transactions.
        IF v_txn.gross_amount <> v_in.subtotal THEN
            RAISE EXCEPTION 'case %: gross % should be the pre-discount subtotal %',
                v_cases, v_txn.gross_amount, v_in.subtotal;
        END IF;
        IF v_txn.discount_amount <> v_in.discount_amount THEN
            RAISE EXCEPTION 'case %: ledger discount % <> intent discount %',
                v_cases, v_txn.discount_amount, v_in.discount_amount;
        END IF;

        -- 4. platform_fee is the ABSORBED portion (the events convention).
        IF v_txn.platform_fee <> GREATEST(v_expected_take - v_in.platform_fee, 0) THEN
            RAISE EXCEPTION 'case %: absorbed fee %, expected % (take % − passed %)',
                v_cases, v_txn.platform_fee,
                GREATEST(v_expected_take - v_in.platform_fee, 0),
                v_expected_take, v_in.platform_fee;
        END IF;

        -- 5. THE WATERFALL — the same one public.transactions reconciles with.
        v_expected_payout := v_txn.gross_amount - v_txn.discount_amount - v_txn.platform_fee;
        IF v_txn.host_payout <> v_expected_payout THEN
            RAISE EXCEPTION 'case %: payout % <> gross % − discount % − fee % = %',
                v_cases, v_txn.host_payout, v_txn.gross_amount,
                v_txn.discount_amount, v_txn.platform_fee, v_expected_payout;
        END IF;

        -- 6. THE MONEY INVARIANT — HangHut never pays out more than it took.
        --    buyer paid == host payout + HangHut's full take.
        IF v_in.total_amount <> v_txn.host_payout + v_expected_take THEN
            RAISE EXCEPTION 'case % (pct %, fixed %, qty %, discount %): buyer paid %, but payout % + take % = %  → HangHut is short %',
                v_cases, c_pct, c_fixed, c_qty, c_discount,
                v_in.total_amount, v_txn.host_payout, v_expected_take,
                v_txn.host_payout + v_expected_take,
                (v_txn.host_payout + v_expected_take) - v_in.total_amount;
        END IF;

        -- 7. Nobody is paid a negative amount.
        IF v_txn.host_payout < 0 THEN
            RAISE EXCEPTION 'case %: negative host payout %', v_cases, v_txn.host_payout;
        END IF;

        v_cases := v_cases + 1;
    END LOOP; END LOOP; END LOOP;

    -- ── Capacity: concurrent-safe reservation ───────────────────────────
    -- reserve_experience takes SELECT … FOR UPDATE on the slot, so the check
    -- and the increment cannot interleave. This asserts the check itself
    -- refuses to oversell; the lock is what makes it hold under concurrency.
    INSERT INTO public.experience_schedules (table_id, start_time, end_time, max_guests, status)
    VALUES (v_exp, now() + interval '900 days', now() + interval '900 days' + interval '1 hour', 2, 'open')
    RETURNING id INTO v_slot;

    PERFORM public.reserve_experience(v_exp, v_slot, v_user, 2, NULL, NULL, NULL, NULL, 'web');
    BEGIN
        PERFORM public.reserve_experience(v_exp, v_slot, v_user, 1, NULL, NULL, NULL, NULL, 'web');
        RAISE EXCEPTION 'capacity: a 3rd guest was accepted into a 2-seat slot';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%full%' THEN RAISE; END IF;
    END;

    -- Verified on prod 2026-10-12: PASS, 30 cases (5 fully-discounted) + the
    -- capacity guard. It found two real defects on the way there — a negative
    -- host payout on a 100% code, and the same guard missing from confirm.
    RAISE NOTICE 'PASS - % pricing cases + capacity guard, all invariants held', v_cases;
END $$;

ROLLBACK;
