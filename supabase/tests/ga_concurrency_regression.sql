-- Regression harness for atomic GA reservation (20261013100000).
--
-- PART A ONLY. Everything here runs in ONE transaction and rolls back, so it
-- is safe against production. That makes it deterministic and residue-free --
-- and it means it CANNOT prove the property that matters most.
--
-- Atomicity under contention needs N genuinely concurrent sessions. One
-- transaction can never demonstrate that two transactions interleave
-- correctly, because there is only one. Part B therefore lives outside this
-- file and needs an environment that is not production:
--
--   seq 20 | xargs -P20 -I{} psql "$URL" -c \
--     "select reserve_tickets_for_tier('<event>', 1, '<tier>', null, 'c{}@t.test','C',null)"
--
--   Expected against a tier of 10: exactly 10 succeed, 10 raise
--   'Selected ticket tier is sold out', and count(reserved) = 10.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/ga_concurrency_regression.sql

BEGIN;

DO $harness$
DECLARE
    v_org   uuid;
    v_ev    uuid;   -- tiered event
    v_ev2   uuid;   -- tier-less event, for the capacity gate
    v_ga    uuid;
    v_vip   uuid;
    v_i     uuid;
    v_fail  text;
    v_pass  int := 0;
    v_log   text := '';

    -- helper results
    v_sold  int;
    v_cnt   int;
BEGIN
    SELECT id INTO v_org FROM partners WHERE user_id IS NOT NULL ORDER BY created_at LIMIT 1;

    -- ── fixtures ──────────────────────────────────────────────────────────
    -- 'hidden': notify_followers_new_event only fires for 'active'.
    INSERT INTO events (organizer_id, title, start_datetime, capacity, ticket_price,
                        status, seating_type, is_external, venue_name, address,
                        latitude, longitude)
    VALUES (v_org, 'HARNESS atomic reservation', now() + interval '30 days', 500, 0,
            'hidden', 'general_admission', false, 'H', 'H', 14.5547, 121.0244)
    RETURNING id INTO v_ev;

    INSERT INTO ticket_tiers (event_id, name, price, quantity_total)
    VALUES (v_ev, 'GA', 500, 10) RETURNING id INTO v_ga;
    INSERT INTO ticket_tiers (event_id, name, price, quantity_total)
    VALUES (v_ev, 'VIP', 2000, 3) RETURNING id INTO v_vip;

    -- ── 1. a tier sells exactly its quantity_total ────────────────────────
    v_i := reserve_tickets_for_tier(v_ev, 10, v_ga, NULL, 'h1@example.invalid', 'H', NULL);
    v_pass := v_pass + 1; v_log := v_log || '1:10-reserved ';

    -- ── 2. one more is refused ────────────────────────────────────────────
    BEGIN
        PERFORM reserve_tickets_for_tier(v_ev, 1, v_ga, NULL, 'h2@example.invalid', 'H', NULL);
        RAISE EXCEPTION 'FAIL case 2: an 11th ticket was sold against a tier of 10';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%sold out%' THEN RAISE; END IF;
        v_pass := v_pass + 1; v_log := v_log || '2:11th-refused ';
    END;

    -- ── 3. LIVE RESERVATIONS COUNT (the actual bug) ───────────────────────
    -- Nothing is paid, so the old gate (quantity_sold, which counts paid only)
    -- would have seen 0 sold and allowed all 10 again.
    SELECT quantity_sold INTO v_sold FROM ticket_tiers WHERE id = v_ga;
    IF v_sold <> 0 THEN
        RAISE EXCEPTION 'FAIL case 3: quantity_sold moved to % on a reservation; it must track CONFIRMED sales only', v_sold;
    END IF;
    v_pass := v_pass + 1; v_log := v_log || '3:qty-sold-still-0 ';

    -- ── 4. an EXPIRED hold stops counting, with no sweeper run ────────────
    UPDATE tickets SET held_until = now() - interval '1 minute'
     WHERE purchase_intent_id = v_i AND status = 'reserved';

    v_i := reserve_tickets_for_tier(v_ev, 10, v_ga, NULL, 'h4@example.invalid', 'H', NULL);
    v_pass := v_pass + 1; v_log := v_log || '4:expired-released ';

    -- ── 5. tier isolation: GA exhausted, VIP unaffected ───────────────────
    BEGIN
        PERFORM reserve_tickets_for_tier(v_ev, 1, v_ga, NULL, 'h5a@example.invalid', 'H', NULL);
        RAISE EXCEPTION 'FAIL case 5a: GA oversold after being refilled';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%sold out%' THEN RAISE; END IF;
    END;
    PERFORM reserve_tickets_for_tier(v_ev, 3, v_vip, NULL, 'h5b@example.invalid', 'H', NULL);
    v_pass := v_pass + 1; v_log := v_log || '5:tiers-isolated ';

    -- ── 6. tier_id is stamped at RESERVE, not at payment ──────────────────
    SELECT count(*) INTO v_cnt
      FROM tickets WHERE purchase_intent_id = v_i AND tier_id = v_ga AND status = 'reserved';
    IF v_cnt <> 10 THEN
        RAISE EXCEPTION 'FAIL case 6: % of 10 reserved tickets carry the tier; without this the next caller is blind to this order', v_cnt;
    END IF;
    v_pass := v_pass + 1; v_log := v_log || '6:tier-stamped ';

    -- ── 7. tier-less event gates on CAPACITY, not on pool size ────────────
    -- The pool is not a capacity gate: mint_event_tickets never prunes on a
    -- capacity decrease, so pool rows can far exceed capacity.
    INSERT INTO events (organizer_id, title, start_datetime, capacity, ticket_price,
                        status, seating_type, is_external, venue_name, address,
                        latitude, longitude)
    VALUES (v_org, 'HARNESS tierless', now() + interval '30 days', 2, 100,
            'hidden', 'general_admission', false, 'H', 'H', 14.5547, 121.0244)
    RETURNING id INTO v_ev2;

    PERFORM reserve_tickets_for_tier(v_ev2, 2, NULL, NULL, 'h7a@example.invalid', 'H', NULL);
    BEGIN
        PERFORM reserve_tickets_for_tier(v_ev2, 1, NULL, NULL, 'h7b@example.invalid', 'H', NULL);
        RAISE EXCEPTION 'FAIL case 7: sold past events.capacity on a tier-less event';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Not enough tickets%' THEN RAISE; END IF;
        v_pass := v_pass + 1; v_log := v_log || '7:capacity-gated ';
    END;

    -- ── 8. backward compatibility: the 6-arg signature still works ────────
    -- create-purchase-intent v123 calls this until it is redeployed.
    v_i := reserve_tickets(v_ev, NULL, 1, 'h8@example.invalid', 'H', NULL);
    IF v_i IS NULL THEN RAISE EXCEPTION 'FAIL case 8: legacy reserve_tickets returned NULL'; END IF;
    v_pass := v_pass + 1; v_log := v_log || '8:legacy-6arg-ok ';

    -- ── 9. the email requirement is unchanged ─────────────────────────────
    BEGIN
        PERFORM reserve_tickets_for_tier(v_ev, 1, v_vip, NULL, '', 'H', NULL);
        RAISE EXCEPTION 'FAIL case 9: reserved with no email';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%email address is required%' THEN RAISE; END IF;
        v_pass := v_pass + 1; v_log := v_log || '9:email-required ';
    END;

    RAISE EXCEPTION 'HARNESS PASS - % cases - %', v_pass, v_log;
END
$harness$;

ROLLBACK;
