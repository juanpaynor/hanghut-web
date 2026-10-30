-- ============================================================================
-- Repair: partners_create_entitlement trigger is missing on prod
-- ============================================================================
-- Run this in the Supabase SQL editor (prod, rahhezqtkpvkialnduft).
--
-- WHY
-- ---
-- supabase/migrations/20260830140000_partner_entitlement_autocreate.sql creates a
-- trigger that gives every new partner a Free entitlement row on signup. That
-- trigger is NOT on prod -- it was lost when the migration ledger was squashed.
-- Verified 2026-10-30: the trigger list on public.partners has nine triggers and
-- partners_create_entitlement is not among them.
--
-- Consequence: 18 of 66 partners have no partner_entitlements row at all. The most
-- recent is Anti-Burnout Club (signed up 2026-10-29). get_partner_entitlement()
-- degrades a missing row to Free rather than erroring, so NOTHING IS BROKEN for
-- those partners today -- but:
--   * they are invisible to any admin view that reads partner_entitlements
--   * granting one of them Pro means remembering to INSERT, not UPDATE
-- With 100 partners inbound, that is a footgun that fires quietly and often.
--
-- SAFETY
-- ------
-- This is additive and idempotent.
--   * CREATE OR REPLACE FUNCTION   -- no dependents to break
--   * DROP TRIGGER IF EXISTS       -- safe whether or not it is there
--   * the backfill is ON CONFLICT (partner_id) DO NOTHING, so it can only ever
--     ADD rows. The 48 existing Pro rows, and the Pro grant applied to
--     Anti-Burnout Club on 2026-10-30, are untouched by construction.
-- Nothing here enforces any gate. Entitlements remain unenforced in app code --
-- only three files read them at all (seat-map publish, the billing page, a draft
-- action). This changes who has a ROW, not what anyone can DO.
--
-- ORDER: function, then trigger, then backfill, then the ledger row. One
-- transaction, so a failure anywhere leaves prod exactly as it was.
-- ============================================================================

BEGIN;

-- ── 1. The function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_default_partner_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO partner_entitlements (partner_id, plan_code, source)
    VALUES (NEW.id, 'free', 'default')
    ON CONFLICT (partner_id) DO NOTHING;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_default_partner_entitlement() IS
  'Gives every new partner a Free entitlement row so admin tooling can UPDATE rather than guess whether a row exists.';

-- ── 2. The trigger ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS partners_create_entitlement ON public.partners;
CREATE TRIGGER partners_create_entitlement
    AFTER INSERT ON public.partners
    FOR EACH ROW EXECUTE FUNCTION public.create_default_partner_entitlement();

-- ── 3. Backfill the partners that slipped through ───────────────────────────
INSERT INTO public.partner_entitlements (partner_id, plan_code, source)
SELECT p.id, 'free', 'default' FROM public.partners p
ON CONFLICT (partner_id) DO NOTHING;

-- ── 4. Ledger row ───────────────────────────────────────────────────────────
-- Hand-written because the prod ledger is squashed to a single baseline, so the
-- CLI cannot be used to record this.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261030100000', 'partner_entitlement_autocreate_repair')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- VERIFY  (run after COMMIT)
-- ============================================================================

-- VERIFY 1 — the trigger now exists. Expect exactly one row.
--
-- select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where c.relname = 'partners' and tgname = 'partners_create_entitlement';

-- VERIFY 2 — nobody is missing a row any more. Expect missing = 0,
-- and total_partners = partners_with_rows (66 at time of writing).
--
-- select
--   (select count(*) from public.partners) as total_partners,
--   (select count(*) from public.partner_entitlements) as partners_with_rows,
--   (select count(*) from public.partners p where not exists (
--      select 1 from public.partner_entitlements e where e.partner_id = p.id)) as missing;

-- VERIFY 3 — THIS IS THE ONE THAT MATTERS. The backfill must not have
-- downgraded anyone. Expect pro = 49 (48 grandfathered + Anti-Burnout Club),
-- and Anti-Burnout Club still 'pro' / 'granted'.
--
-- select plan_code, source, count(*) from public.partner_entitlements
--  group by plan_code, source order by plan_code, source;
--
-- select plan_code, source from public.partner_entitlements
--  where partner_id = '6e4fb2ee-e39f-404d-9ed0-26aab82eea73';

-- VERIFY 4 — the trigger actually fires. Rolled back, so it writes nothing.
-- Expect one 'free'/'default' row for the throwaway partner.
--
-- begin;
--   insert into public.partners (user_id, business_name, status)
--   values (null, 'ZZ Trigger Probe', 'pending') returning id;
--   -- paste that id below
--   -- select plan_code, source from public.partner_entitlements where partner_id = '<id>';
-- rollback;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- The backfilled rows are all plan_code='free'/source='default', which is
-- identical to what get_partner_entitlement() returns for a missing row -- so
-- leaving them costs nothing and removing them changes no behaviour. Drop only
-- the trigger if it misbehaves:
--
-- DROP TRIGGER IF EXISTS partners_create_entitlement ON public.partners;
-- DROP FUNCTION IF EXISTS public.create_default_partner_entitlement();
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261030100000';
--
-- To also undo the backfill (NOT recommended -- it cannot distinguish rows this
-- file added from pre-existing 'default' rows, so scope it by timestamp):
-- DELETE FROM public.partner_entitlements
--  WHERE source = 'default' AND plan_code = 'free' AND created_at > '<the time you ran this>';
