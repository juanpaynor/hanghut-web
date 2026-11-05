-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2d — the occurrence generator
--
-- NOT YET APPLIED. For review.
--
-- Run it in the Supabase SQL editor, then record the ledger row at the bottom.
-- Do NOT use `supabase db push` -- the prod ledger is squashed to one baseline.
--
-- Design doc: https://claude.ai/artifact/5CEnSBPZJqL697FfZd6iz9
--
-- ── What this adds ──────────────────────────────────────────────────────────
--
-- ONE function: sync_occurrences_for_rule(uuid). It makes the nights a rule
-- describes, and retires the ones it no longer describes. One function rather
-- than a generate/regenerate pair, because two functions that compute the same
-- set of nights eventually disagree about one of them.
--
-- There is NO CRON. The decision was to generate every night up front through
-- the rule's ends_on, so this is called when a rule is saved. Nothing to
-- schedule and nothing that can silently stop topping up.
--
-- ── Blast radius: nothing until something calls it ──────────────────────────
--
-- A new function that no caller invokes. There are 0 rows in
-- event_recurrence_rules on prod, so there is nothing for it to act on even if
-- it were called. No existing function, trigger, policy or index is touched.
--
-- ── Two design choices worth disagreeing with, if you do ────────────────────
--
-- 1. SECURITY INVOKER, not DEFINER. Authorisation is RLS's job here: the
--    `event_occurrences_organizer_all` and `event_recurrence_rules_organizer_all`
--    policies already say who may write which event's nights, so an organiser
--    calling this can only ever affect their own. A SECURITY DEFINER function
--    would have to re-implement that check by hand, and a hand-rolled
--    ownership check is exactly how `get_admin_partner_stats` ended up
--    readable by anon.
--
-- 2. Retiring a night asks the FOREIGN KEY, not a count query. To decide
--    "delete this night or just cancel it", the obvious move is to count its
--    tickets. But under SECURITY INVOKER, RLS may hide tickets from the
--    caller, so the count can come back 0 for a night that has sales. So it
--    tries the DELETE and catches foreign_key_violation. The FK cannot be
--    fooled by RLS, which makes it the only honest authority on the question.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — pre-flight. Read it before section 2.
--
-- Expect: fn_already_there 0, rules 0, occurrences 0, unique_start_index 1.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_occurrences_for_rule')      as fn_already_there,
  (select count(*) from public.event_recurrence_rules)                           as rules,
  (select count(*) from public.event_occurrences)                                as occurrences,
  (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'event_occurrences_event_start_key' and i.indisunique)     as unique_start_index;

-- STOP if unique_start_index is not 1 -- the ON CONFLICT below infers it, and
-- without it the function raises 42P10 instead of de-duplicating.


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — the function
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.sync_occurrences_for_rule(p_rule_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_rule      record;
  v_tz        text;
  v_wanted    timestamptz[];
  v_created   integer := 0;
  v_cancelled integer := 0;
  v_deleted   integer := 0;
  v_night     record;
  v_starts    timestamptz;
BEGIN
  -- Lock the rule for the duration. Without it, two saves in quick succession
  -- both compute the same night list and race on the insert; the unique index
  -- would catch the duplicate, but one of the two callers would get an error
  -- instead of a result.
  SELECT r.*, e.timezone
    INTO v_rule
  FROM event_recurrence_rules r
  JOIN events e ON e.id = r.event_id
  WHERE r.id = p_rule_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    -- Also the answer when RLS hides the rule from this caller, which is the
    -- correct response either way: you cannot sync what you cannot see.
    RETURN jsonb_build_object('ok', false, 'error', 'RULE_NOT_FOUND');
  END IF;

  IF NOT v_rule.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RULE_INACTIVE',
      'detail', 'Reactivate the rule before syncing. Nothing was changed.');
  END IF;

  v_tz := COALESCE(NULLIF(trim(v_rule.timezone), ''), 'Asia/Manila');

  -- An unknown IANA name throws here rather than silently producing nights in
  -- the wrong hour. No CHECK constraint can catch this (Postgres has no
  -- immutable timezone validator), so this is where a typo surfaces.
  BEGIN
    PERFORM (now() AT TIME ZONE v_tz);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BAD_TIMEZONE',
      'detail', format('events.timezone is %L, which Postgres does not recognise', v_tz));
  END;

  -- ── The night list ───────────────────────────────────────────────────────
  --
  -- `(date + start_time) AT TIME ZONE tz` reads the local wall-clock time and
  -- returns the instant it happened. Verified on prod: Tue-Sun 20:00 in
  -- Asia/Manila becomes 12:00Z and round-trips back to 20:00.
  --
  -- DST, for the day someone uses a zone that has it: a local time that does
  -- not exist (spring forward) is shifted by Postgres, and one that happens
  -- twice (autumn back) resolves to one of them. Asia/Manila has no DST so
  -- this cannot bite today. It is not solved here, only named.
  SELECT array_agg(((d::date + v_rule.start_time) AT TIME ZONE v_tz) ORDER BY d)
    INTO v_wanted
  FROM generate_series(v_rule.starts_on::timestamp, v_rule.ends_on::timestamp, '1 day') d
  WHERE extract(dow from d)::smallint = ANY (v_rule.byweekday);

  IF v_wanted IS NULL THEN
    v_wanted := ARRAY[]::timestamptz[];
  END IF;

  -- Belt to the span cap's braces. event_recurrence_rules_span_cap already
  -- bounds this at 733, so reaching 1000 means the constraint was dropped or
  -- widened and this function should refuse rather than discover why.
  IF array_length(v_wanted, 1) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_NIGHTS',
      'detail', format('%s nights requested; the cap is 1000', array_length(v_wanted, 1)));
  END IF;

  -- ── 1. Create the missing nights ─────────────────────────────────────────
  --
  -- ON CONFLICT infers event_occurrences_event_start_key, so re-running this
  -- is a no-op rather than a duplicate. That also means a night previously
  -- CANCELLED stays cancelled when the rule re-adds it: buyers may already
  -- have been refunded for it, so bringing it back is an explicit decision for
  -- the organiser, not a side effect of editing a pattern.
  FOREACH v_starts IN ARRAY v_wanted LOOP
    INSERT INTO event_occurrences (event_id, recurrence_rule_id, starts_at, ends_at)
    VALUES (
      v_rule.event_id,
      p_rule_id,
      v_starts,
      v_starts + (v_rule.duration_minutes || ' minutes')::interval
    )
    ON CONFLICT (event_id, starts_at) DO NOTHING;

    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  -- ── 2. Retire the nights this rule no longer describes ───────────────────
  --
  -- Only nights THIS rule made, and only ones still 'scheduled'. A one-off
  -- night added by hand has recurrence_rule_id NULL and is never touched here.
  FOR v_night IN
    SELECT o.id, o.starts_at
    FROM event_occurrences o
    WHERE o.recurrence_rule_id = p_rule_id
      AND o.status = 'scheduled'
      AND NOT (o.starts_at = ANY (v_wanted))
  LOOP
    BEGIN
      DELETE FROM event_occurrences WHERE id = v_night.id;
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Something is sold, held or ordered for this night. It stays on the
      -- books as cancelled; whether to refund is the organiser's call.
      UPDATE event_occurrences
         SET status = 'cancelled', updated_at = now()
       WHERE id = v_night.id;
      v_cancelled := v_cancelled + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',        true,
    'rule_id',   p_rule_id,
    'event_id',  v_rule.event_id,
    'timezone',  v_tz,
    'wanted',    COALESCE(array_length(v_wanted, 1), 0),
    'created',   v_created,
    'deleted',   v_deleted,
    'cancelled', v_cancelled
  );
END;
$function$;

comment on function public.sync_occurrences_for_rule(uuid) is
  'Makes the nights a recurrence rule describes and retires the ones it no longer does. Called when a rule is saved -- there is no cron. SECURITY INVOKER so RLS decides who may touch which event. Retiring asks the FK (try DELETE, catch foreign_key_violation then cancel) rather than counting tickets, because RLS can hide tickets from the caller.';

-- Executable by organisers and the backend. NOT by anon: PUBLIC and anon are
-- independent grants, so both are revoked by name.
revoke all on function public.sync_occurrences_for_rule(uuid) from PUBLIC, anon;
grant execute on function public.sync_occurrences_for_rule(uuid) to authenticated, service_role;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — PROVE IT. Writes, then ROLLS BACK. Nothing survives.
--
-- Raises TEST_COMPLETE_ROLLING_BACK on success. That error IS the pass.
--
-- ── This test must NEVER write to `events`. Here is why. ───────────────────
--
-- An earlier draft of this file did `update events set timezone = ...`. There
-- are TEN triggers on `events`, none with a WHEN clause, so all of them fire
-- on every UPDATE:
--
--   trg_notify_followers_new_event     net.http_post  -- real HTTP
--   trg_notify_past_buyers_new_event   net.http_post  -- real HTTP
--   trg_new_event_automation           pgmq           -- queue push
--   trigger_mint_tickets               MINTS TICKETS on UPDATE
--   on_event_published                 posts to the social feed
--   + search vector, slug, location, updated_at
--
-- They have internal guards and a rollback discards ordinary table writes,
-- but "probably guarded" is not a reason to poke a table that can mint
-- inventory and post to a feed. All 481 events already carry 'Asia/Manila',
-- so the timezone write was never needed. It is gone, and so is the
-- BAD_TIMEZONE test that depended on corrupting a real event -- that branch
-- stays unproven here rather than earning its proof this way.
--
-- What this still writes: rows in event_recurrence_rules and
-- event_occurrences (both empty, both new) and ONE ticket on a draft event.
-- Inserting that ticket fires five triggers; the only one that calls out,
-- trg_notify_organizer_on_paid_ticket, is gated on registration_id IS NOT NULL
-- and the insert omits it, so no request is built.
--
-- Note: this runs as the SQL editor's role, which bypasses RLS, so it proves
-- the arithmetic and the retire logic, NOT the authorisation. Section 4
-- checks the grants separately.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_event   uuid;
  v_status  text;
  v_rule    uuid;
  v_res     jsonb;
  v_nights  integer;
  v_mondays integer;
  v_local   text;
begin
  -- A DRAFT event with a tier, preferring one whose title says it is a test.
  -- Draft matters: nothing is on sale, so even the rolled-back ticket insert
  -- cannot touch a live event's counters mid-flight.
  select e.id, e.status::text
    into v_event, v_status
  from public.events e
  where e.status = 'draft'
    and exists (select 1 from public.ticket_tiers t where t.event_id = e.id)
  order by (e.title ilike '%DRAFT%' or e.title ilike '%test%') desc, e.created_at desc
  limit 1;

  if v_event is null then
    raise exception 'TEST CANNOT RUN: no draft event with a tier';
  end if;
  -- Refuse to run against anything that could be selling.
  if v_status <> 'draft' then
    raise exception 'TEST REFUSED: picked a % event, expected draft', v_status;
  end if;

  -- Tue..Sun, 8pm, 3 hours, a 14-day window: 12 nights, no Mondays.
  insert into public.event_recurrence_rules
    (event_id, byweekday, start_time, duration_minutes, starts_on, ends_on)
  values
    (v_event, array[2,3,4,5,6,0]::smallint[], '20:00', 180,
     '2026-11-05', '2026-11-18')
  returning id into v_rule;

  -- ── TEST 1. The right number of nights, and no Mondays.
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'TEST 1 FAILED: %', v_res::text;
  end if;
  if (v_res->>'created')::int <> 12 then
    raise exception 'TEST 1 FAILED: expected 12 nights, got % (%)',
      v_res->>'created', v_res::text;
  end if;
  select count(*) into v_mondays from public.event_occurrences
   where recurrence_rule_id = v_rule
     and extract(dow from starts_at at time zone 'Asia/Manila') = 1;
  if v_mondays <> 0 then
    raise exception 'TEST 1 FAILED: % Mondays generated', v_mondays;
  end if;
  raise notice 'TEST 1 passed: 12 nights, 0 Mondays';

  -- ── TEST 2. The local time is 8pm, not 8pm UTC. This is the whole reason
  --    events.timezone exists.
  select distinct to_char(starts_at at time zone 'Asia/Manila', 'HH24:MI')
    into v_local
  from public.event_occurrences where recurrence_rule_id = v_rule;
  if v_local is distinct from '20:00' then
    raise exception 'TEST 2 FAILED: local start time is %, expected 20:00', v_local;
  end if;
  raise notice 'TEST 2 passed: every night starts at 20:00 local';

  -- ── TEST 3. Idempotent. Running it again must create nothing.
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'created')::int <> 0 or (v_res->>'deleted')::int <> 0 then
    raise exception 'TEST 3 FAILED: second run was not a no-op (%)', v_res::text;
  end if;
  raise notice 'TEST 3 passed: re-running changed nothing';

  -- ── TEST 4. Drop Tuesdays from the rule. The two Tuesday nights must go,
  --    and nothing else may move.
  update public.event_recurrence_rules
     set byweekday = array[3,4,5,6,0]::smallint[]
   where id = v_rule;
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'deleted')::int <> 2 then
    raise exception 'TEST 4 FAILED: expected 2 Tuesdays deleted, got % (%)',
      v_res->>'deleted', v_res::text;
  end if;
  select count(*) into v_nights from public.event_occurrences where recurrence_rule_id = v_rule;
  if v_nights <> 10 then
    raise exception 'TEST 4 FAILED: % nights left, expected 10', v_nights;
  end if;
  raise notice 'TEST 4 passed: 2 ticketless Tuesdays deleted, 10 nights left';

  -- ── TEST 5. A night with a ticket must be CANCELLED, not deleted. This is
  --    the promise that a Tuesday buyer does not lose their night when the
  --    organiser edits the pattern.
  declare
    v_night uuid;
    v_tier  uuid;
  begin
    select id into v_night from public.event_occurrences
     where recurrence_rule_id = v_rule and status = 'scheduled'
     order by starts_at limit 1;
    select id into v_tier from public.ticket_tiers where event_id = v_event limit 1;

    insert into public.tickets (event_id, ticket_number, tier_id, status, occurrence_id)
    values (v_event, 'TEST-OCC-TICKET', v_tier, 'valid', v_night);

    -- Now make the rule describe only Mondays, which this window has two of
    -- and none of the existing nights are.
    update public.event_recurrence_rules
       set byweekday = array[1]::smallint[]
     where id = v_rule;
    v_res := public.sync_occurrences_for_rule(v_rule);

    if (v_res->>'cancelled')::int < 1 then
      raise exception 'TEST 5 FAILED: the ticketed night was not cancelled (%)', v_res::text;
    end if;
    if not exists (select 1 from public.event_occurrences
                    where id = v_night and status = 'cancelled') then
      raise exception 'TEST 5 FAILED: the ticketed night is not in cancelled state';
    end if;
    if not exists (select 1 from public.tickets where occurrence_id = v_night) then
      raise exception 'TEST 5 FAILED: the ticket was destroyed';
    end if;
    raise notice 'TEST 5 passed: ticketed night cancelled, ticket survived';
  end;

  -- ── TEST 6. An inactive rule must refuse, and change nothing.
  update public.event_recurrence_rules set is_active = false where id = v_rule;
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'error') is distinct from 'RULE_INACTIVE' then
    raise exception 'TEST 6 FAILED: inactive rule returned %', v_res::text;
  end if;
  raise notice 'TEST 6 passed: inactive rule refused';

  raise notice 'ALL 6 TESTS PASSED. Rolling everything back now.';
  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;

-- Expect six "passed" NOTICEs then
--   ERROR: P0001: TEST_COMPLETE_ROLLING_BACK
-- which is the SUCCESS signal. The rule, every night and the test ticket are
-- all undone, and `events` was never written to.


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — post-flight. The function exists, anon cannot call it, and the
-- test left nothing behind.
--
-- Expect: fn_exists 1, anon_can_execute false, authenticated_can_execute true,
-- every count 0, events_on_manila = events_total (481).
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_occurrences_for_rule')      as fn_exists,
  has_function_privilege('anon',          'public.sync_occurrences_for_rule(uuid)', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'public.sync_occurrences_for_rule(uuid)', 'EXECUTE') as authenticated_can_execute,
  (select count(*) from public.event_recurrence_rules)                           as rules_left,
  (select count(*) from public.event_occurrences)                                as occurrences_left,
  (select count(*) from public.tickets where ticket_number like 'TEST-%')        as stray_test_tickets,
  (select count(*) from public.events)                                           as events_total,
  (select count(*) from public.events where timezone = 'Asia/Manila')            as events_on_manila;

-- STOP if anon_can_execute is true, or anything *_left is not 0, or
-- events_on_manila <> events_total (the test rewrote one event's timezone and
-- the rollback must have put it back).


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only AFTER section 4 reads clean.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105180000', 'phase2d_occurrence_generator');
--
-- ROLLBACK
--   drop function if exists public.sync_occurrences_for_rule(uuid);
--
--   Nothing calls it, so dropping it is complete. Any nights it created stay;
--   delete them per rule with
--     delete from public.event_occurrences where recurrence_rule_id = '<rule>';
--   which the FK will refuse for a night that has tickets -- correctly.
--
-- NEXT: 2e. The four money-path functions take an occurrence AND repoint
-- `ON CONFLICT (seat_id)` to `(seat_id, occurrence_id)`. That inference is
-- already proven to work (2c test 6). 2e is the risky step: it rewrites
-- hold_seat, hold_best_available and both assign_seats_to_intent overloads,
-- and assign_seats_to_intent is the function that caused the Hex Fest
-- double-booking. Read all four in full and write rollback/before_phase2e.sql
-- before changing any of them.
-- ════════════════════════════════════════════════════════════════════════════
