-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2a + 2b — the occurrence layer, inert
--
-- NOT YET APPLIED. For review.
--
-- Run it in the Supabase SQL editor (MCP apply_migration is blocked by the
-- auto-mode classifier), then record the ledger row at the bottom. Do NOT use
-- `supabase db push` -- the prod ledger is squashed to one baseline.
--
-- Design doc: https://claude.ai/artifact/5CEnSBPZJqL697FfZd6iz9
--
-- ── What this does ──────────────────────────────────────────────────────────
--
-- 2a: three new empty tables + one column on events.
-- 2b: a nullable `occurrence_id` on tickets, seat_holds and purchase_intents.
--
-- ── Blast radius: nothing, and that is checkable ────────────────────────────
--
-- Every table created here is EMPTY and nothing reads it. Every column added
-- here is NULLABLE with no default except `events.timezone`, whose default is
-- the value the code already hardcodes. No existing function, view, trigger,
-- policy or index is altered or dropped.
--
-- NULL `occurrence_id` means "the single-night event", which is what every
-- query on prod already assumes, because it is the only thing that exists.
--
-- What this deliberately does NOT do: it does not touch
-- `tickets_one_live_ticket_per_seat` or `seat_holds_seat_id_key`. Those are
-- step 2c, they are the dangerous part, and they ship on their own with their
-- own test. Until 2c lands, a second night CANNOT be sold -- the Phase 1 index
-- still refuses it. That is correct: the inventory stays locked until the new
-- rule is proven.
--
-- ── Two Supabase SQL editor dialogs you will see ────────────────────────────
--
-- 1. "...without enabling Row Level Security" -- it scans each `create table`
--    statement, not the transaction, so it fires even though RLS is enabled
--    twelve lines later. Answer **Run without RLS**. Its own "Run and enable
--    RLS" button turns RLS on but LEAVES the default anon/authenticated
--    grants, which is worse than what this file does.
-- 2. "This query includes destructive operations" -- from the `revoke` lines.
--    They revoke grants on tables created in the same transaction, so there is
--    nothing existing to destroy.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2a — the tables
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── events.timezone ─────────────────────────────────────────────────────────
--
-- There is no timezone column anywhere in this database today. 'Asia/Manila'
-- is hardcoded inside `extend_experience_availability`. The default is that
-- same value, so all 481 existing events keep behaving identically.
--
-- Why it matters here: "every Tuesday at 8pm" is a LOCAL time. Generating
-- nights means converting a local time to a timestamptz, and that conversion
-- needs to know which local. Storing the answer beats assuming it.
--
-- Known gap, stated rather than hidden: Postgres has no IMMUTABLE "is this a
-- real timezone" function, so a CHECK constraint cannot validate this. A typo
-- like 'Asia/Manilla' is accepted here and throws at generation time instead.
-- The organiser UI must offer a picker, not a text box.

alter table public.events
  add column if not exists timezone text not null default 'Asia/Manila';

comment on column public.events.timezone is
  'IANA timezone name for this event''s local times. Recurrence rules convert their local start_time through this. Not validated by a constraint -- Postgres has no immutable validator -- so the UI must offer a picker.';


-- ── event_recurrence_rules ──────────────────────────────────────────────────
--
-- The pattern an organiser types once: "Tue to Sun, 8pm, 3 hours, from today
-- until next March".
--
-- `ends_on` is NOT NULL on purpose. The decision was to generate every night
-- up front rather than top up on a cron, and a rule with no end date has no
-- end to generate to. "Open ended" is expressed as a far-off date the
-- organiser extends.
--
-- The span cap is the other half of that decision. With a rolling window a
-- typo costs one day of rows at a time and you notice. Generating up front,
-- `2026` mistyped as `2126` is 36,500 rows in one statement. Capping the span
-- at two years also caps the occurrence count: 732 days x at most one night a
-- day is 733 rows, under the 1,000 the design asked for. One constraint, both
-- jobs.

create table public.event_recurrence_rules (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,

  -- 0 = Sunday .. 6 = Saturday, matching Postgres `extract(dow from ...)`.
  byweekday         smallint[] not null,
  start_time        time not null,
  duration_minutes  integer not null,
  starts_on         date not null,
  ends_on           date not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint event_recurrence_rules_byweekday_check check (
    array_length(byweekday, 1) between 1 and 7
    and byweekday <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint event_recurrence_rules_duration_check
    check (duration_minutes between 1 and 1440),
  constraint event_recurrence_rules_window_check
    check (ends_on >= starts_on),
  -- The typo cap. 366 * 2 allows two years including a leap year.
  constraint event_recurrence_rules_span_cap
    check (ends_on - starts_on <= 366 * 2)
);

comment on table public.event_recurrence_rules is
  'The pattern that generates a recurring event''s nights. Organiser config, not buyer-facing: no public read policy.';
comment on column public.event_recurrence_rules.byweekday is
  '0 = Sunday .. 6 = Saturday, matching extract(dow). An array so one rule covers Tue-Sun.';
comment on column public.event_recurrence_rules.ends_on is
  'NOT NULL. Nights are generated up front through this date, so there is no such thing as an unbounded rule. Open-ended = a far date the organiser extends.';

create index event_recurrence_rules_event_idx
  on public.event_recurrence_rules (event_id)
  where is_active;


-- ── event_occurrences ───────────────────────────────────────────────────────
--
-- One row per night. This is the thing `occurrence_id` points at everywhere
-- else, and NULL there means "the single-night event" -- which is why all 481
-- existing events need no backfill and get no row here.
--
-- `recurrence_rule_id` is nullable twice over: a one-off night added by hand
-- has no rule, and a rule that is later deleted leaves its nights standing
-- (ON DELETE SET NULL), because a night that sold tickets must not vanish when
-- the pattern that made it is removed.
--
-- The unique index on (event_id, starts_at) is what makes regenerating a rule
-- safe to run twice: two nights cannot start at the same instant, so a second
-- generation run conflicts instead of duplicating.

create table public.event_occurrences (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  recurrence_rule_id  uuid references public.event_recurrence_rules(id) on delete set null,

  starts_at           timestamptz not null,
  ends_at             timestamptz,

  status              text not null default 'scheduled',

  -- Per-night capacity. NULL = fall back to the event's own capacity, the same
  -- NULL-means-the-default rule used everywhere else in this design.
  capacity            integer,

  -- PHASE 2.5 column, added now because it costs nothing and saves a second
  -- migration over a live table. It stays NULL until Phase 2.5 ships: nothing
  -- reads it, and `event_seat_maps_event_id_key` still enforces one map per
  -- event, so there is no second map for it to point at yet.
  seat_map_id         uuid references public.event_seat_maps(id),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint event_occurrences_status_check
    check (status in ('scheduled', 'cancelled', 'completed')),
  constraint event_occurrences_ends_after_starts
    check (ends_at is null or ends_at > starts_at),
  constraint event_occurrences_capacity_positive
    check (capacity is null or capacity > 0)
);

comment on table public.event_occurrences is
  'One row per night of a recurring event. A single-night event has NO row here, and occurrence_id = NULL means exactly that.';
comment on column public.event_occurrences.status is
  'scheduled | cancelled | completed. A night with a live ticket on it is CANCELLED, never deleted -- see the design doc.';
comment on column public.event_occurrences.capacity is
  'NULL = use events.capacity.';
comment on column public.event_occurrences.seat_map_id is
  'PHASE 2.5, unused today and always NULL. NULL = the event''s own map. Nothing may set this until the read paths take an occurrence -- see Per-night seat maps in the design doc.';

create unique index event_occurrences_event_start_key
  on public.event_occurrences (event_id, starts_at);

create index event_occurrences_event_status_idx
  on public.event_occurrences (event_id, status, starts_at);

create index event_occurrences_rule_idx
  on public.event_occurrences (recurrence_rule_id)
  where recurrence_rule_id is not null;


-- ── occurrence_tier_overrides ───────────────────────────────────────────────
--
-- Friday costs more. A sparse table: a night with no row here uses the tier's
-- own price and quantity, so one tier list survives and nothing downstream
-- (reports, analytics, the buyer's tier cards) fragments across nights.
--
-- Both value columns are nullable so a night can override the price without
-- touching the quantity, or the reverse. The `not_empty` check stops a row
-- that overrides nothing, which would read as "this night is different" while
-- changing nothing.

create table public.occurrence_tier_overrides (
  occurrence_id   uuid not null references public.event_occurrences(id) on delete cascade,
  tier_id         uuid not null references public.ticket_tiers(id) on delete cascade,

  price           numeric,
  quantity_total  integer,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (occurrence_id, tier_id),

  constraint occurrence_tier_overrides_price_check
    check (price is null or price >= 0),
  constraint occurrence_tier_overrides_quantity_check
    check (quantity_total is null or quantity_total >= 0),
  constraint occurrence_tier_overrides_not_empty
    check (price is not null or quantity_total is not null)
);

comment on table public.occurrence_tier_overrides is
  'Per-night price or quantity for one tier. NO ROW = use the tier''s own values. Sparse on purpose.';

create index occurrence_tier_overrides_tier_idx
  on public.occurrence_tier_overrides (tier_id);


-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Mirrors the `event_sections` / `event_seat_maps` pattern (a public read plus
-- an organiser-owns-it policy) with ONE deliberate difference: their public
-- read is `using (true)`, which also exposes DRAFT events. These are new
-- tables with no compatibility to preserve, so the read is gated on the event
-- being published at all. Everything except 'draft' qualifies, including
-- 'hidden' (reachable by direct link and must sell) and 'cancelled' (buyers
-- holding tickets still need the page).
--
-- `event_recurrence_rules` gets NO public read. It is organiser configuration;
-- the occurrences it produces are the public artefact.

alter table public.event_recurrence_rules  enable row level security;
alter table public.event_occurrences       enable row level security;
alter table public.occurrence_tier_overrides enable row level security;

create policy event_recurrence_rules_organizer_all
  on public.event_recurrence_rules
  for all
  using (exists (
    select 1 from public.events e
    join public.partners p on e.organizer_id = p.id
    where e.id = event_recurrence_rules.event_id
      and p.user_id = (select auth.uid())
  ));

create policy event_occurrences_public_read
  on public.event_occurrences
  for select
  using (exists (
    select 1 from public.events e
    where e.id = event_occurrences.event_id
      and e.status <> 'draft'::event_status
  ));

create policy event_occurrences_organizer_all
  on public.event_occurrences
  for all
  using (exists (
    select 1 from public.events e
    join public.partners p on e.organizer_id = p.id
    where e.id = event_occurrences.event_id
      and p.user_id = (select auth.uid())
  ));

create policy occurrence_tier_overrides_public_read
  on public.occurrence_tier_overrides
  for select
  using (exists (
    select 1
    from public.event_occurrences o
    join public.events e on e.id = o.event_id
    where o.id = occurrence_tier_overrides.occurrence_id
      and e.status <> 'draft'::event_status
  ));

create policy occurrence_tier_overrides_organizer_all
  on public.occurrence_tier_overrides
  for all
  using (exists (
    select 1
    from public.event_occurrences o
    join public.events e on e.id = o.event_id
    join public.partners p on e.organizer_id = p.id
    where o.id = occurrence_tier_overrides.occurrence_id
      and p.user_id = (select auth.uid())
  ));


-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- Explicit, because Supabase's ALTER DEFAULT PRIVILEGES hands anon and
-- authenticated a full grant on every new public table. RLS is then the only
-- thing standing between anon and a DELETE. Revoke first, grant back narrowly.
--
-- Note: PUBLIC and anon are INDEPENDENT grants -- revoking one leaves the
-- other, and a '-' in a grants list IS public. Both are named below.

revoke all on public.event_recurrence_rules    from PUBLIC, anon, authenticated;
revoke all on public.event_occurrences         from PUBLIC, anon, authenticated;
revoke all on public.occurrence_tier_overrides from PUBLIC, anon, authenticated;

-- Buyers read nights and per-night prices. They never read the rule.
grant select on public.event_occurrences         to anon, authenticated;
grant select on public.occurrence_tier_overrides to anon, authenticated;

-- Organisers write through PostgREST as `authenticated`; RLS scopes it to
-- their own events. Same shape as event_sections today.
grant select, insert, update, delete on public.event_recurrence_rules    to authenticated;
grant        insert, update, delete on public.event_occurrences          to authenticated;
grant        insert, update, delete on public.occurrence_tier_overrides  to authenticated;

grant all on public.event_recurrence_rules    to service_role;
grant all on public.event_occurrences         to service_role;
grant all on public.occurrence_tier_overrides to service_role;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2a VERIFICATION -- run this, read it, before going on to 2b.
--
-- Expect: three tables, 0 rows each, rls true everywhere, 0 anon write grants,
-- and 481 events all carrying 'Asia/Manila'.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from public.event_recurrence_rules)     as rules_rows,
  (select count(*) from public.event_occurrences)          as occurrence_rows,
  (select count(*) from public.occurrence_tier_overrides)  as override_rows,
  (select count(*) from public.events)                     as events_total,
  (select count(*) from public.events where timezone = 'Asia/Manila') as events_on_manila,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('event_recurrence_rules','event_occurrences','occurrence_tier_overrides')
      and c.relrowsecurity)                                as tables_with_rls,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('event_recurrence_rules','event_occurrences','occurrence_tier_overrides')
      and grantee in ('anon', 'PUBLIC')
      and privilege_type <> 'SELECT')                      as anon_write_grants,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'event_recurrence_rules'
      and grantee in ('anon', 'PUBLIC'))                   as anon_grants_on_rules;

-- STOP if: anon_write_grants is not 0, anon_grants_on_rules is not 0,
-- tables_with_rls is not 3, or events_on_manila <> events_total.


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2b — the nullable occurrence_id columns
--
-- Three tables, three nullable uuid columns, three FKs, three partial indexes.
-- No existing row is touched; every one of them reads NULL, which means "the
-- single-night event".
--
-- ON DELETE RESTRICT, not CASCADE, and not SET NULL. Deleting a night must not
-- silently delete the tickets sold for it, and must not silently orphan them
-- onto "the event itself" either -- that would hand a Tuesday buyer a ticket
-- to no particular night. A night with tickets gets status='cancelled'. The
-- FK makes that the only option the database allows.
--
-- `purchase_intents` is in this step although the design table originally
-- listed only tickets and seat_holds. It has to be: a purchase intent is for
-- ONE night, and `assign_seats_to_intent` reaches tickets through the intent.
-- Without it, step 2e has no way to learn which occurrence to stamp.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.tickets
  add column if not exists occurrence_id uuid
    references public.event_occurrences(id) on delete restrict;

alter table public.seat_holds
  add column if not exists occurrence_id uuid
    references public.event_occurrences(id) on delete restrict;

alter table public.purchase_intents
  add column if not exists occurrence_id uuid
    references public.event_occurrences(id) on delete restrict;

comment on column public.tickets.occurrence_id is
  'Which night this ticket is for. NULL = the single-night event, which is every ticket on prod today.';
comment on column public.seat_holds.occurrence_id is
  'Which night this hold is for. NULL = the single-night event. Part of the new uniqueness rule in step 2c.';
comment on column public.purchase_intents.occurrence_id is
  'Which night this order is for. NULL = the single-night event. assign_seats_to_intent reads it from here.';

-- Partial indexes: WHERE NOT NULL keeps them empty today and keeps them small
-- forever, because single-night events never populate the column. An
-- unqualified index on 64,756 tickets of NULL would be pure waste.

create index if not exists tickets_occurrence_idx
  on public.tickets (occurrence_id)
  where occurrence_id is not null;

create index if not exists seat_holds_occurrence_idx
  on public.seat_holds (occurrence_id)
  where occurrence_id is not null;

create index if not exists purchase_intents_occurrence_idx
  on public.purchase_intents (occurrence_id)
  where occurrence_id is not null;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2b VERIFICATION
--
-- Expect: all three columns exist and are nullable, every existing row NULL,
-- and the Phase 1 index still standing and still valid.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'occurrence_id'
      and table_name in ('tickets','seat_holds','purchase_intents'))      as columns_added,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'occurrence_id'
      and table_name in ('tickets','seat_holds','purchase_intents')
      and is_nullable = 'YES')                                            as columns_nullable,
  (select count(*) from public.tickets          where occurrence_id is not null) as tickets_with_occurrence,
  (select count(*) from public.seat_holds       where occurrence_id is not null) as holds_with_occurrence,
  (select count(*) from public.purchase_intents where occurrence_id is not null) as intents_with_occurrence,
  (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'tickets_one_live_ticket_per_seat'
      and i.indisunique and i.indisvalid)                                 as phase1_index_still_good;

-- STOP if: columns_added <> 3, columns_nullable <> 3, any *_with_occurrence
-- is not 0, or phase1_index_still_good is not 1.


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROWS -- run only AFTER both transactions above have committed and
-- both verification queries read clean.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105150000', 'phase2a_occurrence_tables');
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105160000', 'phase2b_occurrence_id_columns');
--
-- Left commented so pasting the file cannot record it as applied before it is.
--
-- ROLLBACK
--   Everything here is additive, so the real rollback is "leave it alone" --
--   empty tables and all-NULL columns cost nothing and break nothing. To
--   remove it anyway, in this order:
--
--     drop index if exists public.purchase_intents_occurrence_idx;
--     drop index if exists public.seat_holds_occurrence_idx;
--     drop index if exists public.tickets_occurrence_idx;
--     alter table public.purchase_intents drop column if exists occurrence_id;
--     alter table public.seat_holds       drop column if exists occurrence_id;
--     alter table public.tickets          drop column if exists occurrence_id;
--     drop table if exists public.occurrence_tier_overrides;
--     drop table if exists public.event_occurrences;
--     drop table if exists public.event_recurrence_rules;
--     alter table public.events drop column if exists timezone;
--
--   Dropping the columns before the tables matters: the FKs point at
--   event_occurrences, so the table will not drop while they exist.
--
-- NEXT: step 2c, which swaps `tickets_one_live_ticket_per_seat` and
-- `seat_holds_seat_id_key` for `(seat_id, occurrence_id) NULLS NOT DISTINCT`.
-- That is the dangerous one -- a plain `UNIQUE (seat_id, occurrence_id)` would
-- accept the same seat twice on all 481 existing events and silently undo
-- Phase 1. It ships separately, with a test that tries to break it.
-- ════════════════════════════════════════════════════════════════════════════
