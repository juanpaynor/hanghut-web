-- Badge permissions: who may act for a partner, and who may call the engine.
--
-- Two separate problems, both in the same function set.
--
-- 1. WHO MAY ACT FOR A PARTNER. Three layers each answered this differently:
--    the server action, the creator_badges RLS policy, and the RPCs themselves.
--    Only the RPCs are left, and they still say "owner". A partner MANAGER can
--    open the Badges page (getPartner() falls back to team membership) and then
--    have grant and preview fail underneath them. One helper now answers the
--    question everywhere: owner, team member, or platform admin.
--
-- 2. THE ENGINE WAS REACHABLE FROM A BROWSER. evaluate_creator_badge,
--    evaluate_all_creator_badges and creator_badge_qualifying_emails are all
--    SECURITY DEFINER with no caller check -- they trust their arguments because
--    only the service role was ever meant to call them. EXECUTE was granted to
--    anon and authenticated anyway, so anyone could mint badges for any badge id,
--    and anon could dump any organizer's customer emails by passing a criteria
--    that matches everyone. Revoked; the service role and the definer-chain from
--    preview_creator_badge_earners still reach them.

CREATE OR REPLACE FUNCTION public.can_manage_partner(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM partner_team_members WHERE partner_id = p_partner_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true);
$$;

COMMENT ON FUNCTION public.can_manage_partner(uuid) IS
    'True when the current user may act for this partner: owner, team member, or platform admin.';

GRANT EXECUTE ON FUNCTION public.can_manage_partner(uuid) TO authenticated, service_role;

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
    SELECT b.id, b.criteria, b.organizer_id
      INTO v_badge
      FROM creator_badges b
     WHERE b.id = p_badge_id;

    IF v_badge IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;

    -- auth.uid() is null for the service role, which is trusted by definition.
    IF auth.uid() IS NOT NULL AND NOT public.can_manage_partner(v_badge.organizer_id) THEN
        RAISE EXCEPTION 'Not authorised to grant this badge';
    END IF;

    IF v_badge.criteria->>'type' <> 'manual_grant' THEN
        RAISE EXCEPTION 'Badge % is not a manual_grant badge (type=%)',
            p_badge_id, v_badge.criteria->>'type';
    END IF;

    WITH emails AS (
        SELECT DISTINCT lower(btrim(e)) AS em
          FROM unnest(coalesce(p_emails, '{}'::text[])) e
         WHERE btrim(e) <> ''
    )
    INSERT INTO user_creator_badges (badge_id, user_id, buyer_email, grant_type, granted_by)
    SELECT p_badge_id, u.id, em.em, 'manual', auth.uid()
      FROM emails em
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

CREATE OR REPLACE FUNCTION public.preview_creator_badge_earners(p_organizer_id uuid, p_criteria jsonb)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.can_manage_partner(p_organizer_id) THEN
        RAISE EXCEPTION 'Not authorised to preview badges for this organizer';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.creator_badge_qualifying_emails(p_organizer_id, p_criteria);

    RETURN coalesce(v_count, 0);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Engine internals: service role only.

REVOKE EXECUTE ON FUNCTION public.creator_badge_qualifying_emails(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_creator_badge(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_all_creator_badges() FROM anon, authenticated;

-- preview_creator_badge_earners stays callable by a signed-in partner (it checks
-- the caller); anon has no business there.
REVOKE EXECUTE ON FUNCTION public.preview_creator_badge_earners(uuid, jsonb) FROM anon;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; the helper only reports
-- on auth.uid() and cannot be pointed at another user, but anon has no reason
-- to call it.
REVOKE EXECUTE ON FUNCTION public.can_manage_partner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_partner(uuid) TO authenticated, service_role;
