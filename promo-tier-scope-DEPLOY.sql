-- ============================================================================
-- PROMO CODES: SCOPE A CODE TO SPECIFIC TIERS
-- 2026-11-15   ledger 20261115140000
-- ============================================================================
--
-- WHAT
-- ----
-- A promo code can now apply to only some of an event's ticket tiers -- "20%
-- off VIP" rather than 20% off everything.
--
-- SHAPE COPIED FROM registration_questions.tier_ids, DELIBERATELY. That column
-- already solves "scope this thing to tiers" in this schema, and
-- submit_event_request already reads it with these exact semantics:
--
--     NULL  /  not an array  /  empty array   ->  applies to ALL tiers
--     ["<uuid>", "<uuid>"]                    ->  applies ONLY to those tiers
--
-- One mental model instead of two, and a jsonb array means no join table, no
-- FK fan-out, and no migration risk for the codes that exist today -- they
-- all read NULL, which means "all tiers", which is exactly what they do now.
--
-- WHY NOT A tier_id SINGLE COLUMN: an organizer running "early-bird discount on
-- GA and Student but not VIP" would need two identical codes with two separate
-- usage counters, so the limit would be wrong. The array is the same work and
-- a superset.
--
-- WHY NOT A JOIN TABLE: it buys referential integrity we do not get to use --
-- a deleted tier must NOT invalidate the code's other tiers, and
-- ticket_tiers deletion is already a minefield (FK NO ACTION from
-- event_sections, SET NULL from tickets). A stale uuid in the array simply
-- never matches, which is the behaviour we want.
--
-- NOT IN THIS FILE: the enforcement. This migration is INERT on its own --
-- nothing reads tier_ids until create-purchase-intent v136 and
-- validatePromoCode ship. That ordering is deliberate: the column can land
-- ahead of the code with no behaviour change at all, and the organizer UI
-- cannot write a scope that the server would ignore, because the server half
-- ships first.
-- ============================================================================

BEGIN;

ALTER TABLE public.promo_codes
    ADD COLUMN IF NOT EXISTS tier_ids jsonb;

COMMENT ON COLUMN public.promo_codes.tier_ids IS
    'Ticket tiers this code applies to, as a jsonb array of tier-id strings. NULL, a non-array, or an empty array all mean EVERY tier -- same semantics as registration_questions.tier_ids. Stale uuids simply never match.';

-- Reject a shape the readers cannot interpret. Scalars and objects are not
-- "all tiers", they are a bug, and silently treating them as "all tiers" would
-- turn a botched write into an unintended discount on every tier.
--
-- NOT VALID is wrong here: the table holds under a hundred rows, all with
-- tier_ids NULL, so the
-- table scan is free and a validated constraint is worth having.
ALTER TABLE public.promo_codes
    DROP CONSTRAINT IF EXISTS promo_codes_tier_ids_is_array;
ALTER TABLE public.promo_codes
    ADD CONSTRAINT promo_codes_tier_ids_is_array
    CHECK (tier_ids IS NULL OR jsonb_typeof(tier_ids) = 'array');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115140000', 'promo_codes_tier_ids')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- VERIFY  ---  run AFTER the commit
-- ============================================================================

-- V1. Column exists, nullable, no default -> every existing code means "all tiers".
-- EXPECT: jsonb, YES, null
-- select data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='promo_codes' and column_name='tier_ids';

-- V2. Nothing changed for any existing code.
-- EXPECT: scoped = 0 (total is whatever exists; nothing is scoped yet)
-- select count(*) as total,
--        count(*) filter (where tier_ids is not null
--                           and jsonb_typeof(tier_ids)='array'
--                           and jsonb_array_length(tier_ids) > 0) as scoped
--   from promo_codes;

-- V3. The CHECK is validated, not NOT VALID.
-- EXPECT: convalidated = true
-- select conname, convalidated, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid='public.promo_codes'::regclass
--    and conname='promo_codes_tier_ids_is_array';

-- V4. A bad shape is refused.
-- EXPECT: both raise 23514 check_violation
-- update promo_codes set tier_ids = '"VIP"'::jsonb where false;   -- scalar
-- update promo_codes set tier_ids = '{"a":1}'::jsonb where false; -- object


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Additive and inert. Leaving it in place costs nothing even if the code half
-- is reverted, because NULL already means "all tiers".
--
--   alter table public.promo_codes drop constraint if exists promo_codes_tier_ids_is_array;
--   alter table public.promo_codes drop column if exists tier_ids;
--
-- To neutralise a scope WITHOUT a deploy (the kill switch):
--   update promo_codes set tier_ids = null where id = '...';   -- back to all tiers
-- ============================================================================
