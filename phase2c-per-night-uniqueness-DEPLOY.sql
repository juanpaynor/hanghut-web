-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2c — per-night uniqueness, ADDED ALONGSIDE the old rules
--
-- NOT YET APPLIED. For review.
--
-- Run it in the Supabase SQL editor, then record the ledger row at the bottom.
-- Do NOT use `supabase db push` -- the prod ledger is squashed to one baseline.
--
-- Design doc: https://claude.ai/artifact/5CEnSBPZJqL697FfZd6iz9
--
-- ── THE PLAN CHANGED. Read this before anything else. ───────────────────────
--
-- The design said 2c would SWAP both unique rules for
-- `(seat_id, occurrence_id) NULLS NOT DISTINCT`. Doing that in one step would
-- have broken every seated checkout on the platform.
--
-- Four functions insert into seat_holds with `ON CONFLICT (seat_id) DO NOTHING`:
--
--     hold_seat(uuid, text, uuid)
--     hold_best_available(uuid, uuid, uuid, integer, text, uuid, boolean, uuid[])
--     assign_seats_to_intent(uuid, uuid, integer, uuid[])              -- legacy
--     assign_seats_to_intent(uuid, uuid, integer, uuid[], text, uuid)
--
-- Postgres resolves `ON CONFLICT (seat_id)` by INDEX INFERENCE: it looks for a
-- unique index on exactly that column set. Drop `seat_holds_seat_id_key` and
-- all four raise
--
--     42P10: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- immediately, on the money path, for every buyer picking a seat. A partial
-- index on (seat_id) WHERE occurrence_id IS NULL does not rescue it either --
-- inference against a partial index needs the INSERT to repeat the predicate.
--
-- So this step ONLY ADDS. Both old rules stay exactly as they are.
--
--   2c (this file)  add the new indexes beside the old ones. The old ones are
--                   STRICTER, so they keep winning and nothing changes.
--   2e (later)      rewrite those four functions to take an occurrence and to
--                   say `ON CONFLICT (seat_id, occurrence_id)`. They are being
--                   rewritten in 2e anyway, so the conflict target rides along
--                   -- one touch of the money path instead of two.
--   2g (last)       drop the two old indexes. Only then can a second night be
--                   sold, and only after 2e is live and verified.
--
-- ── Blast radius: nothing, and the reason is arithmetic ─────────────────────
--
-- Every ticket and every hold on prod has occurrence_id = NULL (verified in
-- 2b: 0 rows with a value). So for every existing row the new key
-- (seat_id, NULL) is one-to-one with the old key (seat_id). Any write the old
-- index refuses, the new one refuses too, and vice versa. They cannot
-- disagree until something sets occurrence_id, and nothing can until 2e.
--
-- ── The trap this step exists to defuse ────────────────────────────────────
--
-- Postgres treats two NULLs as DISTINCT in a unique index. A plain
-- `UNIQUE (seat_id, occurrence_id)` would therefore accept (seat 5, NULL)
-- TWICE -- quietly undoing Phase 1 for all 481 existing events while looking
-- completely correct. `NULLS NOT DISTINCT` (PG 15+, prod is 17.6) is the whole
-- point of this file, and section 3 proves it by trying to break it.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — pre-flight. Run this FIRST and read it.
--
-- Expect: old_tickets_index 1, old_holds_index 1, new indexes 0 and 0,
-- tickets_with_occurrence 0, holds_with_occurrence 0, pg_major 17.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_class where relname = 'tickets_one_live_ticket_per_seat')       as old_tickets_index,
  (select count(*) from pg_class where relname = 'seat_holds_seat_id_key')                 as old_holds_index,
  (select count(*) from pg_class where relname = 'tickets_one_live_ticket_per_seat_night') as new_tickets_index,
  (select count(*) from pg_class where relname = 'seat_holds_one_hold_per_seat_night')     as new_holds_index,
  (select count(*) from public.tickets    where occurrence_id is not null)                 as tickets_with_occurrence,
  (select count(*) from public.seat_holds where occurrence_id is not null)                 as holds_with_occurrence,
  (select count(*) from public.event_occurrences)                                          as occurrence_rows,
  current_setting('server_version_num')::int / 10000                                       as pg_major;

-- STOP if: pg_major < 15 (NULLS NOT DISTINCT does not exist below 15),
-- either old index is missing, either new index already exists, or either
-- *_with_occurrence is not 0.


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — add the two new indexes
--
-- Plain CREATE, not CONCURRENTLY: the Supabase SQL editor wraps statements in
-- a transaction and CONCURRENTLY cannot run inside one. `tickets` is 64,756
-- rows / 22 MB and `seat_holds` is tiny, so the brief ACCESS EXCLUSIVE lock is
-- irrelevant. (A CONCURRENTLY variant is at the bottom for when the table is
-- big -- with the warning that a failed concurrent build leaves a silent
-- INVALID index that enforces nothing.)
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── tickets ─────────────────────────────────────────────────────────────────
--
-- Same WHERE clause as the Phase 1 index, deliberately. `reserved` stays out
-- so an ordinary checkout race remains a seat_holds matter and not a 500, and
-- cancelled/refunded stay out so a voided ticket keeps its seat for the record.
--
-- NULLS NOT DISTINCT sits after the column list and before WHERE. Without it
-- this index would be decoration.

create unique index tickets_one_live_ticket_per_seat_night
  on public.tickets (seat_id, occurrence_id)
  nulls not distinct
  where seat_id is not null and status in ('valid', 'used', 'approved');

comment on index public.tickets_one_live_ticket_per_seat_night is
  'One live ticket per seat PER NIGHT. NULLS NOT DISTINCT is load-bearing: without it two NULL occurrences count as different and the same seat sells twice on a single-night event. Replaces tickets_one_live_ticket_per_seat in step 2g.';


-- ── seat_holds ──────────────────────────────────────────────────────────────
--
-- Not partial: seat_id is NOT NULL on this table and every row is a live hold
-- (expired ones are deleted, not flagged).
--
-- This is the index step 2e will aim `ON CONFLICT (seat_id, occurrence_id)` at.
-- It must be non-partial for that inference to work without the INSERT
-- repeating a predicate.

create unique index seat_holds_one_hold_per_seat_night
  on public.seat_holds (seat_id, occurrence_id)
  nulls not distinct;

comment on index public.seat_holds_one_hold_per_seat_night is
  'One hold per seat PER NIGHT. seat_holds_seat_id_key (seat_id only) still exists and is stricter; it is dropped in 2g, AFTER 2e repoints the four ON CONFLICT (seat_id) clauses here.';

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — PROVE IT. This writes, then ROLLS BACK. Nothing survives.
--
-- It raises TEST_COMPLETE_ROLLING_BACK on success. That error IS the pass.
-- Any OTHER error, or no error at all, is a failure -- read the NOTICEs.
--
-- Why it drops the old indexes inside the block: with both present, a refused
-- duplicate could have been refused by the OLD index, proving nothing about
-- the new one. Dropping them first isolates the new index as the only thing
-- that can object. The rollback puts them straight back.
--
-- `seat_holds_seat_id_key` is a UNIQUE CONSTRAINT, not a bare index, so it
-- needs `alter table ... drop constraint`; `drop index` alone would fail with
-- "cannot drop index because constraint requires it". Both forms are issued
-- below so the block works either way.
--
-- ── Inserting tickets on prod fires five triggers. Checked, all safe: ───────
--
--   trg_notify_organizer_on_paid_ticket  calls net.http_post -- a REAL HTTP
--       request to the notify-organizer edge function. It cannot fire here:
--       its loop is gated on `nt.registration_id IS NOT NULL`, and the test
--       insert never sets registration_id, so the loop body is never entered
--       and no request is built. (pg_net also queues into a table inside the
--       transaction, so a rollback would discard it -- but the gate is the
--       reason to rely on, not that.)
--   trg_auto_follow_organizer            returns immediately when
--       NEW.user_id IS NULL, which it is here. No follow row is written.
--   trg_sync_event_tickets_sold          writes events.tickets_sold.
--   trigger_update_tier_quantity_sold    writes ticket_tiers.quantity_sold.
--   trigger_populate_ticket_guest_info   fills guest columns.
--       All three are ordinary table writes inside this transaction and are
--       undone by the rollback. The counters go back to what they were.
--
-- If you would rather not write to prod at all, even rolled back: skip
-- section 3. Sections 2 and 4 stand alone, and the cost of skipping is that
-- NULLS NOT DISTINCT is then unproven -- which is the one thing in this phase
-- that fails silently.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_seat      uuid;
  v_event     uuid;
  v_tier      uuid;
  v_occ_a     uuid;
  v_occ_b     uuid;
  v_refused   boolean;
  v_allowed   boolean;
begin
  -- Isolate the new indexes as the only enforcement in play.
  drop index public.tickets_one_live_ticket_per_seat;
  alter table public.seat_holds drop constraint if exists seat_holds_seat_id_key;
  drop index if exists public.seat_holds_seat_id_key;

  -- A seat that a live ticket already holds, on a NULL occurrence -- i.e. the
  -- situation every one of the 481 existing events is in.
  select t.seat_id, t.event_id, t.tier_id
    into v_seat, v_event, v_tier
  from public.tickets t
  where t.seat_id is not null
    and t.status in ('valid', 'used', 'approved')
    and t.occurrence_id is null
  limit 1;

  if v_seat is null then
    raise exception 'TEST CANNOT RUN: no live seated ticket found';
  end if;

  -- Two nights to test the "different nights are allowed" half.
  insert into public.event_occurrences (event_id, starts_at)
  values (v_event, now() + interval '400 days') returning id into v_occ_a;
  insert into public.event_occurrences (event_id, starts_at)
  values (v_event, now() + interval '401 days') returning id into v_occ_b;

  -- ── TEST 1. THE WHOLE POINT. A second live ticket on the same seat with a
  --    NULL occurrence must still be REFUSED. This is what a plain
  --    UNIQUE (seat_id, occurrence_id) would have silently allowed.
  v_refused := false;
  begin
    insert into public.tickets (event_id, ticket_number, seat_id, tier_id, status, occurrence_id)
    values (v_event, 'TEST-NULL-DUP-1', v_seat, v_tier, 'valid', null);
    raise notice 'TEST 1 FAILED: a duplicate seat on a NULL occurrence was ACCEPTED';
  exception when unique_violation then
    v_refused := true;
    raise notice 'TEST 1 passed: duplicate on NULL occurrence refused';
  end;
  if not v_refused then
    raise exception 'TEST 1 FAILED -- NULLS NOT DISTINCT is not working. DO NOT PROCEED TO 2g.';
  end if;

  -- ── TEST 2. The same seat on a DIFFERENT night must be ALLOWED. This is
  --    the feature: one table, six nights, six sales.
  v_allowed := false;
  begin
    insert into public.tickets (event_id, ticket_number, seat_id, tier_id, status, occurrence_id)
    values (v_event, 'TEST-NIGHT-A', v_seat, v_tier, 'valid', v_occ_a);
    v_allowed := true;
    raise notice 'TEST 2 passed: same seat on another night accepted';
  exception when unique_violation then
    raise notice 'TEST 2 FAILED: same seat on a different night was REFUSED';
  end;
  if not v_allowed then
    raise exception 'TEST 2 FAILED -- per-night selling still blocked.';
  end if;

  -- ── TEST 3. Twice on the SAME night must be refused.
  v_refused := false;
  begin
    insert into public.tickets (event_id, ticket_number, seat_id, tier_id, status, occurrence_id)
    values (v_event, 'TEST-NIGHT-A-DUP', v_seat, v_tier, 'valid', v_occ_a);
    raise notice 'TEST 3 FAILED: the same seat sold twice on the same night';
  exception when unique_violation then
    v_refused := true;
    raise notice 'TEST 3 passed: double-sale on one night refused';
  end;
  if not v_refused then
    raise exception 'TEST 3 FAILED -- the index does not bite within a night.';
  end if;

  -- ── TEST 4. Same three rules for seat_holds.
  --
  -- origin must be one of 'pick' | 'auto' | 'box_office' | 'api'
  -- (seat_holds_origin_check). 'web' is NOT valid -- a first run of this file
  -- guessed it and failed here with 23514.
  --
  -- Clear any real hold on this seat first. Without this, if the chosen seat
  -- happens to carry a live hold, the baseline insert below raises
  -- unique_violation OUTSIDE a guard and aborts the whole block with a
  -- confusing error instead of a test result. The delete is undone by the
  -- rollback like everything else here.
  delete from public.seat_holds where seat_id = v_seat;

  v_refused := false;
  insert into public.seat_holds (seat_id, session_id, expires_at, origin, occurrence_id)
  values (v_seat, 'test-session-null', now() + interval '10 minutes', 'pick', null);
  begin
    insert into public.seat_holds (seat_id, session_id, expires_at, origin, occurrence_id)
    values (v_seat, 'test-session-null-2', now() + interval '10 minutes', 'pick', null);
    raise notice 'TEST 4 FAILED: two holds on one seat with NULL occurrence';
  exception when unique_violation then
    v_refused := true;
    raise notice 'TEST 4 passed: second hold on NULL occurrence refused';
  end;
  if not v_refused then
    raise exception 'TEST 4 FAILED -- seat_holds NULLS NOT DISTINCT is not working.';
  end if;

  -- ── TEST 5. A hold on the same seat for a different night is allowed. This
  --    is the phantom sold-out that seat_holds_seat_id_key causes today.
  v_allowed := false;
  begin
    insert into public.seat_holds (seat_id, session_id, expires_at, origin, occurrence_id)
    values (v_seat, 'test-session-night-b', now() + interval '10 minutes', 'pick', v_occ_b);
    v_allowed := true;
    raise notice 'TEST 5 passed: hold on another night accepted';
  exception when unique_violation then
    raise notice 'TEST 5 FAILED: hold on another night refused';
  end;
  if not v_allowed then
    raise exception 'TEST 5 FAILED -- holds still collide across nights.';
  end if;

  -- ── TEST 6. ON CONFLICT (seat_id, occurrence_id) must INFER against the new
  --    index. This is exactly what step 2e will depend on, and if inference
  --    does not resolve here it will not resolve there either.
  begin
    insert into public.seat_holds (seat_id, session_id, expires_at, origin, occurrence_id)
    values (v_seat, 'test-session-oc', now() + interval '10 minutes', 'pick', null)
    on conflict (seat_id, occurrence_id) do nothing;
    raise notice 'TEST 6 passed: ON CONFLICT (seat_id, occurrence_id) inferred, no error';
  exception when others then
    raise exception 'TEST 6 FAILED -- ON CONFLICT could not infer the new index: % (%)', sqlerrm, sqlstate;
  end;

  raise notice 'ALL 6 TESTS PASSED. Rolling everything back now.';
  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;

-- You should see six "passed" NOTICEs and then
--   ERROR: P0001: TEST_COMPLETE_ROLLING_BACK
-- That error is the SUCCESS signal. Everything above it was undone, including
-- the dropped indexes.


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — post-flight. Confirm the old indexes came back and the new ones
-- are real.
--
-- Expect: every count 1, both new indexes unique + valid + nullsnotdistinct.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_class where relname = 'tickets_one_live_ticket_per_seat') as old_tickets_index_back,
  (select count(*) from pg_class where relname = 'seat_holds_seat_id_key')           as old_holds_index_back,
  (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'tickets_one_live_ticket_per_seat_night'
       and i.indisunique and i.indisvalid and i.indnullsnotdistinct)                 as new_tickets_index_good,
  (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'seat_holds_one_hold_per_seat_night'
       and i.indisunique and i.indisvalid and i.indnullsnotdistinct)                 as new_holds_index_good,
  (select count(*) from public.event_occurrences)                                     as occurrence_rows_still_zero,
  (select count(*) from public.tickets where ticket_number like 'TEST-%')             as test_tickets_left_behind;

-- STOP if: either old index did not come back, either new index is not good,
-- occurrence_rows_still_zero is not 0, or test_tickets_left_behind is not 0.


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only AFTER section 4 reads clean.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105170000', 'phase2c_per_night_uniqueness_indexes');
--
-- ROLLBACK -- both new indexes are additive and currently redundant, so
-- dropping them returns prod to its exact pre-2c state:
--
--     drop index if exists public.seat_holds_one_hold_per_seat_night;
--     drop index if exists public.tickets_one_live_ticket_per_seat_night;
--
-- CONCURRENTLY variant, for when these tables are big enough to care. Each
-- must run OUTSIDE a transaction (so not in the Supabase editor as-is), and
-- `indisvalid` must be checked afterwards -- a failed concurrent build leaves
-- an INVALID index that silently enforces nothing:
--
--   create unique index concurrently tickets_one_live_ticket_per_seat_night
--     on public.tickets (seat_id, occurrence_id) nulls not distinct
--     where seat_id is not null and status in ('valid','used','approved');
--   create unique index concurrently seat_holds_one_hold_per_seat_night
--     on public.seat_holds (seat_id, occurrence_id) nulls not distinct;
--
-- NEXT: step 2d (the generator), then 2e (the four functions take an
-- occurrence AND repoint ON CONFLICT), then 2g drops the two old indexes.
-- Nothing can sell a second night until 2g, by design.
-- ════════════════════════════════════════════════════════════════════════════
