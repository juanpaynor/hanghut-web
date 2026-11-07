-- ════════════════════════════════════════════════════════════════════════════
-- RESPONSES: hide people who never went through with it
--
-- NOT YET APPLIED. For review. Two transactions.
--
-- ── Where this came from ───────────────────────────────────────────────────
--
-- Partner feedback, 2026-11-07:
--   "Dashboard, avoid collecting data of respondents na wala ka proceed
--    payment to avoid clutter"
--   "Save responses if naka register para when they come back to registration
--    derecho na payment. Less friction"
--
-- Measured on prod before writing this. Back to the Garden (Upper Room
-- Worship) shows 1,157 responses of which 831 are confirmed -- 326 rows of
-- noise. THE TABLE shows 22 with 9 confirmed.
--
-- ── Two separate problems, two separate fixes ──────────────────────────────
--
-- 1. FUTURE events already have a fix and nobody can reach it.
--    `expire_stale_registrations()` runs on cron and moves abandoned unpaid
--    registrations to 'cancelled', which the list already hides. But it is
--    gated on `e.abandon_unpaid_after_hours IS NOT NULL`, and **1 event out of
--    482 has it set** -- SINADYA RUN 2026, at 3 hours, which is exactly why
--    that roster is 97% clean while Upper Room's is not. The column appears
--    NOWHERE in the frontend or the edge functions, so whoever set Sinadya did
--    it by hand in the database. Section 1 gives it a default and backfills.
--
-- 2. PAST events cannot be fixed that way, and that is correct.
--    The job refuses to touch a finished event -- "rewriting a finished
--    event's roster destroys the record." Back to the Garden ran on 21 Oct, so
--    no amount of backfilling cleans it. A finished roster is also precisely
--    what an organiser reviews afterwards. Section 2 adds a filter for that.
--
-- Neither fix deletes anything, which is what keeps the second half of the
-- feedback possible: the answers stay in `registration_answers` so a returning
-- registrant can still be sent straight to payment.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — the 24-hour default, and the backfill
--
-- Why 24 and not 3: at 3 hours a buyer who fills the form, shuts the laptop
-- and pays the next morning gets released out from under themselves. A day is
-- long enough to be obviously abandoned.
--
-- The backfill sets every event that has no value, including free ones. That
-- is deliberate rather than sloppy: the job already refuses to release a
-- registration whose tier price is 0 (its own comment notes this would
-- otherwise wipe 521 real attendees off one worship night), so a value on a
-- free event is inert -- and it starts working by itself the day that event
-- adds a paid tier.
--
-- ── What the backfill actually releases: TEN rows ──────────────────────────
--
-- Simulated on prod by running the job's exact conditions as a SELECT with
-- hours => 24:
--   Sinadya Run 2026 (Hanghut Select, HIDDEN duplicate, 0 tickets)    7
--   Commons Live: Project Yazz's Santelmo (The Millas)                1
--   Test Event (Hanghut Select)                                       1
--   Happy Hour: Spelling Bee (Candid Club PH)                         1
-- Every other candidate is held back by a guard doing its job, mostly the
-- upcoming-only rule, because the cluttered events have already run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.events
  alter column abandon_unpaid_after_hours set default 24;

comment on column public.events.abandon_unpaid_after_hours is
  'Hours after which an approved-but-unpaid registration is released to ''cancelled'' by expire_stale_registrations(), which hides it from the roster WITHOUT deleting its answers. Defaults to 24. NULL disables the release entirely for this event.';

-- Backfill. `is null` only: never overwrite a value an organiser chose, and
-- Sinadya's deliberate 3 stays 3.
update public.events
   set abandon_unpaid_after_hours = 24
 where abandon_unpaid_after_hours is null;

commit;


-- ── SECTION 1 VERIFICATION ─────────────────────────────────────────────────
-- Expect: unset 0, sinadya_still_3 is 3, and default_is_24 true.

select
  (select count(*) from public.events where abandon_unpaid_after_hours is null)  as unset,
  (select count(*) from public.events where abandon_unpaid_after_hours = 24)     as on_24,
  (select abandon_unpaid_after_hours from public.events
    where title = 'SINADYA RUN 2026')                                            as sinadya_still_3,
  (select column_default like '%24%' from information_schema.columns
    where table_schema='public' and table_name='events'
      and column_name='abandon_unpaid_after_hours')                              as default_is_24;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — `is_confirmed`, a computed field on event_registrations
--
-- ── Why a computed FUNCTION and not a view or a column ────────────────────
--
-- PostgREST exposes a function whose single argument is a table row as a
-- selectable AND FILTERABLE field on that table. That matters here because the
-- registrations list already selects embedded `users` and
-- `registration_answers`, and takes its counts from SQL in the same round
-- trip. A view would force PostgREST to re-infer those FK relationships, and a
-- real column would need triggers on three tables to stay true. A computed
-- field leaves the existing query, its embeds and its counts untouched and
-- adds `.eq('is_confirmed', true)`.
--
-- ── Why the WIDE definition, matching expire_stale_registrations() ────────
--
-- The tempting version is "this registration's own ticket or its own linked
-- intent". Measured on prod, that narrow test marks 2,145 of 2,572 confirmed
-- while the wide user/email test marks 2,170 -- so the narrow one would have
-- HIDDEN 61 PEOPLE WHO ACTUALLY PAID, by a route that never wrote
-- registration_id or purchase_intent_id back (box office, offline, comps, a
-- guest who paid under a second registration). Hiding a real attendee from a
-- roster is far worse than showing an abandoned one, so this uses the same
-- matching the release job uses. One definition of "went through with it".
--
-- Refunded is NOT confirmed, matching the existing export filter `keepPaid`,
-- which keeps 'Paid' and 'Paid - no ticket issued' only.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.is_confirmed(r public.event_registrations)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    -- Paid, by any route.
    exists (
      select 1 from purchase_intents pi
       where pi.event_id = r.event_id
         and pi.status = 'completed'
         and ((r.user_id is not null and pi.user_id = r.user_id)
              or lower(pi.guest_email) = lower(coalesce(
                   (select u.email from users u where u.id = r.user_id), r.guest_email)))
    )
    -- Or holds a live ticket, by any route: box office, offline, comp, free.
    or exists (
      select 1 from tickets tk
       where tk.event_id = r.event_id
         and tk.status not in ('cancelled', 'refunded', 'available')
         and ((r.user_id is not null and tk.user_id = r.user_id)
              or lower(tk.guest_email) = lower(coalesce(
                   (select u.email from users u where u.id = r.user_id), r.guest_email)))
    );
$function$;

comment on function public.is_confirmed(public.event_registrations) is
  'PostgREST computed field: did this registration actually go through? Paid intent OR live ticket, matched by user_id or lowered email -- the SAME test expire_stale_registrations() uses, deliberately, so the roster filter and the release job can never disagree. SECURITY INVOKER and service_role-only on purpose: the organizer list runs as the admin client after authorizeEvent(), so nothing needs this exposed to anon.';

-- SECURITY INVOKER (the default), and NOT granted to anon or authenticated.
-- The registrations list already runs through createAdminClient() behind
-- authorizeEvent(), so service_role is the only caller that needs it. PUBLIC
-- and anon are independent grants, so both are named.
revoke all on function public.is_confirmed(public.event_registrations) from PUBLIC, anon, authenticated;
grant execute on function public.is_confirmed(public.event_registrations) to service_role;

commit;


-- ── SECTION 2 VERIFICATION ─────────────────────────────────────────────────
-- Expect: anon_can_execute false, and the counts matching what was measured
-- before this file existed (Back to the Garden 1,157 shown / 831 confirmed).

select
  has_function_privilege('anon', 'public.is_confirmed(public.event_registrations)', 'EXECUTE') as anon_can_execute,
  has_function_privilege('service_role', 'public.is_confirmed(public.event_registrations)', 'EXECUTE') as service_role_can_execute;

select e.title,
       count(*)                                        as shown_today,
       count(*) filter (where public.is_confirmed(r))  as confirmed,
       count(*) filter (where not public.is_confirmed(r)) as hidden_by_the_filter
from public.event_registrations r
join public.events e on e.id = r.event_id
where r.status <> 'cancelled'
  and e.title in ('Back to the Garden', 'SINADYA RUN 2026', 'THE TABLE | Coffee around God''s Word')
group by e.title order by hidden_by_the_filter desc;

-- STOP if anon_can_execute is true, or if Back to the Garden does not read
-- 1,157 / 831 / 326 (give or take any sales since this was measured).


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only after both verifications read clean.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107100000', 'responses_confirmed_filter');
--
-- ROLLBACK
--   drop function if exists public.is_confirmed(public.event_registrations);
--   alter table public.events alter column abandon_unpaid_after_hours drop default;
--   -- The backfill is NOT reversed: there is no record of which events were
--   -- null before it ran. To disable the release for everyone again:
--   --   update public.events set abandon_unpaid_after_hours = null;
--   -- which would also wipe Sinadya's deliberate 3, so capture it first.
--
-- FRONTEND still required after this: the Responses tab needs the toggle and
-- the hours control. Without them this file changes the release behaviour of
-- future events but the roster still shows everyone on past ones.
-- ════════════════════════════════════════════════════════════════════════════
