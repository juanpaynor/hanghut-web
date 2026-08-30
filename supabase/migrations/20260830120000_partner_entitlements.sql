-- HangHut Pro — phase 1: the entitlements layer.
--
-- NOTHING IS ENFORCED BY THIS MIGRATION. It creates the vocabulary and seeds it
-- so that every partner keeps exactly what they have today. Enforcement is a
-- later, separate change that reads get_partner_entitlement() — deliberately
-- split so that if a gate is wrong we can roll back enforcement without losing
-- the record of who was granted what and why.
--
-- Why this exists at all, in one sentence: capability and commercial terms are
-- currently spread across loose boolean columns on `partners` with no record of
-- intent, and we already have a live example of the cost — 14 partners sit on 0%
-- commission and nobody can now say which of those were deliberate deals and
-- which were onboarding defaults. `source` and `granted_reason` are cheap today
-- and unrecoverable later.

-- ── Plan catalogue ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_plans (
    code          text PRIMARY KEY,
    name          text NOT NULL,
    price_monthly numeric(10,2) NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    sort_order    integer NOT NULL DEFAULT 0
);

INSERT INTO public.partner_plans (code, name, price_monthly, sort_order) VALUES
    ('free', 'Free', 0, 0),
    ('pro',  'Pro',  0, 1)   -- price set when billing ships; granted-only until then
ON CONFLICT (code) DO NOTHING;

COMMENT ON COLUMN public.partner_plans.price_monthly IS
  'Pro is 0 until billing ships. A non-zero price here does NOT start charging anyone — see partner_entitlements.source.';


-- ── The limits each plan carries ──────────────────────────────────────────────
-- value is jsonb so booleans and numbers share one table without a type column.

CREATE TABLE IF NOT EXISTS public.plan_limits (
    plan_code text NOT NULL REFERENCES public.partner_plans(code) ON DELETE CASCADE,
    key       text NOT NULL,
    value     jsonb NOT NULL,
    PRIMARY KEY (plan_code, key)
);

INSERT INTO public.plan_limits (plan_code, key, value) VALUES
    -- Publishing an event with a seat map is gated; BUILDING one never is. A
    -- partner has to see the map working to want it, and discovering it is
    -- locked before that is how the upgrade is lost rather than won.
    ('free', 'seat_map_publish',         'false'::jsonb),
    ('pro',  'seat_map_publish',         'true'::jsonb),

    ('free', 'custom_domain',            'false'::jsonb),
    ('pro',  'custom_domain',            'true'::jsonb),

    ('free', 'api_access',               'false'::jsonb),
    ('pro',  'api_access',               'true'::jsonb),

    -- Marketing sends only. Transactional mail — tickets, reminders, refunds,
    -- OTPs — is NEVER metered: that is the product working, and throttling it
    -- would break an event over a billing decision.
    --
    -- These numbers are generous on purpose. Marginal cost is ~PHP 0.05/email and
    -- total lifetime marketing volume across the whole platform is 13 sends. The
    -- cap exists to protect the shared sending domain, not to price a resource.
    ('free', 'marketing_emails_monthly', '1000'::jsonb),
    ('pro',  'marketing_emails_monthly', '10000'::jsonb)
ON CONFLICT (plan_code, key) DO NOTHING;


-- ── One row per partner ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_entitlements (
    partner_id      uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
    plan_code       text NOT NULL REFERENCES public.partner_plans(code),

    -- The column this table exists for. 'granted' and 'paid' look identical in
    -- every other field, and telling them apart later is what decides whether a
    -- partner can ever be asked to start paying.
    source          text NOT NULL DEFAULT 'default'
                    CHECK (source IN ('default', 'paid', 'granted', 'trial')),
    granted_reason  text,
    granted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Per-partner exceptions, merged OVER plan_limits by the resolver. A special
    -- deal is rarely a whole tier — it is usually one tier plus or minus a single
    -- thing. Without this we would invent a plan code per partner, which is
    -- exactly how 14 hand-set commission rates happened.
    overrides       jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Null while granted; set by billing once it exists.
    current_period_end timestamptz,
    subscription_ref   text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_entitlements_plan_idx
    ON public.partner_entitlements (plan_code);

ALTER TABLE public.partner_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_entitlements  ENABLE ROW LEVEL SECURITY;

-- Reads go through get_partner_entitlement(); writes are admin-only via the
-- server. No client policies: a partner must not be able to edit its own plan.
REVOKE ALL ON public.partner_plans        FROM anon, authenticated;
REVOKE ALL ON public.plan_limits          FROM anon, authenticated;
REVOKE ALL ON public.partner_entitlements FROM anon, authenticated;


-- ── Seed: everyone Free, then grandfather current users onto Pro ──────────────
-- "Nothing changes for anyone" is the whole requirement of phase 1.

INSERT INTO public.partner_entitlements (partner_id, plan_code, source)
SELECT p.id, 'free', 'default' FROM public.partners p
ON CONFLICT (partner_id) DO NOTHING;

-- Anyone already USING a soon-to-be-gated feature is moved to Pro as a grant, so
-- that when enforcement lands they lose nothing. Recorded as 'granted' with a
-- reason, which is precisely the distinction this table exists to keep.
UPDATE public.partner_entitlements e
SET plan_code = 'pro',
    source = 'granted',
    granted_reason = 'Grandfathered at Pro launch — was already using '
        || array_to_string(ARRAY_REMOVE(ARRAY[
             CASE WHEN EXISTS (SELECT 1 FROM event_seat_maps sm JOIN events ev ON ev.id = sm.event_id
                               WHERE ev.organizer_id = e.partner_id) THEN 'seat maps' END,
             CASE WHEN EXISTS (SELECT 1 FROM partners p2
                               WHERE p2.id = e.partner_id AND p2.custom_domain IS NOT NULL) THEN 'a custom domain' END,
             CASE WHEN EXISTS (SELECT 1 FROM api_keys k WHERE k.partner_id = e.partner_id) THEN 'the API' END,
             CASE WHEN EXISTS (SELECT 1 FROM email_sends es WHERE es.partner_id = e.partner_id) THEN 'marketing email' END
           ], NULL), ', ')
        || ' before it was gated',
    updated_at = now()
WHERE EXISTS (SELECT 1 FROM event_seat_maps sm JOIN events ev ON ev.id = sm.event_id
              WHERE ev.organizer_id = e.partner_id)
   OR EXISTS (SELECT 1 FROM partners p2 WHERE p2.id = e.partner_id AND p2.custom_domain IS NOT NULL)
   OR EXISTS (SELECT 1 FROM api_keys k WHERE k.partner_id = e.partner_id)
   OR EXISTS (SELECT 1 FROM email_sends es WHERE es.partner_id = e.partner_id);


-- ── The single resolver every gate must read ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_partner_entitlement(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_plan text;
    v_source text;
    v_overrides jsonb;
    v_period_end timestamptz;
    v_limits jsonb;
BEGIN
    SELECT e.plan_code, e.source, e.overrides, e.current_period_end
    INTO v_plan, v_source, v_overrides, v_period_end
    FROM partner_entitlements e
    WHERE e.partner_id = p_partner_id;

    -- A partner with no row is Free. Never error here: a missing row must
    -- degrade to the free tier, not break the page asking the question.
    IF NOT FOUND THEN
        v_plan := 'free'; v_source := 'default'; v_overrides := '{}'::jsonb;
    END IF;

    -- A lapsed PAID plan falls back to free. A GRANTED plan has no period and
    -- never lapses — that is what makes it a grant.
    IF v_source = 'paid' AND v_period_end IS NOT NULL AND v_period_end < now() THEN
        v_plan := 'free';
    END IF;

    SELECT coalesce(jsonb_object_agg(l.key, l.value), '{}'::jsonb)
    INTO v_limits
    FROM plan_limits l WHERE l.plan_code = v_plan;

    RETURN jsonb_build_object(
        'plan', v_plan,
        'source', v_source,
        'current_period_end', v_period_end,
        -- Overrides win. `||` on jsonb is a right-biased shallow merge.
        'limits', v_limits || coalesce(v_overrides, '{}'::jsonb)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_entitlement(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_partner_entitlement(uuid) IS
  'The ONE place a gate may ask what a partner is allowed. Merges plan_limits with per-partner overrides. Scattering plan checks across components is how a paywall ends up enforced in the UI and open in the API.';
