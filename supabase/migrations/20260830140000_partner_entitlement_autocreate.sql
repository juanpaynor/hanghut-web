-- Every new partner gets an entitlement row on signup.
--
-- Phase 1 seeded the 23 partners that existed at the time. Without this trigger
-- every partner onboarded AFTER that seed has no row at all. get_partner_entitlement()
-- degrades a missing row to Free rather than erroring, so nothing breaks — but the
-- partner is then invisible to any admin list that reads partner_entitlements, and
-- granting them Pro means remembering to INSERT rather than UPDATE. With 100
-- partners inbound that is a footgun that fires quietly and often.

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

DROP TRIGGER IF EXISTS partners_create_entitlement ON public.partners;
CREATE TRIGGER partners_create_entitlement
    AFTER INSERT ON public.partners
    FOR EACH ROW EXECUTE FUNCTION public.create_default_partner_entitlement();

-- Backfill anyone who slipped in between the phase-1 seed and this trigger.
INSERT INTO public.partner_entitlements (partner_id, plan_code, source)
SELECT p.id, 'free', 'default' FROM public.partners p
ON CONFLICT (partner_id) DO NOTHING;

COMMENT ON FUNCTION public.create_default_partner_entitlement() IS
  'Gives every new partner a Free entitlement row so admin tooling can UPDATE rather than guess whether a row exists.';
