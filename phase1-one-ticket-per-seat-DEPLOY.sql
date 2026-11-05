-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — one seat, one ticket. Enforced by the database.
--
-- NOT YET APPLIED. For review.
--
-- Run in the Supabase SQL editor, section by section, in order. Do NOT use
-- `supabase db push` -- the prod ledger is squashed to one baseline. Ledger row
-- is at the bottom, commented.
--
-- ── The problem ─────────────────────────────────────────────────────────────
--
-- public.tickets has NO uniqueness rule on seat_id. Only a plain btree index
-- (idx_tickets_seat_id), which speeds lookups and prevents nothing. Every
-- guarantee that a seat is sold once lives in application code. When that code
-- slips, the database accepts the second ticket silently.
--
-- It has already slipped once, on a real customer:
--   Hex Fest 2026 (31 Oct), section REG COCK, seat 11.
--   TK-C759C3B4 and TK-4F49D981, both status 'used', same buyer
--   (Keyshia Nicole Villaruz, knvillaruz@gmail.com), same purchase_intent
--   bd5281d3-6aff-4653-a557-a02d78ad9c8e, identical created_at, PHP 1,398.
--   That section had exactly ONE sellable seat (1-4, 9, 10 all 'disabled').
--   Two tickets needed seats, one seat was free, assign_seats_to_intent issued
--   it twice rather than refusing. Both attendees were admitted, 41 minutes
--   apart, because each ticket number got its own first scan.
--
-- ── Why this file is longer than the one line it is about ───────────────────
--
-- A unique index will not build while duplicates exist, so the data has to be
-- true before the rule can be imposed. Auditing for that turned up a second,
-- separate mess: 55 blank pre-minted tickets (status 'available', no
-- purchase_intent, no buyer) are holding a seat_id. 12 of them sit on a seat
-- that a real sold ticket also holds.
--
--   Iloilo Food Festival          2026-07-04   1 squatter,  0 colliding
--   Test event                    2026-07-08   1            0
--   AFTERGLOW                     2026-07-11   7            0
--   Hanghut Launch Party X THC    2026-09-12   3            1
--   Hex Fest 2026                 2026-10-31   1            0
--   Seat map Example Event - PICC 2026-11-28   1            0   (upcoming)
--   PICC - Seat Map Example       2026-12-19   7            0   (upcoming)
--   TRESPASSING SA MUSIC MUSEUM   2026-12-19  25            7   (upcoming, SELLING)
--   Music Museum Seat Map Example 2027-12-18   4            2   (upcoming)
--                                             ---           --
--                                              50           10
--
-- These counts DRIFT DOWNWARD on their own, and only on TRESPASSING, because
-- it is live and selling. They were 55 / 12 when first measured and 50 / 10
-- an hour later, entirely from 8 ordinary ticket sales between 2026-11-04
-- 20:33 and 2026-11-05 05:13. When a checkout claims a blank pool ticket that
-- happens to carry a stale seat_id, assign_seats_to_intent OVERWRITES seat_id
-- with the seat actually chosen -- so a sale cleans the squatter up. Drift
-- downward is expected and harmless; see section 1.
--
-- Incidental finding worth knowing: claiming a pool ticket also REWRITES its
-- created_at to the sale time. So tickets.created_at means "sold at", not
-- "minted at", and every ticket in one order shares an identical created_at --
-- which is why assign_seats_to_intent's `ORDER BY created_at, id` is really
-- ordered by a random uuid, and why the two Hex Fest tickets have the same
-- timestamp to the microsecond.
--
-- These are not currently double-selling anything: seats.status is 'booked' on
-- the collided seats, so the picker does not offer them. They are the fuel, not
-- the fire. But they must be cleared or the index cannot build -- and if one of
-- them were ever claimed by a checkout, that IS a second live double-booking.
--
-- For scale: TRESPASSING has 718 seats and 715 tickets, of which 652 are the
-- blank pool and only 30 carry a seat_id at all. So a pool ticket holding a
-- seat is the exception, not the design -- 622 of them hold none. This is
-- residue from released holds, not an intended one-ticket-per-seat pre-mint.
--
-- ── Verified: nothing reads a blank ticket's seat_id ────────────────────────
--
-- Section 2 is only safe if no caller finds a pool ticket BY its seat. Checked
-- every function whose body mentions both seat_id and 'available':
--   assign_seats_to_intent (both overloads), pick_best_available, hold_seat,
--   get_event_seat_map, section_blocks, scan_ticket, complete_disbursement_refund,
--   finalize_event_refund, record_manual_refund, void_box_office_order.
-- All of them resolve seats from public.seats and then reach tickets by
-- purchase_intent_id, ticket id, or code -- never by `tickets.seat_id` with
-- status 'available'. Clearing the claim is invisible to all of them.
--
-- ── How Hex Fest actually happened ─────────────────────────────────────────
--
-- Reading both overloads of assign_seats_to_intent, no SINGLE run can put two
-- tickets on one seat: ordered_seats joins ordered_tickets on row_number, so
-- one seat matches exactly one ticket, and a short seat list raises
-- SEATS_UNAVAILABLE. The duplicate requires the function to run TWICE for the
-- same intent, and three properties let the second run repeat the first:
--
--   1. ordered_tickets filters `status = 'reserved'`. Once run 1 has issued a
--      seat and that ticket has moved on, run 2's list no longer contains it --
--      so the OTHER reserved ticket is now row_number 1.
--   2. the seat is still offerable: seats.status is not flipped to 'booked' by
--      this function at all (book_seats_for_intent does that, later), so the
--      `s.status = 'available'` test still passes on run 2.
--   3. the hold does not block it either -- the seat-list branch explicitly
--      excludes holds whose session_id is this same intent
--      (`h.session_id != p_intent_id::text`), which is precisely the hold run 1
--      just created.
--
-- Net effect: run 2 legitimately re-issues the same seat to the second ticket,
-- and nothing anywhere objects. Both tickets end up on REG COCK11.
--
-- What triggered the second run is still unprovable -- there is no audit trail
-- on this path, and both tickets share an identical created_at. A retry, a
-- double-submitted checkout and a resumed intent all produce this. The index
-- below does not care which: it makes the second write fail.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — look before touching. Read-only. Run this first.
--
-- Expected 2026-11-05 06:13 UTC: 50 / 10 / 1.
--
-- The first two may be LOWER than that and that is fine -- TRESPASSING is
-- selling, and each sale that claims a squatter overwrites its stale seat.
-- Nothing in this file keys off the counts; sections 2 and 3 are driven by
-- WHERE clauses and adapt on their own.
--
-- STOP and re-audit only if either of these is true:
--   - the first two numbers are HIGHER than 50 / 10  -> something is NEWLY
--     writing a seat_id onto a blank pool ticket, which is a live bug and must
--     be found before a uniqueness rule is imposed on top of it
--   - the third is anything other than 1              -> a SECOND genuine
--     double-sale has appeared. Section 3 only resolves the known Hex Fest one;
--     do not run section 5 until the new one is understood and resolved too.
-- ════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from tickets
     where status = 'available' and seat_id is not null)              as blank_tickets_holding_a_seat,
  (select count(*) from tickets t
     where t.status = 'available' and t.seat_id is not null
       and exists (select 1 from tickets x
                   where x.seat_id = t.seat_id
                     and x.status in ('valid','used','approved')))    as of_those_colliding_with_a_sale,
  (select count(*) from (
     select seat_id from tickets
     where seat_id is not null and status in ('valid','used','approved')
     group by seat_id having count(*) > 1) q)                        as genuinely_double_sold_seats;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — clear the squatters. 55 rows.
--
-- Zero money impact and zero customer impact: every row touched is an unsold
-- blank with no purchase_intent_id, no buyer, no order and no check-in. We are
-- not deleting the tickets -- they stay in the pool, exactly like the other
-- 600-odd blanks that already carry no seat. We are only removing a seat claim
-- that was never paid for.
--
-- The WHERE clause is deliberately paranoid: status must be 'available' AND
-- there must be no order AND no check-in. If any of those is false the row is
-- left alone, so a mis-statused real sale cannot be stripped of its seat.
--
-- NOTE ON THE SQL EDITOR PROMPT: Supabase warns "This query creates a table
-- without enabling Row Level Security" the moment it sees `create table`. It
-- scans the statement, not the transaction, so it fires even though the very
-- next lines enable RLS, force it, and revoke every grant. Its "Run and enable
-- RLS" button would turn RLS on but leave the default anon/authenticated grants
-- in place, which is the weaker outcome. Choose **Run without RLS** -- the
-- statements below do it properly -- then confirm with section 2b.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- keep a copy of what we are about to change, so this is reversible
create table if not exists public._phase1_cleared_seat_claims (
  ticket_id  uuid primary key,
  seat_id    uuid not null,
  event_id   uuid,
  cleared_at timestamptz not null default now(),
  note       text
);

-- Lock it down immediately, in the same transaction that creates it.
--
-- A new table in the public schema inherits Supabase's default grants, which
-- hand anon and authenticated full table rights -- and TRUNCATE is not subject
-- to RLS. This table is a migration scratchpad: nobody but the service role and
-- postgres should ever see or touch it, so it gets BOTH halves.
--
-- RLS with ZERO policies is the point, not an oversight: it denies everyone,
-- and service_role / postgres bypass RLS entirely, which is the only access
-- this table needs.
alter table public._phase1_cleared_seat_claims enable row level security;
alter table public._phase1_cleared_seat_claims force row level security;
revoke all on public._phase1_cleared_seat_claims from public;
revoke all on public._phase1_cleared_seat_claims from anon;
revoke all on public._phase1_cleared_seat_claims from authenticated;

comment on table public._phase1_cleared_seat_claims is
  'Phase 1 migration scratchpad: seat claims removed from tickets, kept so the change is reversible. Not application data. No RLS policies on purpose -- service_role only. Safe to drop once Phase 1 is confirmed settled.';

insert into public._phase1_cleared_seat_claims (ticket_id, seat_id, event_id, note)
select t.id, t.seat_id, t.event_id, 'blank pool ticket holding a seat (phase 1)'
from tickets t
where t.status = 'available'
  and t.seat_id is not null
  and t.purchase_intent_id is null
  and t.checked_in_at is null
on conflict (ticket_id) do nothing;

update tickets t
set seat_id = null
where t.status = 'available'
  and t.seat_id is not null
  and t.purchase_intent_id is null
  and t.checked_in_at is null;
-- expect: UPDATE 50 (or fewer -- see section 1 on drift)

commit;

-- To undo section 2:
--   update tickets t set seat_id = c.seat_id
--   from public._phase1_cleared_seat_claims c
--   where c.ticket_id = t.id and t.seat_id is null;


-- ── SECTION 2b — confirm the scratch table is actually locked. Read-only. ───
--
-- Expect: rls_enabled = true, rls_forced = true, exposed_grants = 0,
-- and rows_backed_up equal to the UPDATE count above.

select c.relrowsecurity                                   as rls_enabled,
       c.relforcerowsecurity                              as rls_forced,
       (select count(*) from pg_policies
          where schemaname='public'
            and tablename='_phase1_cleared_seat_claims')  as policies_expected_0,
       (select count(*) from information_schema.role_table_grants
          where table_schema='public'
            and table_name='_phase1_cleared_seat_claims'
            and grantee in ('anon','authenticated','PUBLIC')) as exposed_grants,
       (select count(*) from public._phase1_cleared_seat_claims) as rows_backed_up
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='_phase1_cleared_seat_claims';


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — the Hex Fest duplicate. ONE row. Needs a human decision.
--
-- Two sold, used, checked-in tickets own seat REG COCK11. The event is over.
-- Nobody can be compensated or re-seated now; the only question is what the
-- record should say.
--
-- RECOMMENDED: drop the seat claim from the ticket that was scanned SECOND
-- (TK-4F49D981, 15:52) and keep it on the first (TK-C759C3B4, 15:11).
--
-- Nothing is destroyed by this:
--   - both tickets keep status 'used'          -> attendance record intact
--   - both keep checked_in_at / checked_in_by  -> door record intact
--   - both keep seat_info                      -> the jsonb still reads
--                                                 {"label": "REG COCK11", ...},
--                                                 so the human-readable truth
--                                                 that they shared seat 11
--                                                 survives
--   - the order and the PHP 1,398 are untouched
--   - the row is recorded in _phase1_cleared_seat_claims like the others
--
-- What changes is only the exclusive claim: seat_id, which is the column the
-- new rule polices.
--
-- ALTERNATIVES CONSIDERED AND REJECTED:
--   - Narrow the index to future events only. Then the rule stops protecting
--     an event the moment it starts, which is exactly when the door needs it.
--   - Invent a seat 12 and move the second ticket there. That fabricates a
--     chair that did not exist in that section.
--   - Leave it and skip Phase 1. That leaves every future event unprotected
--     to preserve one row of a past one.
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into public._phase1_cleared_seat_claims (ticket_id, seat_id, event_id, note)
select t.id, t.seat_id, t.event_id,
       'Hex Fest 2026 double-sold REG COCK11; seat claim kept on TK-C759C3B4 (scanned 15:11), '
       || 'dropped here (scanned 15:52). seat_info retains the label.'
from tickets t
where t.ticket_number = 'TK-4F49D981'
  and t.seat_id = '8908f1d8-dd66-45d1-9171-668bac1fa031'
on conflict (ticket_id) do nothing;

update tickets
set seat_id = null
where ticket_number = 'TK-4F49D981'
  and seat_id = '8908f1d8-dd66-45d1-9171-668bac1fa031';
-- expect: UPDATE 1

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — confirm the data is clean. Read-only. Must return 0.
--
-- Do not run section 5 unless this returns 0.
-- ════════════════════════════════════════════════════════════════════════════

select count(*) as must_be_zero from (
  select seat_id from tickets
  where seat_id is not null and status in ('valid','used','approved')
  group by seat_id having count(*) > 1) q;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — impose the rule.
--
-- ── Which of the two statements below to run ───────────────────────────────
--
-- Measured 2026-11-05: public.tickets is 64,756 rows / 22 MB total, and the
-- partial index will hold just 92 entries. A plain build scans that in well
-- under a second, so the ACCESS EXCLUSIVE lock it takes is momentary.
--
-- Use 5a (plain) in the Supabase SQL editor. The editor wraps what you run in
-- a transaction, and CREATE INDEX CONCURRENTLY cannot run inside one -- it will
-- simply error. At this table size the plain build is the right call anyway.
--
-- Use 5b (CONCURRENTLY) only from a direct psql session, or later when tickets
-- is large enough that a momentary write lock matters. 5b cannot be wrapped in
-- `begin`/`commit` and must be run entirely alone, and a CONCURRENTLY build
-- that fails leaves behind an INVALID index that silently enforces nothing --
-- which is exactly what section 6 checks for.
--
-- Run ONE of them, not both.
--
-- Partial, on purpose. The index covers only the three statuses that represent
-- a real, live claim on a chair:
--   valid     - sold, not yet scanned
--   used      - sold and admitted
--   approved  - registration approved (free/approval events)
-- and therefore does NOT cover:
--   available            - blank pool. After section 2 none hold a seat, and
--                          keeping them out means the pool stays reusable.
--   reserved             - in-flight checkout. Excluded deliberately: two
--                          shoppers may briefly race for a seat, and that race
--                          is settled by seat_holds, not here. Blocking it at
--                          this layer would turn a normal race into a 500.
--   cancelled, refunded  - a returned seat must be resellable.
--
-- 'approved' is included even though no seated ticket currently holds it (today
-- seated tickets are only valid/used/available), because approval events with a
-- seat map are a supported combination and the rule should already be in place
-- when the first one sells.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 5a. PLAIN BUILD -- use this one in the Supabase SQL editor ─────────────

create unique index if not exists tickets_one_live_ticket_per_seat
  on public.tickets (seat_id)
  where seat_id is not null and status in ('valid','used','approved');


-- ── 5b. CONCURRENT BUILD -- psql only. Do NOT run if you ran 5a. ───────────
--
--   create unique index concurrently if not exists tickets_one_live_ticket_per_seat
--     on public.tickets (seat_id)
--     where seat_id is not null and status in ('valid','used','approved');


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — verify the rule is live and valid. Read-only.
--
-- indisunique and indisvalid MUST both be true, and the definition must carry
-- the WHERE clause -- an index without it would also block resale of refunded
-- seats.
--
-- indisvalid is the one people miss. A plain build (5a) either succeeds or
-- raises, so it is always valid; but a CONCURRENTLY build (5b) that fails
-- leaves an INVALID index behind, which enforces nothing and looks present in
-- every listing. If indisvalid is false:
--   drop index concurrently tickets_one_live_ticket_per_seat;
-- then re-run sections 1 and 4 to find what slipped in, and retry section 5.
-- ════════════════════════════════════════════════════════════════════════════

select c.relname, i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid) as def
from pg_index i join pg_class c on c.oid = i.indexrelid
where c.relname = 'tickets_one_live_ticket_per_seat';


-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES AND DOES NOT FIX
--
-- FIXES: the database can no longer hold two live tickets on one seat. The
-- second write raises
--   ERROR: duplicate key value violates unique constraint
--          "tickets_one_live_ticket_per_seat"
-- and whatever transaction attempted it rolls back.
--
-- DOES NOT FIX: the bug in assign_seats_to_intent that caused Hex Fest. That
-- function still (a) does not check whether a ticket already has a seat, (b)
-- leaves no completion mark so a re-run repeats work, (c) filters
-- ordered_tickets on status='reserved' so the list changes between runs, and
-- (d) excludes holds whose session_id is the current intent. After this index
-- exists, that bug stops being a silent double-sale and starts being a failed
-- checkout -- louder, and the money does not move -- but a buyer in a sold-out
-- section will see an error instead of a clean "sold out". Repairing that
-- function is the next piece of work and should follow soon, not eventually.
--
-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only AFTER section 6 shows indisvalid = true.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105130000', 'phase1_one_live_ticket_per_seat');
--
-- ROLLBACK (whole phase, in this order)
--   1. drop index concurrently if exists public.tickets_one_live_ticket_per_seat;
--   2. update tickets t set seat_id = c.seat_id
--        from public._phase1_cleared_seat_claims c
--        where c.ticket_id = t.id and t.seat_id is null;
--   3. delete from supabase_migrations.schema_migrations
--        where version = '20261105130000';
--   (keep _phase1_cleared_seat_claims; it is the only record of what moved.
--    Once Phase 1 is settled and you are sure, `drop table
--    public._phase1_cleared_seat_claims;` -- after that there is no undo for
--    sections 2 and 3.)
-- ════════════════════════════════════════════════════════════════════════════
