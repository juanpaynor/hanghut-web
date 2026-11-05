-- ════════════════════════════════════════════════════════════════════════════
-- CHAIR FACING — let the organizer turn a chair by hand, and let buyers see it
--
-- NOT YET APPLIED. For review. One transaction.
--
-- ── What this is for ───────────────────────────────────────────────────────
--
-- A 'chair' seat is drawn pointing somewhere, and until now that direction was
-- always WORKED OUT: face the table you ring, face the room if you stand on
-- the stage, otherwise face the stage. Good defaults, but a venue has corners
-- the defaults get wrong — a side bank angled at the room, two chairs at a
-- high-top turned to each other, a row along a wall.
--
-- So a seat may now carry its own angle. NULL keeps the worked-out answer,
-- which is every seat on every map that exists today.
--
-- ── Why it needs a column at all ───────────────────────────────────────────
--
-- Everything else about the chair was derivable, and deliberately so: the
-- SHAPE rides on canvas_data (returned verbatim), and which way a chair faces
-- is computed from polygon_points, which the picker already receives. An
-- override is the one thing that cannot be derived — it is the organizer
-- disagreeing with the derivation. There is nowhere to read it from but a
-- column.
--
-- ── Blast radius ───────────────────────────────────────────────────────────
--
-- Verified on prod 2026-11-05 before writing this:
--   - public.seats has 4,856 rows and is 3,992 kB. Adding a nullable column
--     with no default rewrites nothing; it is a catalogue change.
--   - get_event_section_seats has exactly ONE overload, so there is no second
--     copy to forget.
--   - Every existing seat gets facing = NULL, which every renderer reads as
--     "work it out" — the behaviour they have today, unchanged.
-- Only the 'chair' shape draws a direction at all, and no event uses it yet.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. The column ───────────────────────────────────────────────────────────

alter table public.seats
  add column if not exists facing double precision;

comment on column public.seats.facing is
  'Degrees clockwise, 0 = up. Which way the chair points, when the organizer has turned it by hand. NULL = derive it: face the table this seat rings, the room if it stands on the stage, otherwise the stage. Only the ''chair'' seat shape draws a direction. See src/lib/seat-map/chair.ts (seatFacing).';

-- Finite degrees only. NOT VALID skips the scan: every existing row is NULL,
-- which the check accepts, and new and updated rows are checked from now on.
alter table public.seats
  add constraint seats_facing_finite
    check (facing is null or (facing > -100000 and facing < 100000)) not valid;

-- ── 2. Put it on the wire ───────────────────────────────────────────────────
--
-- Byte for byte the current definition plus one line. If this ever drifts,
-- the organizer's builder draws a hand-turned chair and the buyer's map draws
-- it facing the stage — which is the seat-shape bug this codebase already
-- carries a comment about, with a different column.

create or replace function public.get_event_section_seats(p_section_id uuid)
 returns json
 language sql
 stable security definer
as $function$
  SELECT COALESCE(json_agg(json_build_object(
    'id', s.id,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label,
    'x', s.x,
    'y', s.y,
    'tier_id', COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id),
    'facing', s.facing
  ) ORDER BY s.row_label, s.seat_number), '[]'::json)
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.section_id = p_section_id;
$function$;

commit;


-- ── VERIFY. Read-only. ─────────────────────────────────────────────────────
-- Expect: column true, constraint true, rpc true, and 0 seats with a facing
-- (nothing has been turned yet).

select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='seats' and column_name='facing') = 1 as column_added,
  (select count(*) from pg_constraint
     where conrelid='public.seats'::regclass and conname='seats_facing_finite') = 1   as constraint_added,
  (select position('''facing'', s.facing' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='get_event_section_seats')                as rpc_emits_facing,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='get_event_section_seats')                as rpc_overloads_expect_1,
  (select count(*) from public.seats where facing is not null)                        as seats_turned_so_far;


-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run after the verify above looks right.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105160000', 'seat_facing');
--
-- ROLLBACK
--   1. Restore get_event_section_seats by re-running the function above with
--      the `'facing', s.facing` line removed. (The previous definition is that
--      function minus that one line — it is reproduced in
--      rollback/get_event_section_seats_before_facing.sql.)
--   2. The column is additive and can be left; nothing else reads it. To drop:
--        alter table public.seats drop constraint seats_facing_finite;
--        alter table public.seats drop column facing;
--      Dropping it DISCARDS every hand-turned chair, so check first:
--        select count(*) from seats where facing is not null;
--   3. delete from supabase_migrations.schema_migrations where version = '20261105160000';
-- ════════════════════════════════════════════════════════════════════════════
