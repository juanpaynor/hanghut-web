-- DEPLOY: presale list membership, extracted  -- PHASE 4 companion
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- WHY THIS EXISTS.
--
-- The buyer's event page has to choose between two cards: "You're on the list,
-- tickets open Friday" and "Early access — pre-register". check_presale_access
-- cannot answer that, and correctly so: before the presale opens it returns
-- EVENT_NOT_YET_ON_SALE for everybody, because the time check has to outrank
-- the person check at the till.
--
-- So the page needs membership on its own. The tempting shortcut is to write
-- the matching rule a second time in TypeScript — which is how two surfaces
-- quietly start disagreeing about who is on a list. Instead the rule moves
-- into its own function and check_presale_access calls it, so there is exactly
-- one implementation and the page reads the same answer the till does.
--
-- ⚠ NO SIGNATURE CHANGES. check_presale_access keeps the identical argument
-- list, so CREATE OR REPLACE replaces it in place rather than creating a
-- second overload, and create-purchase-intent v133 needs NO redeploy.
--
-- Rollback: this is behaviour-preserving. The verification at the bottom proves
-- the replaced function still answers exactly as it did before.

BEGIN;

-- ===========================================================================
-- 1. THE RULE, IN ONE PLACE
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.is_on_presale_list(
    p_event_id     uuid,
    p_user_id      uuid DEFAULT NULL,
    p_email        text DEFAULT NULL,
    p_access_token uuid DEFAULT NULL
) RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
    SELECT
    -- (a) A cleared registration under any of this person's three identities.
    --
    -- ⚠ 'auto_approved' is NOT optional. submit_event_request seeds a
    -- pre-registrant auto_approved on an event without require_approval, never
    -- 'approved'. The purchase gate's own approval check tests
    -- `status <> 'approved'` -- right there, and it would refuse every single
    -- pre-registrant if it were copied here.
    --
    -- ⚠ Deliberately WIDER than event_registration_eligibility, which insists
    -- on r.user_id IS NULL before it will match a guest by email. That is
    -- correct for deciding which submission an order attaches to, and wrong
    -- for "is this person on the list": pre-register while logged in, come
    -- back as a guest, and you would be turned away from your own place.
    EXISTS (
        SELECT 1
          FROM event_registrations r
          LEFT JOIN users u ON u.id = r.user_id
         WHERE r.event_id = p_event_id
           AND r.status::text IN ('approved', 'auto_approved')
           AND (
                (p_user_id IS NOT NULL AND r.user_id = p_user_id)
             OR (p_email IS NOT NULL AND lower(r.guest_email) = lower(p_email))
             OR (p_email IS NOT NULL AND lower(u.email)       = lower(p_email))
           )
    )
    -- (b) Or a link we mailed. Scoped to this event AND to the token's own
    -- registration, so a token from another event resolves to nothing.
    OR (p_access_token IS NOT NULL AND EXISTS (
        SELECT 1
          FROM event_presale_access a
          JOIN event_registrations r ON r.id = a.registration_id
         WHERE a.token = p_access_token
           AND a.event_id = p_event_id
           AND r.event_id = p_event_id
           AND (a.expires_at IS NULL OR a.expires_at > now())
           AND r.status::text IN ('approved', 'auto_approved')
    ));
$fn$;

-- Same posture as check_presale_access and check_one_ticket_per_email: "is this
-- person on the guest list" is an enumeration oracle. The page calls this with
-- the service-role client, server side, and never exposes it to a browser.
REVOKE ALL ON FUNCTION public.is_on_presale_list(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_on_presale_list(uuid, uuid, text, uuid)
    TO service_role;

COMMENT ON FUNCTION public.is_on_presale_list(uuid, uuid, text, uuid) IS
    'Is this person on the event''s pre-registration list? Accepts approved AND auto_approved, matches user_id / guest_email / account email, or a valid event_presale_access token. The single implementation; check_presale_access calls it. service_role only.';


-- ===========================================================================
-- 2. THE GATE, NOW DELEGATING. Identical signature, identical answers.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.check_presale_access(
    p_event_id     uuid,
    p_user_id      uuid    DEFAULT NULL,
    p_email        text    DEFAULT NULL,
    p_access_token uuid    DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_presale_at timestamptz;
    v_public_at  timestamptz;
BEGIN
    SELECT presale_starts_at, public_sale_starts_at
      INTO v_presale_at, v_public_at
      FROM events WHERE id = p_event_id;

    -- Unknown event, or no presale configured: say nothing and let the caller's
    -- own gates decide. This must never be the thing that fails an ordinary
    -- sale -- the same posture as check_one_ticket_per_email.
    IF v_presale_at IS NULL THEN
        RETURN jsonb_build_object('enforced', false, 'blocked', false);
    END IF;

    -- (a) Nobody at all, not even the list, before the presale opens. This
    -- ordering is why the page cannot use this function to ask about
    -- membership, and why is_on_presale_list exists.
    IF now() < v_presale_at THEN
        RETURN jsonb_build_object(
            'enforced', true, 'blocked', true,
            'code', 'EVENT_NOT_YET_ON_SALE',
            'opens_at', v_presale_at,
            'message', 'Tickets for this event are not on sale yet.');
    END IF;

    -- (b) Public sale has started: the gate has done its job and stands down.
    IF v_public_at IS NOT NULL AND now() >= v_public_at THEN
        RETURN jsonb_build_object('enforced', true, 'blocked', false);
    END IF;

    -- (c) Inside the presale window.
    IF public.is_on_presale_list(p_event_id, p_user_id, p_email, p_access_token) THEN
        RETURN jsonb_build_object('enforced', true, 'blocked', false);
    END IF;

    RETURN jsonb_build_object(
        'enforced', true, 'blocked', true,
        'code', 'PRESALE_REGISTRATION_REQUIRED',
        'message', 'Tickets are open to people who pre-registered. Use the link in your email, or the address you signed up with.');
END;
$fn$;

REVOKE ALL ON FUNCTION public.check_presale_access(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_presale_access(uuid, uuid, text, uuid)
    TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113100000', 'presale_list_helper')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1: still exactly ONE copy of each, still service_role only.
-- A changed signature would have created a SECOND candidate rather than
-- replacing, and PostgREST would then pick by the named arguments supplied.
-- ===========================================================================
SELECT p.oid::regprocedure AS signature,
       p.provolatile = 's' AS is_stable,
       p.prosecdef    AS security_definer,
       (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
         WHERE n2.nspname = 'public' AND p2.proname = p.proname) AS copies,
       COALESCE((SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
                   FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE'),
                'default (= PUBLIC)') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('check_presale_access', 'is_on_presale_list')
 ORDER BY p.proname;

-- ===========================================================================
-- VERIFY 2: still a no-op on every live event (nothing has a presale date).
-- ===========================================================================
SELECT count(*) FILTER (WHERE (public.check_presale_access(id))->>'enforced' = 'false') AS no_op,
       count(*) AS live_events
  FROM public.events
 WHERE status IN ('active', 'hidden');

-- ===========================================================================
-- VERIFY 3 (safe, rolls back): the five states are UNCHANGED from the first
-- deploy, and membership now answers on its own.
-- ===========================================================================
DO $test$
DECLARE
    v_event uuid; v_email text;
    v_before jsonb; v_future jsonb; v_listed jsonb; v_stranger jsonb; v_public jsonb;
    v_member boolean; v_nonmember boolean;
BEGIN
    SELECT r.event_id, COALESCE(r.guest_email, u.email)
      INTO v_event, v_email
      FROM event_registrations r
      LEFT JOIN users u ON u.id = r.user_id
      JOIN events e ON e.id = r.event_id
     WHERE r.status::text IN ('approved','auto_approved')
       AND COALESCE(r.guest_email, u.email) IS NOT NULL
       AND e.status::text IN ('active','hidden')
     LIMIT 1;
    IF v_event IS NULL THEN RAISE EXCEPTION 'NO SAMPLE DATA -- skip'; END IF;

    -- Membership is answerable WITHOUT a presale being configured at all.
    -- This is the new capability the page needs.
    v_member    := public.is_on_presale_list(v_event, NULL, v_email, NULL);
    v_nonmember := public.is_on_presale_list(v_event, NULL, 'stranger@example.com', NULL);

    v_before := public.check_presale_access(v_event, NULL, v_email, NULL);
    UPDATE events SET presale_starts_at = now() + interval '1 day' WHERE id = v_event;
    v_future := public.check_presale_access(v_event, NULL, v_email, NULL);
    UPDATE events SET presale_starts_at = now() - interval '1 hour' WHERE id = v_event;
    v_listed   := public.check_presale_access(v_event, NULL, v_email, NULL);
    v_stranger := public.check_presale_access(v_event, NULL, 'stranger@example.com', NULL);
    UPDATE events SET public_sale_starts_at = now() - interval '1 minute' WHERE id = v_event;
    v_public := public.check_presale_access(v_event, NULL, 'stranger@example.com', NULL);

    RAISE EXCEPTION E'TEST_COMPLETE_ROLLING_BACK\n'
        '  is_on_presale_list, real member  -> %  (want true)   <-- NEW\n'
        '  is_on_presale_list, stranger     -> %  (want false)  <-- NEW\n'
        '  no presale configured            -> %  (want enforced:false)\n'
        '  presale in the future            -> %  (want EVENT_NOT_YET_ON_SALE)\n'
        '  on the list, presale open        -> %  (want blocked:false)\n'
        '  not on the list                  -> %  (want PRESALE_REGISTRATION_REQUIRED)\n'
        '  public sale open                 -> %  (want blocked:false)',
        v_member, v_nonmember, v_before, v_future, v_listed, v_stranger, v_public;
END
$test$;
