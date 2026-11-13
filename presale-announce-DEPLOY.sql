-- DEPLOY: the on-sale announcement list  -- PHASE 5
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- One function. It answers "who do I email when this presale opens, and what
-- is each person's link?" and it MINTS the tokens as it goes.
--
-- ORDER:
--   1. this file                                  <-- inert, nothing calls it yet
--   2. supabase functions deploy process-email-queue   --no-verify-jwt=false (see note)
--   3. supabase functions deploy send-promotional-email
--   4. push the frontend
--
-- ⚠ CHECK verify_jwt BEFORE DEPLOYING EITHER FUNCTION. There is no config.toml
-- in this repo, so the CLI defaults to ON and the live settings are the only
-- record. Today: process-email-queue = true, send-promotional-email = FALSE.
-- Deploying send-promotional-email without --no-verify-jwt breaks every
-- campaign; deploying process-email-queue WITH it would needlessly open a
-- worker to the world.
--
-- Rollback: DROP FUNCTION public.presale_announcement_list(uuid);
-- Tokens already minted stay valid and keep working — they are rows in
-- event_presale_access, not state inside this function.

BEGIN;

-- ===========================================================================
-- WHO GETS THE EMAIL, AND THEIR LINK
-- ===========================================================================
--
-- WHY THIS MINTS RATHER THAN JUST READS.
--
-- The link has to exist before the email can be written, and the only moment
-- we know the full list is the moment we send. Minting here keeps those two
-- facts in one transaction: there is no window where a recipient is in the
-- batch but their token is not yet in the table.
--
-- ⚠ IDEMPOTENT BY DESIGN. ON CONFLICT (registration_id) DO UPDATE ... RETURNING
-- rather than DO NOTHING, so a resend returns each person's EXISTING token
-- instead of minting a second one. A fresh token per send would scatter
-- multiple working keys into multiple inboxes for the same person, and revoking
-- one later would do nothing. (DO NOTHING would also return no row at all for
-- anyone already minted, which silently drops them from the resend — the worse
-- failure, because it looks like a smaller list rather than an error.)
--
-- ⚠ Deliberately NOT filtered by suppression or unsubscribe. That filtering is
-- send-promotional-email's job and it is the authoritative chokepoint; doing it
-- in two places means two definitions of "may we email this person".

CREATE OR REPLACE FUNCTION public.presale_announcement_list(p_event_id uuid)
RETURNS TABLE (email text, first_name text, token uuid)
 LANGUAGE plpgsql
 VOLATILE                      -- it writes; STABLE here would be a lie
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
BEGIN
    RETURN QUERY
    WITH people AS (
        -- One row per PERSON, not per registration. Someone who registered
        -- twice (a second order, a resumed form) must not be emailed twice,
        -- and DISTINCT ON picks their earliest row so the token is stable
        -- across sends.
        SELECT DISTINCT ON (lower(COALESCE(r.guest_email, u.email)))
               r.id                                        AS registration_id,
               lower(COALESCE(r.guest_email, u.email))     AS addr,
               COALESCE(NULLIF(btrim(r.guest_name), ''), u.display_name) AS full_name
          FROM event_registrations r
          LEFT JOIN users u ON u.id = r.user_id
         WHERE r.event_id = p_event_id
           -- Same two statuses the gate accepts. A 'pending' registrant on an
           -- approval event is NOT emailed "go and buy": they cannot, and the
           -- link would hand them a refusal at the till.
           AND r.status::text IN ('approved', 'auto_approved')
           AND COALESCE(r.guest_email, u.email) IS NOT NULL
         ORDER BY lower(COALESCE(r.guest_email, u.email)), r.created_at ASC
    ),
    minted AS (
        INSERT INTO event_presale_access (event_id, registration_id, email)
        SELECT p_event_id, p.registration_id, p.addr FROM people p
        ON CONFLICT (registration_id) DO UPDATE
            SET email = EXCLUDED.email      -- no-op write, purely to get RETURNING
        RETURNING event_presale_access.registration_id, event_presale_access.token
    )
    SELECT p.addr::text,
           -- First name only. "Hi Maria Santos," reads like a form letter.
           NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), '')::text,
           m.token
      FROM people p
      JOIN minted m ON m.registration_id = p.registration_id;
END;
$fn$;

-- It mints access tokens. Nothing a browser may ever call.
REVOKE ALL ON FUNCTION public.presale_announcement_list(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.presale_announcement_list(uuid)
    TO service_role;

COMMENT ON FUNCTION public.presale_announcement_list(uuid) IS
    'Recipients for an event''s on-sale announcement, one row per person, each with a minted-or-existing event_presale_access token. Idempotent: a resend reuses the same token. service_role only.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113110000', 'presale_announcement_list')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1: grants. service_role only, and it must be VOLATILE (it writes).
-- ===========================================================================
SELECT p.oid::regprocedure AS signature,
       p.provolatile AS volatility,   -- expect 'v'
       p.prosecdef   AS security_definer,
       COALESCE((SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
                   FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE'),
                'default (= PUBLIC)') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'presale_announcement_list';

-- ===========================================================================
-- VERIFY 2 (safe, rolls back): run it twice on a real event's registrations
-- and prove the SECOND run returns the SAME tokens. If this prints
-- tokens_changed > 0, a resend would scatter new keys and the function is
-- wrong. Also proves no duplicate rows per person.
-- ===========================================================================
DO $test$
DECLARE
    v_event uuid;
    v_regs  int;
    v_first int; v_second int; v_changed int; v_dupes int;
BEGIN
    SELECT r.event_id, count(*) INTO v_event, v_regs
      FROM event_registrations r
     WHERE r.status::text IN ('approved','auto_approved')
     GROUP BY r.event_id
     ORDER BY count(*) DESC
     LIMIT 1;
    IF v_event IS NULL THEN RAISE EXCEPTION 'NO SAMPLE DATA -- skip'; END IF;

    CREATE TEMP TABLE t1 ON COMMIT DROP AS
        SELECT * FROM public.presale_announcement_list(v_event);
    CREATE TEMP TABLE t2 ON COMMIT DROP AS
        SELECT * FROM public.presale_announcement_list(v_event);

    SELECT count(*) INTO v_first  FROM t1;
    SELECT count(*) INTO v_second FROM t2;
    SELECT count(*) INTO v_changed
      FROM t1 JOIN t2 ON t2.email = t1.email WHERE t2.token <> t1.token;
    SELECT count(*) INTO v_dupes
      FROM (SELECT email FROM t1 GROUP BY email HAVING count(*) > 1) d;

    RAISE EXCEPTION E'TEST_COMPLETE_ROLLING_BACK\n'
        '  approved registrations on the busiest event -> %\n'
        '  recipients, first run                       -> %   (people, not registrations)\n'
        '  recipients, second run                      -> %   (must equal the first)\n'
        '  tokens that CHANGED on the resend           -> %   (MUST BE 0)\n'
        '  people appearing twice in one run           -> %   (MUST BE 0)',
        v_regs, v_first, v_second, v_changed, v_dupes;
END
$test$;
