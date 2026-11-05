-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1b — the two code bugs Phase 1 only caught, now actually fixed
--
-- NOT YET APPLIED. For review. Run in the Supabase SQL editor, section by
-- section. Rollback: rollback/before_phase1b.sql. Do NOT use `supabase db push`.
--
-- Phase 1 added a unique index so the database REFUSES a double-booking. That
-- is a net. These are the two bugs the net was catching.
--
--   BUG A  Releasing a ticket back to the pool leaves the seat attached, so
--          blank unsold tickets accumulate stale seat claims. This is where
--          all 50 squatters cleared in Phase 1 came from, and they would come
--          back.
--   BUG B  assign_seats_to_intent is not idempotent. Run twice for one order,
--          it hands the same seat out twice. This caused the Hex Fest
--          duplicate. Post-Phase 1 it fails the checkout instead -- better,
--          but a buyer should not see an error for our bug.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — BUG A. One trigger, because the leak is in five places and two
--             of them are not SQL.
--
-- Every path that returns a ticket to the pool sets status='available' and
-- forgets seat_id / seat_info. Audited 2026-11-05, in order of how much damage
-- each does today:
--
--   1. expire_stale_purchase_intents()            SQL, cron every 10 min  LIVE
--      The abandoned-checkout sweeper. This is the main squatter factory.
--   2. create-purchase-intent/index.ts:1182       edge fn, PostgREST      LIVE
--      The Xendit-failure rollback.
--   3. create-purchase-intent/index.ts:810        edge fn, PostgREST      LIVE
--      The seat-assignment-error rollback.
--   4. issue_tickets()                            SQL                     LIVE
--      The duplicate-registration branch.
--   5. release_expired_reservations()             SQL, no caller, dormant
--
-- void_box_office_order() is the one that already does it right, and is the
-- template for what correct looks like.
--
-- ── Why a trigger and not five patches ─────────────────────────────────────
--
-- Numbers 2 and 3 are PostgREST writes from an edge function. No change to any
-- SQL function can cover them -- fixing those two means editing and
-- REDEPLOYING create-purchase-intent, which is the live money path, to fix a
-- bug that is not costing money today. A trigger covers all five at once, from
-- the database side, with no edge deploy, and it covers the sixth path someone
-- writes next year without knowing this rule exists.
--
-- The invariant is simple and true: a ticket in the pool owns no chair.
--
-- ── Scope, deliberately narrow ─────────────────────────────────────────────
--
-- BEFORE UPDATE only, and only on the transition INTO 'available'.
--   - Not on INSERT: a seat map may legitimately pre-mint rows, and no INSERT
--     path is implicated. (Checked: 0 blank tickets hold a seat right now, and
--     ordinary selling has continued since Phase 1 without creating any.)
--   - Not on 'cancelled' or 'refunded': those keep the seat for the record,
--     and the Phase 1 index already excludes them so the seat resells fine.
--   - `IS DISTINCT FROM` so an UPDATE that touches an already-available row
--     for some other reason is left alone.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.clear_seat_on_release()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  -- A ticket going back into the pool must not keep the chair with it.
  -- Both columns: seat_id is the claim the unique index polices, seat_info is
  -- the human-readable copy that would otherwise print a stale seat on the
  -- next buyer's ticket.
  IF NEW.status = 'available' AND OLD.status IS DISTINCT FROM 'available' THEN
    NEW.seat_id   := NULL;
    NEW.seat_info := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

comment on function public.clear_seat_on_release() is
  'Invariant: a ticket in the pool owns no seat. Enforced here rather than at each caller because two of the five release paths are PostgREST writes from create-purchase-intent and cannot be reached from SQL. See phase1b.';

-- CREATE OR REPLACE, not DROP + CREATE. Postgres 14+ supports it (prod is
-- 17.6), it is re-runnable, and it keeps this file free of any statement the
-- Supabase SQL editor flags as destructive -- which matters, because a
-- "destructive operations" warning the author knows to be harmless is exactly
-- how a reviewer learns to click through the ones that are not.
--
-- Name starts with "a_" so it runs BEFORE trigger_populate_ticket_guest_info.
-- Postgres fires same-timing triggers in alphabetical order; the two do not
-- touch the same columns, so the order does not actually matter today, but
-- pinning it costs nothing and removes a future surprise.
create or replace trigger a_clear_seat_on_release
  before update on public.tickets
  for each row
  execute function public.clear_seat_on_release();

commit;


-- ── SECTION 1b — prove the trigger fires. Read-only in effect. ─────────────
--
-- Expect: notice 'GOOD: seat cleared on release', then the block aborts itself
-- so nothing is kept. If it says RULE_DID_NOT_BITE the trigger is not wired up.

do $$
declare v_id uuid; v_seat uuid; v_after_seat uuid;
begin
  select id, seat_id into v_id, v_seat
  from tickets where seat_id is not null and status = 'valid' limit 1;

  update tickets set status = 'available' where id = v_id;

  select seat_id into v_after_seat from tickets where id = v_id;

  if v_after_seat is null then
    raise notice 'GOOD: seat cleared on release (ticket %, was seat %)', v_id, v_seat;
  else
    raise exception 'RULE_DID_NOT_BITE -- ticket % kept seat % after going available', v_id, v_after_seat;
  end if;

  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;
-- The final RAISE aborts the whole block. The expected result of running this
-- is the error "TEST_COMPLETE_ROLLING_BACK" and a 'GOOD:' notice above it.
-- Anything else, especially RULE_DID_NOT_BITE, means stop.


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — BUG B. assign_seats_to_intent becomes idempotent.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- No single run can double-issue: ordered_seats joins ordered_tickets on
-- row_number, so one seat matches one ticket. It takes TWO runs on one intent,
-- and three properties made run 2 repeat run 1:
--
--   1. ordered_tickets filters status='reserved' only. After run 1 the seated
--      ticket may no longer qualify, so the OTHER ticket becomes row_number 1
--      and is handed the same seat.
--   2. this function never sets seats.status='booked' (book_seats_for_intent
--      does, later), so `s.status='available'` still passes on run 2.
--   3. the seat-list branch excludes holds whose session_id is this same
--      intent -- precisely the hold run 1 created.
--
-- ── The fix, in one line ───────────────────────────────────────────────────
--
-- Only ever assign to a ticket that does not already have a seat, and only
-- ever ask for as many seats as there are such tickets.
--
-- Concretely:
--   a. v_already = every seat this order already holds, across ALL live
--      statuses -- not just 'reserved'. This is the subtle part: in the Hex
--      Fest replay run 1's ticket had already left 'reserved' by the time run
--      2 looked, so a reserved-only scan reports "this order holds no seats"
--      and hands seat 11 out again.
--      v_need = p_quantity - |v_already|, i.e. what this call still has to do.
--      NOT "every seatless ticket on the order" -- a mixed GA-plus-seated
--      order has reserved tickets that are never meant to get a seat, and
--      counting those would refuse a perfectly good checkout.
--   b. v_need = 0  -> return what is already assigned and change nothing.
--      This alone makes the Hex Fest replay a no-op.
--   c. seats this intent ALREADY holds are subtracted from p_seat_ids, so a
--      partial re-run asks only for what is missing instead of re-requesting
--      seats it owns (which would fail its own SEAT_COUNT_MISMATCH).
--   d. ordered_tickets gains `AND seat_id IS NULL`, so an already-seated
--      ticket can never be re-pointed.
--   e. the hold count is compared to what we actually chose, not to
--      p_quantity, which no longer matches on a partial re-run.
--   f. the return value is read back from tickets, so a re-run returns the
--      FULL set of seats for the order rather than only the newly added ones.
--      Callers already treat this as "the seats for this order".
--
-- ── What is deliberately NOT changed ───────────────────────────────────────
--
-- The seat-choosing logic, the tier COALESCE precedence, the hold semantics,
-- the 30-second grace, pick_best_available, the error codes
-- (INTENT_NOT_FOUND / SEAT_COUNT_MISMATCH / SEATS_EXPIRED / SEATS_UNAVAILABLE)
-- and the NULL return for a tier with no seats. A checkout that works today
-- takes an identical path: on a first run v_need = p_quantity and every new
-- branch collapses to what is already there.
--
-- ── ONE REAL BEHAVIOUR CHANGE, stated plainly ──────────────────────────────
--
-- A seat carried by SOMEONE ELSE'S 'reserved' ticket is now unavailable. Until
-- now only seat_holds blocked it, and seats.status is not set to 'booked' until
-- book_seats_for_intent runs after payment -- that gap is the Hex Fest window.
--
-- The cost: if a reserved ticket ever gets stuck (an intent that dies without
-- releasing), its seat stays blocked until something frees it, rather than
-- being quietly resold. expire_stale_purchase_intents sweeps pending intents
-- every 10 minutes and, with section 1's trigger, now clears the seat too, so
-- the normal case self-heals within 10 minutes.
--
-- Exposure today: 0. Checked 2026-11-05 -- there are no 'reserved' tickets
-- holding a seat on prod at all. Worth re-checking in section 4 if seats ever
-- start looking stuck.
--
-- Also NOT changed: stamping tickets.admits at sale time. Phase 0 deferred
-- that to "when assign_seats_to_intent is repaired", but adding a feature to
-- the same change that fixes the money path is the mistake this plan keeps
-- avoiding. It is now unblocked and should be its own small change.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.assign_seats_to_intent(
  p_intent_id uuid, p_tier_id uuid, p_quantity integer,
  p_seat_ids uuid[], p_session_id text, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_chosen uuid[];
  v_held integer;
  v_own_live integer;
  v_result json;
  v_avoid boolean;
  v_pick jsonb;
  v_sec record;
  -- NEW: idempotency bookkeeping
  v_need integer;
  v_seatless integer;
  v_already uuid[];
  v_want uuid[];
BEGIN
  SELECT event_id INTO v_event_id FROM purchase_intents WHERE id = p_intent_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.event_id = v_event_id
      AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
  ) THEN
    RETURN NULL;
  END IF;

  -- ── IDEMPOTENCY GATE ──────────────────────────────────────────────────────
  -- Lock this intent's tickets first, so two concurrent runs cannot both read
  -- "nothing assigned yet". The second waits, then sees the first one's work.
  PERFORM 1 FROM tickets
   WHERE purchase_intent_id = p_intent_id
     AND status NOT IN ('cancelled','refunded')
   FOR UPDATE;

  -- v_already looks at EVERY live ticket on this order, not just the reserved
  -- ones. This is the subtle part. In the Hex Fest replay, run 1's ticket had
  -- already left 'reserved' by the time run 2 looked -- so a reserved-only
  -- scan would have reported "this order holds no seats" and handed out seat
  -- 11 a second time. Counting all live statuses is what actually makes the
  -- replay a no-op.
  --
  SELECT count(*) FILTER (WHERE status = 'reserved' AND seat_id IS NULL),
         array_remove(array_agg(seat_id), NULL)
    INTO v_seatless, v_already
  FROM tickets
  WHERE purchase_intent_id = p_intent_id
    AND status NOT IN ('cancelled','refunded');

  v_already := COALESCE(v_already, '{}'::uuid[]);

  -- v_need is what this CALL still has to do: the seats it asked for, minus
  -- the ones the order already holds.
  --
  -- It is deliberately NOT "every seatless ticket on the order". A mixed
  -- GA-plus-seated order has reserved tickets that are never meant to get a
  -- seat, and counting those would refuse a perfectly good checkout. It is
  -- also not p_quantity alone -- that is the old behaviour, and the bug.
  --
  --   first run        v_already = 0          -> v_need = p_quantity (unchanged)
  --   full re-run      v_already = p_quantity -> v_need = 0, no-op
  --   partial re-run   v_already = 1 of 2     -> v_need = 1, asks for the gap
  v_need := GREATEST(0, p_quantity - COALESCE(array_length(v_already, 1), 0));

  -- Cannot write more seats than there are tickets to put them on.
  IF v_need > v_seatless THEN
    RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
  END IF;

  -- Already done. Hand back what this order owns and touch nothing.
  IF v_need = 0 THEN
    SELECT json_agg(jsonb_build_object(
      'seat_id', s.id, 'section', sec.label, 'row', s.row_label,
      'seat', s.seat_number, 'label', s.label
    ) ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number)
    INTO v_result
    FROM tickets t
    JOIN seats s ON s.id = t.seat_id
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE t.purchase_intent_id = p_intent_id
      AND t.status NOT IN ('cancelled','refunded');
    RETURN v_result;
  END IF;
  -- ──────────────────────────────────────────────────────────────────────────

  IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN
    IF array_length(p_seat_ids, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
    END IF;

    -- Ask only for the seats this order does not already hold. On a first run
    -- v_already is empty and v_want = p_seat_ids exactly.
    SELECT array_agg(x) INTO v_want
    FROM (SELECT unnest(p_seat_ids) EXCEPT SELECT unnest(v_already)) q(x);
    v_want := COALESCE(v_want, '{}'::uuid[]);

    IF COALESCE(array_length(v_want, 1), 0) <> v_need THEN
      -- The caller's seat list and the tickets still needing one disagree.
      -- Refusing is correct: guessing which seat belongs to which ticket is
      -- exactly how the Hex Fest duplicate was made.
      RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
    END IF;

    IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
      SELECT count(*) INTO v_own_live
      FROM seat_holds h
      WHERE h.seat_id = ANY(v_want)
        AND h.session_id = p_session_id
        AND h.expires_at > now() - interval '30 seconds';

      IF v_own_live <> array_length(v_want, 1) THEN
        RAISE EXCEPTION 'SEATS_EXPIRED';
      END IF;
    END IF;

    WITH locked AS (
      SELECT s.id
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.id = ANY(v_want)
        AND s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        -- NEW: a seat already carried by a live ticket is not free, whatever
        -- seats.status says. seats.status is not flipped until
        -- book_seats_for_intent, which is the window Hex Fest fell through.
        -- 'pending_approval' is in the list because an approval event with a
        -- seat map parks a seat on a ticket that is not sold yet but is also
        -- not free -- see the note on the Phase 1 index at the bottom.
        AND NOT EXISTS (
          SELECT 1 FROM tickets x
          WHERE x.seat_id = s.id
            AND x.status IN ('valid','used','approved','pending_approval','reserved')
        )
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now() - interval '30 seconds'
            AND h.session_id != p_intent_id::text
            AND (p_session_id IS NULL OR h.session_id != p_session_id)
        )
      FOR UPDATE OF s SKIP LOCKED
    )
    SELECT array_agg(id) INTO v_chosen FROM locked;

    IF v_chosen IS NULL OR array_length(v_chosen, 1) != v_need THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  ELSE
    SELECT avoid_orphan_seats INTO v_avoid FROM events WHERE id = v_event_id;
    v_pick := NULL;
    FOR v_sec IN
      SELECT sec.id FROM event_sections sec
      WHERE sec.event_id = v_event_id AND sec.is_active
        AND (p_section_id IS NULL OR sec.id = p_section_id)
      ORDER BY sec.sort_order, sec.created_at
    LOOP
      -- v_need, not p_quantity: on a re-run we want only the missing seats.
      v_pick := pick_best_available(v_sec.id, p_tier_id, v_need, p_session_id, NULL, COALESCE(v_avoid, true), true, true);
      EXIT WHEN (v_pick->>'ok')::boolean;
    END LOOP;
    IF v_pick IS NULL OR NOT (v_pick->>'ok')::boolean THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
    SELECT array_agg((e->>'seat_id')::uuid) INTO v_chosen FROM jsonb_array_elements(v_pick->'seats') e;

    -- Belt and braces: pick_best_available must never return a seat this order
    -- already holds, nor one a live ticket holds. If it does, refuse rather
    -- than write a duplicate and let the Phase 1 index catch it at the UPDATE.
    IF EXISTS (
      SELECT 1 FROM unnest(v_chosen) c(id)
      WHERE c.id = ANY(v_already)
         OR EXISTS (SELECT 1 FROM tickets x
                    WHERE x.seat_id = c.id
                      AND x.status IN ('valid','used','approved','pending_approval','reserved'))
    ) THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  END IF;

  IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
    DELETE FROM seat_holds
    WHERE seat_id = ANY(v_chosen) AND session_id = p_session_id;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at, origin)
  SELECT unnest(v_chosen), p_intent_id::text,
         (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
         now() + interval '18 minutes',
         CASE WHEN p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN 'pick' ELSE 'auto' END
  ON CONFLICT (seat_id) DO NOTHING;

  SELECT count(*) INTO v_held FROM seat_holds
  WHERE session_id = p_intent_id::text AND seat_id = ANY(v_chosen);

  -- Compared to what we chose, not to p_quantity: on a partial re-run those
  -- differ, and comparing to p_quantity would wipe the order's holds.
  IF v_held != array_length(v_chosen, 1) THEN
    DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
    RAISE EXCEPTION 'SEATS_UNAVAILABLE';
  END IF;

  WITH ordered_tickets AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM tickets
    WHERE purchase_intent_id = p_intent_id
      AND status = 'reserved'
      AND seat_id IS NULL          -- NEW: never re-point a seated ticket
  ),
  ordered_seats AS (
    SELECT s.id AS seat_id,
           jsonb_build_object(
             'section', sec.label,
             'row', s.row_label,
             'seat', s.seat_number,
             'label', s.label
           ) AS info,
           row_number() OVER (ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number) AS rn
    FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.id = ANY(v_chosen)
  )
  UPDATE tickets t
  SET seat_id = os.seat_id, seat_info = os.info
  FROM ordered_tickets ot
  JOIN ordered_seats os ON os.rn = ot.rn
  WHERE t.id = ot.id;

  -- Read back from tickets so a re-run returns the whole order's seats, not
  -- just the ones added on this pass.
  SELECT json_agg(jsonb_build_object(
    'seat_id', s.id,
    'section', sec.label,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label
  ) ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number)
  INTO v_result
  FROM tickets t
  JOIN seats s ON s.id = t.seat_id
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE t.purchase_intent_id = p_intent_id
    AND t.status NOT IN ('cancelled','refunded');

  RETURN v_result;
END;
$function$;

comment on function public.assign_seats_to_intent(uuid,uuid,integer,uuid[],text,uuid) is
  'Idempotent since phase1b 2026-11-05: assigns seats ONLY to this intent''s reserved tickets that have none, and a re-run with nothing left to do returns the existing assignment unchanged. Before this, a second run re-issued the same seats and produced the Hex Fest double-booking.';

commit;


-- ── SECTION 2b — confirm it took. Read-only. ───────────────────────────────
--
-- Expect: both true.

select
  p.oid::regprocedure::text as fn,
  pg_get_functiondef(p.oid) ~ 'IDEMPOTENCY GATE'       as has_the_gate,
  pg_get_functiondef(p.oid) ~ 'AND seat_id IS NULL'    as never_repoints_a_seated_ticket
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text = 'assign_seats_to_intent(uuid,uuid,integer,uuid[],text,uuid)';


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — OPTIONAL. Two legacy functions that should not exist.
--
-- Read this section before running it. It DROPS things. Everything above is
-- additive or a replace; this is the only destructive part of phase1b, and
-- phase1b is complete and correct without it.
--
-- Repo migration 20261013100000_atomic_tier_reservation.sql already decided
-- both of these should go. That migration has never been applied to prod --
-- the ledger is squashed to the single 00000000000000 baseline, and the
-- baseline snapshot still contains both functions, so the DROPs never ran.
--
--   assign_seats_to_intent(uuid,uuid,integer,uuid[])   -- the 4-arg legacy
--     service_role only, no caller in the repository (create-purchase-intent
--     calls the 6-arg one by name). It predates session verification: it never
--     checks the BUYER still holds the seats, and it has NOT received the
--     idempotency fix above. Leaving it is leaving the Hex Fest bug alive in a
--     function one typo away from being called.
--
--   reserve_tickets(uuid,uuid,integer)                 -- the 3-arg legacy
--     ANON-EXECUTABLE, and skips the email requirement the 6-arg version
--     enforces. No caller in the repository.
--
-- Verify no caller yourself before running -- "no caller in the repository"
-- does not cover an integration or an edge function deployed outside it.
-- ════════════════════════════════════════════════════════════════════════════

-- drop function if exists public.assign_seats_to_intent(uuid, uuid, integer, uuid[]);
-- drop function if exists public.reserve_tickets(uuid, uuid, integer);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — watch. Read-only. Run again in a day or two.
--
-- squatters_returning MUST stay 0. If it climbs, a release path is bypassing
-- the trigger -- most likely something writing seat_id onto a row that is
-- ALREADY 'available' (an UPDATE that does not transition into the state, so
-- the trigger's IS DISTINCT FROM test correctly does not fire).
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from tickets
     where status = 'available' and seat_id is not null)          as squatters_returning,
  (select count(*) from (
     select seat_id from tickets
     where seat_id is not null and status in ('valid','used','approved')
     group by seat_id having count(*) > 1) q)                     as double_sold,
  (select count(*) from pg_trigger
     where tgrelid = 'public.tickets'::regclass
       and tgname = 'a_clear_seat_on_release'
       and tgenabled <> 'D')                                      as trigger_live,
  -- the one behaviour change: a stuck 'reserved' ticket now blocks its seat.
  -- A handful in flight is normal. A number that only grows means something
  -- is dying without releasing.
  (select count(*) from tickets t
     where t.status = 'reserved' and t.seat_id is not null)        as reserved_holding_a_seat,
  (select count(*) from tickets t
     join purchase_intents pi on pi.id = t.purchase_intent_id
     where t.status = 'reserved' and t.seat_id is not null
       and pi.status not in ('pending'))                           as reserved_on_a_dead_intent;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — OPTIONAL. A gap in the Phase 1 index: pending_approval.
--
-- The index built yesterday covers status IN ('valid','used','approved'). It
-- leaves out 'pending_approval' -- a registration awaiting the organiser's
-- yes. On a seated approval event that ticket parks a real seat: not sold, but
-- not free either. Two of them could sit on one seat and the index would not
-- notice; and if that seat were sold to someone else meanwhile, the approval
-- would later fail on the unique violation instead of at registration.
--
-- Section 2 above already refuses to hand out such a seat, so the hole is
-- closed on the way IN. This closes it in the database too.
--
-- Exposure today: zero. Seated tickets on prod are only valid / used /
-- available -- no ticket has ever held a seat in 'pending_approval'. So this
-- is prevention, and it is genuinely optional.
--
-- Cost: the index holds 92 rows, so drop-and-rebuild is sub-second. Run the
-- two statements together; between them the rule is briefly absent.
-- ════════════════════════════════════════════════════════════════════════════

-- begin;
-- drop index if exists public.tickets_one_live_ticket_per_seat;
-- create unique index tickets_one_live_ticket_per_seat
--   on public.tickets (seat_id)
--   where seat_id is not null
--     and status in ('valid','used','approved','pending_approval');
-- commit;


-- ════════════════════════════════════════════════════════════════════════════
-- NOT FIXED HERE -- found during this audit, reported separately
--
--   release_expired_reservations() is ANON- and PUBLIC-executable, and its
--   ticket UPDATE has NO `AND status = 'reserved'` filter. It reverts EVERY
--   ticket on a pending-expired intent to 'available', sold ones included.
--   Nothing calls it and no cron runs it. Checked 2026-11-05: 1 pending-expired
--   intent exists and it holds 0 sold tickets, so the exposure is 0 right now.
--   It is a loaded gun with nothing in front of the barrel, not an active
--   incident. Fixing it means deciding whether to repair or drop it, which is
--   a separate call.
--
--   Its GET DIAGNOSTICS also reads ROW_COUNT after the purchase_intents
--   UPDATE, so the integer it returns counts intents expired, not tickets
--   released. The name lies.
--
-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run after sections 1 and 2 are confirmed.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105140000', 'phase1b_seat_leak_and_idempotency');
--
-- ROLLBACK
--   1. drop trigger if exists a_clear_seat_on_release on public.tickets;
--      drop function if exists public.clear_seat_on_release();
--      (These two ARE destructive and the editor will say so. That is correct.)
--   2. run rollback/before_phase1b.sql  (restores the previous
--      assign_seats_to_intent verbatim, captured from prod 2026-11-05)
--   3. delete from supabase_migrations.schema_migrations
--        where version = '20261105140000';
-- ════════════════════════════════════════════════════════════════════════════
