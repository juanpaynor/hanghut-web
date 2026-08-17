-- Partner-authored collectible loyalty badges — v1 schema + the manual_grant path.
-- Contract agreed with the app team in team_comms #236 -> #241.
--
-- v1 SCOPE: earn + custom art + profile showcase. NO checkout touch. Perks and access
-- gating are v2 and are blocked on promo_codes being event-scoped with no user binding.
--
-- THE DEFINING DECISION: the canonical customer key is LOWERCASED EMAIL, not user_id.
-- 30.5% of live tickets have user_id NULL (guest checkout). Keying badges on user_id would
-- silently exclude about a third of every partner's real customers, and it would fail worst
-- exactly where it is most visible: a partner creates "Regular", we evaluate retroactively,
-- and it skips their actual regulars. So user_creator_badges stores buyer_email NOT NULL and
-- user_id NULLABLE, and badges are claimed onto an account at signup.

-- ---------------------------------------------------------------------------
-- The badge a partner authors.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_badges (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id    uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,
    tier            text,
    art_url         text,
    -- Auto-approve + report/takedown was the chosen moderation stance, so we need a kill
    -- switch that suppresses ART without deleting the badge or revoking anyone who earned
    -- it. An explicit boolean, NOT a nulled art_url — null is ambiguous with "never
    -- uploaded", and the app needs to tell those apart to pick the default frame.
    art_suppressed  boolean NOT NULL DEFAULT false,
    criteria        jsonb NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    -- Served to the app for rarity ("312 people have this") so no client ever aggregates
    -- user_creator_badges. Maintained by ABSOLUTE RECOMPUTE, never by increment — this
    -- codebase has been bitten three times by incremented counters drifting from truth
    -- (events.tickets_sold, ticket_tiers.quantity_sold, merch quantity_sold).
    holder_count    integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT creator_badges_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT creator_badges_holder_count_nonneg CHECK (holder_count >= 0),
    -- Versioned envelope so the shape can evolve without guessing at old rows.
    CONSTRAINT creator_badges_criteria_shape CHECK (
        criteria ? 'version' AND criteria ? 'type'
    ),
    CONSTRAINT creator_badges_criteria_type CHECK (
        criteria->>'type' IN (
            'attendance_count', 'spend_total', 'specific_event', 'checkin_count',
            'manual_grant', 'first_n_buyers', 'group_buyer', 'streak_months'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_creator_badges_organizer ON public.creator_badges (organizer_id);
CREATE INDEX IF NOT EXISTS idx_creator_badges_criteria_type ON public.creator_badges ((criteria->>'type'));

-- ---------------------------------------------------------------------------
-- Who has earned it. buyer_email is the key; user_id is an attachment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_creator_badges (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_id     uuid NOT NULL REFERENCES public.creator_badges(id) ON DELETE CASCADE,
    -- SET NULL, not CASCADE: the badge was earned by an EMAIL. Deleting the account should
    -- not erase the fact, or a delete-and-resignup would silently strip earned badges.
    user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    buyer_email  text NOT NULL,
    grant_type   text NOT NULL DEFAULT 'auto',
    granted_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    earned_at    timestamptz NOT NULL DEFAULT now(),

    -- PERMANENCE + IDEMPOTENCE in one constraint. Re-running the engine can never
    -- double-award, and a later refund never revokes. Both agreed in #239/#241.
    CONSTRAINT user_creator_badges_unique UNIQUE (badge_id, buyer_email),
    -- Enforced lowercase so the canonical key cannot drift case-wise and split a person
    -- into two badge holders.
    CONSTRAINT user_creator_badges_email_lower CHECK (buyer_email = lower(buyer_email)),
    CONSTRAINT user_creator_badges_email_not_blank CHECK (btrim(buyer_email) <> ''),
    CONSTRAINT user_creator_badges_grant_type CHECK (grant_type IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_user_creator_badges_email ON public.user_creator_badges (buyer_email);
CREATE INDEX IF NOT EXISTS idx_user_creator_badges_user ON public.user_creator_badges (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_creator_badges_badge ON public.user_creator_badges (badge_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_creator_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_badges_public_read ON public.creator_badges;
CREATE POLICY creator_badges_public_read ON public.creator_badges
    FOR SELECT USING (true);

DROP POLICY IF EXISTS creator_badges_owner_rw ON public.creator_badges;
CREATE POLICY creator_badges_owner_rw ON public.creator_badges
    FOR ALL
    USING (organizer_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()))
    WITH CHECK (organizer_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS user_creator_badges_public_read ON public.user_creator_badges;
CREATE POLICY user_creator_badges_public_read ON public.user_creator_badges
    FOR SELECT USING (true);

-- DELIBERATELY NO INSERT/UPDATE POLICY on user_creator_badges. We told the app exactly this
-- in #237: an INSERT policy for `authenticated` would let any client mint itself any badge,
-- including partner badges attached to real perks in v2. Awarding is server-side only, via
-- the SECURITY DEFINER functions below. Their existing global badge system fails the other
-- way — RLS enabled with SELECT-only policies and client-side writes, so every award is
-- silently rejected. Read-only client + definer writes is the fix for both.

-- ---------------------------------------------------------------------------
-- holder_count: absolute recompute. Never an increment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_badge_holder_count(p_badge_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    UPDATE creator_badges b
       SET holder_count = (SELECT count(*) FROM user_creator_badges u WHERE u.badge_id = b.id),
           updated_at = now()
     WHERE b.id = p_badge_id
    RETURNING b.holder_count;
$function$;

-- ---------------------------------------------------------------------------
-- manual_grant — the whole of v1's awarding, and the app's unblock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_creator_badge(p_badge_id uuid, p_emails text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_badge record;
    v_inserted integer;
BEGIN
    SELECT b.id, b.criteria, b.organizer_id, pa.user_id AS partner_user_id
      INTO v_badge
      FROM creator_badges b
      JOIN partners pa ON pa.id = b.organizer_id
     WHERE b.id = p_badge_id;

    IF v_badge IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;

    -- SECURITY DEFINER bypasses RLS, so ownership must be checked explicitly here or any
    -- signed-in user could grant another partner's badge. auth.uid() is NULL under the
    -- service key, which is how trusted server-side callers are allowed through.
    IF auth.uid() IS NOT NULL AND v_badge.partner_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Not authorised to grant this badge';
    END IF;

    IF v_badge.criteria->>'type' <> 'manual_grant' THEN
        RAISE EXCEPTION 'Badge % is not a manual_grant badge (type=%)',
            p_badge_id, v_badge.criteria->>'type';
    END IF;

    WITH emails AS (
        SELECT DISTINCT lower(btrim(e)) AS em
          FROM unnest(coalesce(p_emails, '{}')) e
         WHERE btrim(e) <> ''
    )
    INSERT INTO user_creator_badges (badge_id, user_id, buyer_email, grant_type, granted_by)
    SELECT p_badge_id, u.id, em.em, 'manual', auth.uid()
      FROM emails em
      -- LATERAL LIMIT 1 rather than a plain join: a duplicate email on users would
      -- otherwise multiply the insert rows and trip the unique constraint.
      LEFT JOIN LATERAL (
          SELECT id FROM users WHERE lower(email) = em.em LIMIT 1
      ) u ON true
    ON CONFLICT (badge_id, buyer_email) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    PERFORM public.recompute_badge_holder_count(p_badge_id);

    RETURN jsonb_build_object('success', true, 'granted', v_inserted);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Claim-on-signup: attach badges already earned by this email to the new account.
-- Same mechanism the merch guest claims need — built once, used by both.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_creator_badges_for_user(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email text;
    v_claimed integer;
BEGIN
    SELECT lower(email) INTO v_email FROM users WHERE id = p_user_id;
    IF v_email IS NULL OR btrim(v_email) = '' THEN
        RETURN 0;
    END IF;

    UPDATE user_creator_badges
       SET user_id = p_user_id
     WHERE buyer_email = v_email
       AND user_id IS DISTINCT FROM p_user_id;

    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    RETURN v_claimed;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants. CREATE FUNCTION grants EXECUTE to PUBLIC by default, so revoking only
-- anon/authenticated would leave these world-callable.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.recompute_badge_holder_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_badge_holder_count(uuid) TO service_role;

-- Organizers call this from the dashboard with their own session, so `authenticated` is
-- required; the ownership check inside the function is what makes that safe.
REVOKE ALL ON FUNCTION public.grant_creator_badge(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_creator_badge(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_creator_badges_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_creator_badges_for_user(uuid) TO service_role;
