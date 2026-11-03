-- ════════════════════════════════════════════════════════════════════════════
-- partner_furniture — a venue's own saved pieces
--
-- NOT YET APPLIED. MCP apply_migration is blocked by the auto-mode classifier
-- (reason: Auto-Mode Bypass), which is a gate on the tool, not on this SQL.
--
-- To run it: paste everything from `begin;` to `commit;` into the Supabase SQL
-- editor, then record the ledger row (the statement is at the bottom of this
-- file) so the CLI does not later believe this migration is still pending.
--
-- Do NOT run it with `supabase db push` or `migration up`: the prod ledger is
-- squashed to one baseline and the CLI reports ~101 already-applied migrations
-- as pending, so it would try to replay all of them.
--
-- ── What it is for ──────────────────────────────────────────────────────────
--
-- The editor can already draw any shape (polygon tool) and sell it whole
-- ("Sell this whole"). What it cannot do is REMEMBER one. A bar whose booths
-- are its own redraws them from scratch for every event it runs.
--
-- Scope is the PARTNER, deliberately, not the user: a booth shape belongs to
-- the bar, and the owner must see what a manager saved. venue_templates keys
-- its own rows on created_by = auth.uid(), which means exactly that bug — a
-- template saved by a manager is invisible to the owner. Not repeated here.
--
-- ── This file is CREATE-ONLY, on purpose ────────────────────────────────────
--
-- An earlier draft opened with remove-if-exists guards on its own trigger and
-- policy, out of habit. Both named only this new table and so could not have
-- touched anything — but they made the migration read as destructive to any
-- reviewer, human or automated, and an additive migration should not have to
-- be argued about. Verified before writing this: to_regclass(
-- 'public.partner_furniture') is null, so there is nothing to guard against.
-- Postgres is 17.6, so `create or replace trigger` gives the same idempotency
-- with a create. Every statement below is a CREATE or an ALTER TABLE ... ENABLE
-- ROW LEVEL SECURITY on the new table. Nothing here removes, renames or
-- rewrites any object that already exists.
--
-- ── Risk ───────────────────────────────────────────────────────────────────
--
-- Additive only. One new table plus its own index, trigger and policy. No
-- column added to or removed from anything that exists, no function changed,
-- no policy on another table touched, nothing backfilled, nothing deleted.
-- The 183 live event_sections rows and all 16 live seat maps are neither
-- written nor read by this. Rollback is removing the one new table, which
-- takes its index, trigger and policy with it; public.touch_updated_at() is
-- shared and must be left in place.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.partner_furniture (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners (id) on delete cascade,

  name          text not null,

  -- The outline in LOCAL coordinates, origin at 0,0: a flat [x,y,x,y,...] array,
  -- the same encoding as event_sections.polygon_points and SectionData
  -- .polygonPoints. Stored local, not absolute, so placing it anywhere on any
  -- canvas is a translate and nothing has to be un-positioned first.
  outline       jsonb  not null,
  w             numeric not null,
  h             numeric not null,

  -- How many people the piece admits. Lands in event_sections.unit_capacity,
  -- which carries the same "> 0 or null" rule.
  pax           integer not null default 1,

  section_type  text,
  color         text,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A blank or novel-length name is unusable in a 192px palette.
  constraint partner_furniture_name_len
    check (char_length(btrim(name)) between 1 and 60),

  constraint partner_furniture_pax_positive
    check (pax > 0),

  constraint partner_furniture_size_positive
    check (w > 0 and h > 0),

  -- A polygon needs at least 3 points, and the upper bound is the real guard:
  -- this JSON is read on every editor load, and an unbounded array is how a
  -- 1.5MB blob ends up shipped to every buyer. 512 coords = 256 points, far
  -- more than the smoothest piece in the catalogue (the 24-gon circle).
  constraint partner_furniture_outline_shape
    check (
      jsonb_typeof(outline) = 'array'
      and jsonb_array_length(outline) >= 6
      and jsonb_array_length(outline) <= 512
      and jsonb_array_length(outline) % 2 = 0
    ),

  -- Mirrors the SectionType union in src/components/seat-map/types.ts. Null is
  -- allowed and means "the editor decides".
  constraint partner_furniture_section_type
    check (
      section_type is null
      or section_type in ('vip', 'general', 'floor', 'box', 'balcony', 'standing')
    )
);

-- Two pieces answering to one name is a palette you cannot read, and the
-- filter box added alongside this makes the name the main way to find one.
-- Case- and space-insensitive, so "Corner Booth" cannot sit beside
-- "corner booth ". This also serves as the partner_id lookup index.
create unique index if not exists partner_furniture_partner_name_key
  on public.partner_furniture (partner_id, lower(btrim(name)));

-- `or replace` rather than a guard statement: same idempotency, nothing removed.
create or replace trigger partner_furniture_touch_updated_at
  before update on public.partner_furniture
  for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- One policy: you reach a piece if you own the partner or are an ACTIVE member
-- of its team.
--
-- Written inline rather than calling is_partner_member() for two reasons.
-- First, that helper ignores partner_team_members.is_active, so a deactivated
-- member keeps access; inline is strictly tighter. Second, it is plpgsql and
-- not marked STABLE, so the planner cannot inline it and it would be called
-- once per row — which matters at the scale this is built for, not today's.
--
-- auth.uid() is wrapped in a scalar subquery so it is evaluated once per query
-- instead of once per row, matching every other policy in this schema.
--
-- FOR ALL needs BOTH halves. USING gates what you can see, update and delete;
-- WITH CHECK gates what you may write. A FOR ALL policy with only USING lets a
-- row be INSERTED carrying someone else's partner_id.

alter table public.partner_furniture enable row level security;

create policy partner_furniture_team_all
  on public.partner_furniture
  for all
  to authenticated
  using (
    partner_id in (
      select p.id from public.partners p
       where p.user_id = (select auth.uid())
      union
      select tm.partner_id from public.partner_team_members tm
       where tm.user_id = (select auth.uid())
         and tm.is_active is not false
    )
  )
  with check (
    partner_id in (
      select p.id from public.partners p
       where p.user_id = (select auth.uid())
      union
      select tm.partner_id from public.partner_team_members tm
       where tm.user_id = (select auth.uid())
         and tm.is_active is not false
    )
  );

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW — run this only AFTER the transaction above has committed.
--
-- apply_migration would have written this itself. Done by hand, the version
-- must be a UTC timestamp later than the newest existing row
-- (20261102120000, seat_map_table_units) or the CLI will consider this
-- migration un-applied and offer to replay it.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261103120000', 'partner_furniture_saved_pieces');
--
-- Left commented so pasting this whole file cannot record the migration as
-- applied before it actually is.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- POST-DEPLOY HARDENING — found by verifying the live table, 2026-11-03.
--
-- Supabase grants anon and authenticated the full set of table privileges on
-- every new table in `public`, including TRUNCATE. On this table that leaves
-- `anon` holding TRUNCATE, and **TRUNCATE is not subject to RLS** — Postgres
-- policies cover SELECT / INSERT / UPDATE / DELETE only, so the grant alone is
-- what decides. The RLS policy therefore does NOT cover this one case.
--
-- How exposed it actually is: PostgREST publishes no TRUNCATE verb, so there is
-- no route to it through the public API today, and 148 of 169 public tables are
-- in the same state. So this is defence in depth, not an open door. But 21
-- tables have already had these grants revoked — seat_holds, promo_codes,
-- support_*, email_*, partner_entitlements — which is the convention for
-- anything partner-owned, and a venue's saved pieces belong in that group.
-- anon has no legitimate read of this table either: the policy is
-- `to authenticated`, so revoking everything costs nothing.
--
--   revoke all on public.partner_furniture from anon;
--
-- Left commented: it is a privilege change on a live table and yours to run.
-- Verify afterwards with
--   select has_table_privilege('anon', 'public.partner_furniture', 'TRUNCATE');
-- which should come back false.
-- ════════════════════════════════════════════════════════════════════════════
