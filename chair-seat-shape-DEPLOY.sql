-- ════════════════════════════════════════════════════════════════════════════
-- CHAIR SEAT SHAPE — widen the per-section whitelist
--
-- NOT YET APPLIED. For review. One statement pair, in one transaction.
--
-- ── Why this is needed at all ──────────────────────────────────────────────
--
-- The new 'chair' seat shape needs NO migration to work MAP-WIDE:
-- get_event_seat_geometry returns canvas_data->>'seatShape' verbatim with no
-- whitelist, and background_shapes is canvas_data->'backgroundShapes' verbatim,
-- so the stage's role (which the chair turns to face) is already on the wire.
--
-- A PER-SECTION override is different. It lands in the real column
-- event_sections.seat_shape, and that column has a CHECK constraint listing
-- the three shapes that existed when it was written:
--
--   CHECK ((seat_shape IS NULL) OR
--          (seat_shape = ANY (ARRAY['circle','square','diamond']))) NOT VALID
--
-- Without this change, an organizer who sets ONE section to chairs gets a
-- failed save with a constraint error, while the map-wide setting works fine.
--
-- ── Blast radius ───────────────────────────────────────────────────────────
--
-- Widening a CHECK only ever ACCEPTS more. Nothing currently stored can become
-- invalid, no row is rewritten, and every existing section keeps its value.
-- Verified 2026-11-05: 208 live event_sections, and seat_shape is NULL on all
-- of them -- no section has ever used a per-section override.
--
-- ── Why it stays NOT VALID ─────────────────────────────────────────────────
--
-- The constraint it replaces is already NOT VALID, and a validating ADD would
-- take an ACCESS EXCLUSIVE lock and scan the whole table to prove something we
-- can already see is true. NOT VALID still checks every insert and update from
-- the moment it exists; it only skips re-proving the rows already there.
--
-- Keeping the same name matters too: a differently-named constraint would
-- leave the old one in place and the save would still fail.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.event_sections
  drop constraint if exists event_sections_seat_shape_check;

alter table public.event_sections
  add constraint event_sections_seat_shape_check
    check (seat_shape is null
           or seat_shape = any (array['circle','square','diamond','chair']))
    not valid;

comment on column public.event_sections.seat_shape is
  'Per-section override of the map-wide canvas_data.seatShape. NULL = use the map default. Keep in step with SEAT_SHAPES in src/lib/seat-map/seat-shape.ts -- that file is the one list the app uses, and this constraint is the copy it cannot reach.';

commit;


-- ── VERIFY. Read-only. ─────────────────────────────────────────────────────
-- Expect: chair accepted = true, a nonsense value still rejected = true.

select
  pg_get_constraintdef(oid) ilike '%chair%'   as accepts_chair,
  pg_get_constraintdef(oid) ilike '%circle%'  as still_accepts_circle,
  pg_get_constraintdef(oid) ilike '%square%'  as still_accepts_square,
  pg_get_constraintdef(oid) ilike '%diamond%' as still_accepts_diamond,
  pg_get_constraintdef(oid)                   as def
from pg_constraint
where conrelid = 'public.event_sections'::regclass
  and conname = 'event_sections_seat_shape_check';


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run after the verify above looks right.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105150000', 'chair_seat_shape');
--
-- ROLLBACK -- only safe while no section is actually set to 'chair'. Check
-- first, because the narrower constraint cannot be added over a row that
-- violates it, even NOT VALID is fine but the next update to that row fails.
--
--   select count(*) from event_sections where seat_shape = 'chair';  -- must be 0
--
--   begin;
--   alter table public.event_sections
--     drop constraint if exists event_sections_seat_shape_check;
--   alter table public.event_sections
--     add constraint event_sections_seat_shape_check
--       check (seat_shape is null
--              or seat_shape = any (array['circle','square','diamond']))
--       not valid;
--   commit;
--   delete from supabase_migrations.schema_migrations where version = '20261105150000';
-- ════════════════════════════════════════════════════════════════════════════
