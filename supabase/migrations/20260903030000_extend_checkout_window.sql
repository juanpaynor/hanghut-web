-- Extend the checkout payment window: 10 → 15 minutes.
--
-- WHY. On KOOLCHELLA's on-sale (240/1500 as of 2026-09-03), the time from intent
-- creation to the payment actually landing has a p90 of 9.6 MINUTES for QRPh,
-- against a 10-minute expiry. QRPh and GCash buyers have to leave the browser,
-- open a banking app, authenticate, and scan — a tenth of them were finishing
-- with under 25 seconds to spare. Six payments landed after their intent had
-- already expired; four within 1.5–5.6 minutes, and two were only credited
-- 25 and 32 hours later by a batch sweep (both at 2026-09-03 00:53:23), so
-- those buyers waited a day and a half for tickets they had paid for.
--
-- Xendit is NOT the constraint: no invoice_duration is set, and their session
-- was still accepting payment 32 hours later. Our own window is the only thing
-- killing these checkouts.
--
-- 15 minutes is also what reserve_experience and reserve_merch already use, so
-- this aligns tickets with the rest of the platform rather than inventing a number.
--
-- SEAT HOLDS GO TO 18, NOT 15. expire_stale_purchase_intents releases inventory
-- off purchase_intents.expires_at, and a payment is followed by webhook latency
-- before seats are assigned. If the hold and the window expire together, a seat
-- can be freed while its intent is still legitimately payable — the double-book
-- race. The hold now outlives the payment window by 3 minutes to cover that gap.
--
-- Bodies are rewritten by regex on pg_get_functiondef rather than retyped: these
-- functions are 1–7KB and carry logic unrelated to the TTL (seat-run selection,
-- SKIP LOCKED inventory claiming). Retyping them risks silent drift; this changes
-- the interval and nothing else.

DO $mig$
DECLARE
    r       record;
    new_def text;
    n       int := 0;
BEGIN
    FOR r IN
        SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public'
          AND p.proname IN ('reserve_tickets', 'assign_seats_to_intent')
          AND pg_get_functiondef(p.oid) ~* 'interval\s*''10 minutes'''
    LOOP
        new_def := regexp_replace(
            r.def,
            'interval\s*''10 minutes''',
            CASE r.proname
                WHEN 'reserve_tickets'        THEN 'interval ''15 minutes'''
                WHEN 'assign_seats_to_intent' THEN 'interval ''18 minutes'''
            END,
            'gi'
        );
        EXECUTE new_def;
        n := n + 1;
        RAISE NOTICE 'checkout-window: rewrote %(%)', r.proname, r.oid::regprocedure;
    END LOOP;

    -- Both reserve_tickets overloads and both assign_seats_to_intent overloads.
    -- The 3-arg reserve_tickets is not called from create-purchase-intent, but it
    -- is reachable over RPC (the mobile app may still use it), so it moves too —
    -- a buyer's window must not depend on which client they came from.
    IF n <> 4 THEN
        RAISE EXCEPTION 'checkout-window: expected 4 functions, rewrote %', n;
    END IF;
END
$mig$;

-- seat_holds.expires_at's column DEFAULT stays at 12 minutes ON PURPOSE.
--
-- It governs `hold_seat` — the BROWSE hold taken when a buyer taps a seat in the
-- picker. That hold has no payment behind it, so it does not need to outlive the
-- payment window; it only needs to survive someone deciding. Raising it to 18
-- would make an abandoned selection block other buyers 50% longer for no gain,
-- which matters most on exactly the busy on-sale where seats are scarce.
--
-- Only the CHECKOUT hold (assign_seats_to_intent, above) goes to 18, because a
-- buyer is actively paying behind it. The two are different things and the fact
-- that one column default backs one of them is easy to conflate — hence this note.
--
-- (An earlier revision of this migration did set 18 here. It was reverted the
-- same day after an abandoned browse hold was observed sitting for 18 minutes.)
