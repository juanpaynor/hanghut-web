-- DEPLOY: pre-registration / presale (opt-in per event)  -- PHASE 1 of 5
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- Adds three nullable columns, two bookkeeping columns, one table and one
-- function. **Nothing changes for any of the 454 live events** until an
-- organizer sets presale_starts_at, so this is safe to run well ahead of the
-- edge function and the frontend.
--
-- ORDER (see the plan; the order is not optional):
--   0. GA fix 1a + 1b, PROVEN          <-- prerequisite, see "WHY 0 COMES FIRST"
--   1. this file                       <-- inert
--   2. supabase functions deploy create-purchase-intent   <-- enforces it
--   3. push the frontend               <-- organizer dates + buyer states
--   4. the on-sale email
-- Running 1 alone does nothing visible. Running 3 before 2 would show an
-- organizer a date that nothing enforces -- which is exactly what
-- subscriber_early_access_hours already is on this platform: a window checked
-- only in the page's JSX, read by nothing in create-purchase-intent, and
-- therefore bypassable by the app, the embed, the public API or curl. Do not
-- add a second one.
--
-- WHY 0 COMES FIRST. Measured on prod 2026-11-12:
--     reserved tickets: 2, of which 0 carry a tier_id
--     ticket_tiers_check1  CHECK (quantity_sold <= quantity_total)
-- In-flight checkouts carry no tier, so update_tier_quantity_sold cannot see
-- them, so the gate in create-purchase-intent (quantity_sold + quantity >
-- quantity_total, no lock, no transaction) is blind to every checkout in
-- progress. The CHECK then holds at issue_tickets -- which means the failure is
-- not an oversell, it is MONEY TAKEN AND NO TICKET ISSUED. A presale exists to
-- put hundreds of buyers on one timestamp, so this feature manufactures exactly
-- the conditions that bug needs. Do not switch a presale on for a real event
-- until 1a/1b are live and proven with 20 parallel calls on a throwaway event.
--
-- ROLLBACK: there is a kill switch that needs no deploy at all --
--     UPDATE public.events SET presale_starts_at = NULL;
-- check_presale_access returns {enforced:false} for any event without it, so
-- every gate becomes a no-op immediately. Full undo if you want the schema gone:
--     DROP FUNCTION public.check_presale_access(uuid, uuid, text, uuid);
--     DROP TABLE public.event_presale_access;
--     ALTER TABLE public.events
--       DROP COLUMN presale_starts_at, DROP COLUMN public_sale_starts_at,
--       DROP COLUMN presale_registration_closes_at,
--       DROP COLUMN presale_notified_at, DROP COLUMN presale_notice_campaign_id;

BEGIN;

-- events is read by every public page load. ADD COLUMN of a nullable column
-- with no default is catalogue-only on PG 17, but it still takes ACCESS
-- EXCLUSIVE, and anything mid-read queues behind it. Three seconds, then give
-- up and try again rather than hold the site.
SET LOCAL lock_timeout = '3s';


-- ===========================================================================
-- 1. THE WINDOW
-- ===========================================================================
--
-- Three timestamps express both shapes the organizer can choose between, with
-- no second on/off switch to drift out of sync:
--
--   presale_starts_at NULL                     -> feature off. Today's behaviour.
--   presale_starts_at set, public NULL         -> CLOSED PRESALE. Only the list,
--                                                 until the organizer says otherwise.
--   presale_starts_at set, public set          -> EARLY WINDOW, then open to all.
--
-- There is deliberately no event-level "sales start" separate from this. The
-- platform has sales_end_datetime and has never had a start; adding two
-- different starts would guarantee they disagree.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS presale_starts_at              timestamptz,
    ADD COLUMN IF NOT EXISTS public_sale_starts_at          timestamptz,
    ADD COLUMN IF NOT EXISTS presale_registration_closes_at timestamptz,
    -- Phase 5 bookkeeping, added here so the on-sale email does not cost a
    -- second ACCESS EXCLUSIVE lock on this table later.
    ADD COLUMN IF NOT EXISTS presale_notified_at            timestamptz,
    ADD COLUMN IF NOT EXISTS presale_notice_campaign_id     uuid;

COMMENT ON COLUMN public.events.presale_starts_at IS
    'Pre-registrants may buy from this moment. NULL = no presale, and check_presale_access is a no-op. Enforced in create-purchase-intent; clearing this column is the kill switch and needs no deploy.';
COMMENT ON COLUMN public.events.public_sale_starts_at IS
    'Everyone may buy from this moment. NULL = closed presale: the list only, until the organizer sets a date.';
COMMENT ON COLUMN public.events.presale_registration_closes_at IS
    'The pre-registration list stops accepting NEW people at this moment. NULL = stays open, and a latecomer can join and buy immediately. Existing registrants are never affected.';
COMMENT ON COLUMN public.events.presale_notified_at IS
    'When the on-sale announcement last went out. Drives the resend cooldown; email_sends UNIQUE(campaign_id,recipient) does NOT dedupe across two separate sends.';
COMMENT ON COLUMN public.events.presale_notice_campaign_id IS
    'The email_campaigns row scheduled for, or created by, the on-sale announcement.';

-- Each arm is guarded by its own IS NULL, so the expression is never NULL and
-- the constraint cannot pass by accident. (A CHECK accepts a row when its
-- expression is NULL, not only when it is TRUE -- that hole shipped once
-- already on event_sections.label_offset.)
ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_public_sale_after_presale;
ALTER TABLE public.events
    ADD CONSTRAINT events_public_sale_after_presale CHECK (
        public_sale_starts_at IS NULL
        OR presale_starts_at IS NULL
        OR public_sale_starts_at >= presale_starts_at
    );

ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_presale_registration_close_sane;
ALTER TABLE public.events
    ADD CONSTRAINT events_presale_registration_close_sane CHECK (
        presale_registration_closes_at IS NULL
        OR presale_starts_at IS NULL
        OR presale_registration_closes_at >= presale_starts_at
    );


-- ===========================================================================
-- 2. THE EMAIL LINK TOKEN
-- ===========================================================================
--
-- WHY THIS IS NOT THE REGISTRATION ID.
--
-- get_registration_for_resume(registration_id, event_id) is granted to anon and
-- returns guest_email, guest_name and EVERY ANSWER on the registration -- phone
-- number, emergency contact, whatever the organizer asked. That is correct for
-- a resume link the person's own browser stored. Putting the same id in an
-- email turns it into a forwardable key to a stranger's personal data: mail
-- gets forwarded, shared inboxes exist, and the token outlives the moment.
--
-- So the on-sale link carries this instead. It unlocks the PURCHASE GATE and
-- nothing else. check_presale_access returns allow/deny and never personal
-- data, so a forwarded link costs you a ticket sale to the wrong person -- not
-- somebody's phone number.
--
-- HONEST LIMIT: this is a bearer token. Possession is not identity, and we
-- cannot make a link in an email prove who clicked it. The platform already
-- lives with this -- respondToEventInvite accepts a bare invite token with no
-- auth at all -- but it should be a decision, not an accident. An emailed
-- one-time code is the real fix and is deliberately deferred.

CREATE TABLE IF NOT EXISTS public.event_presale_access (
    token           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    registration_id uuid NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
    -- Snapshotted so a token cannot be made to resolve to a different person by
    -- editing the registration it points at.
    email           text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz,
    used_count      integer NOT NULL DEFAULT 0
);

-- One live token per registration: re-sending the announcement must reuse the
-- same link, not scatter a new valid key into every inbox it has ever reached.
CREATE UNIQUE INDEX IF NOT EXISTS event_presale_access_one_per_registration
    ON public.event_presale_access (registration_id);
CREATE INDEX IF NOT EXISTS event_presale_access_event_idx
    ON public.event_presale_access (event_id);

-- RLS on with NO policies: the table is unreadable to anon and authenticated by
-- any route. The only way to use a token is to hand it to check_presale_access,
-- which runs as service_role and answers yes or no. Table-level grants are
-- revoked as well, because RLS does not gate TRUNCATE -- the hole that left
-- promo_codes truncatable by anon.
ALTER TABLE public.event_presale_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_presale_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.event_presale_access TO service_role;

COMMENT ON TABLE public.event_presale_access IS
    'Bearer token mailed with the on-sale announcement. Unlocks the presale purchase gate for one registration and returns no personal data. Deliberately NOT the registration id, which resume exposes answers for.';


-- ===========================================================================
-- 3. THE GATE
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
    v_on_list    boolean := false;
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

    -- (a) Nobody at all, not even the list, before the presale opens.
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

    -- (c) Inside the presale window. Is this person on the list?
    --
    -- ⚠ 'auto_approved' MUST be accepted. A pre-registrant on an event without
    -- require_approval is seeded auto_approved by submit_event_request, never
    -- 'approved'. create-purchase-intent's approval gate tests
    -- `status !== 'approved'`, which is right THERE and would refuse every
    -- single pre-registrant if copied here.
    --
    -- ⚠ The matching is deliberately WIDER than event_registration_eligibility.
    -- That function requires r.user_id IS NULL before it will match a guest on
    -- email, which is correct for deciding whose submission an order attaches
    -- to. For "is this person on the list" it is wrong: pre-register logged in,
    -- come back as a guest, and you would be refused your own place. Here any
    -- of the three identities matches.
    SELECT EXISTS (
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
    ) INTO v_on_list;

    -- (d) Or holding a link we mailed. Scoped to this event and this token's
    -- own registration, so a token from another event resolves to nothing.
    IF NOT v_on_list AND p_access_token IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM event_presale_access a
              JOIN event_registrations r ON r.id = a.registration_id
             WHERE a.token = p_access_token
               AND a.event_id = p_event_id
               AND r.event_id = p_event_id
               AND (a.expires_at IS NULL OR a.expires_at > now())
               AND r.status::text IN ('approved', 'auto_approved')
        ) INTO v_on_list;
    END IF;

    IF v_on_list THEN
        RETURN jsonb_build_object('enforced', true, 'blocked', false);
    END IF;

    RETURN jsonb_build_object(
        'enforced', true, 'blocked', true,
        'code', 'PRESALE_REGISTRATION_REQUIRED',
        'message', 'Tickets are open to people who pre-registered. Use the link in your email, or the address you signed up with.');
END;
$fn$;

-- "Is this person on the guest list?" is an enumeration oracle. Locked to
-- service_role for the same reason check_one_ticket_per_email is -- and
-- unlike is_email_invited, which is granted to anon today and answers exactly
-- that question for every private event on the platform.
-- PUBLIC and anon are independent grants; revoking one leaves the other.
REVOKE ALL ON FUNCTION public.check_presale_access(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_presale_access(uuid, uuid, text, uuid)
    TO service_role;

COMMENT ON FUNCTION public.check_presale_access(uuid, uuid, text, uuid) IS
    'Presale purchase gate. {enforced,blocked,code,message,opens_at}. Returns enforced=false for any event without presale_starts_at. Accepts approved AND auto_approved. service_role only: it answers "is this person on the list".';


INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261112100000', 'event_presale_window')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1: columns and constraints exist, and NOT ONE live event is affected.
-- Expect presale_on = 0.
-- ===========================================================================
SELECT count(*) AS events_total,
       count(*) FILTER (WHERE presale_starts_at IS NOT NULL) AS presale_on,
       count(*) FILTER (WHERE public_sale_starts_at IS NOT NULL) AS public_date_set
  FROM public.events;

SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.events'::regclass
   AND conname IN ('events_public_sale_after_presale',
                   'events_presale_registration_close_sane');

-- ===========================================================================
-- VERIFY 2: the gate is a no-op everywhere. Every row must read
-- {"blocked": false, "enforced": false}.
-- ===========================================================================
SELECT e.id, e.title,
       public.check_presale_access(e.id, NULL, 'nobody@example.com', NULL) AS verdict
  FROM public.events e
 WHERE e.status IN ('active', 'hidden')
 ORDER BY e.created_at DESC
 LIMIT 5;

-- ===========================================================================
-- VERIFY 3: grants. service_role ONLY -- no anon, no authenticated, and no '-'
-- (which IS public). Compare against check_one_ticket_per_email, which is the
-- posture being copied, and is_email_invited, which is the mistake being avoided.
-- ===========================================================================
SELECT p.oid::regprocedure AS signature,
       COALESCE((SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
                   FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE'),
                'default (= PUBLIC)') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('check_presale_access', 'check_one_ticket_per_email', 'is_email_invited')
 ORDER BY p.proname;

-- ===========================================================================
-- VERIFY 4: the token table is sealed. RLS on, zero policies, and no table
-- grant to anon or authenticated.
-- ===========================================================================
SELECT c.relname, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies pol
         WHERE pol.schemaname = 'public' AND pol.tablename = c.relname) AS policies,
       COALESCE((SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
                   FROM aclexplode(c.relacl) ae), 'none') AS table_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'event_presale_access';

-- ===========================================================================
-- VERIFY 5 (safe, rolls back): the gate actually gates. Picks any event with a
-- cleared registration, switches a presale on in a transaction, checks all four
-- states, and throws so nothing is kept.
-- ===========================================================================
DO $test$
DECLARE
    v_event uuid;
    v_email text;
    v_before jsonb; v_future jsonb; v_listed jsonb; v_stranger jsonb; v_public jsonb;
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

    IF v_event IS NULL THEN RAISE EXCEPTION 'NO SAMPLE DATA -- skip this block'; END IF;

    v_before := public.check_presale_access(v_event, NULL, v_email, NULL);

    UPDATE events SET presale_starts_at = now() + interval '1 day' WHERE id = v_event;
    v_future := public.check_presale_access(v_event, NULL, v_email, NULL);

    UPDATE events SET presale_starts_at = now() - interval '1 hour' WHERE id = v_event;
    v_listed   := public.check_presale_access(v_event, NULL, v_email, NULL);
    v_stranger := public.check_presale_access(v_event, NULL, 'stranger@example.com', NULL);

    UPDATE events SET public_sale_starts_at = now() - interval '1 minute' WHERE id = v_event;
    v_public := public.check_presale_access(v_event, NULL, 'stranger@example.com', NULL);

    RAISE EXCEPTION E'TEST_COMPLETE_ROLLING_BACK\n'
        '  no presale configured     -> %  (want enforced:false)\n'
        '  presale in the future     -> %  (want EVENT_NOT_YET_ON_SALE)\n'
        '  on the list, presale open -> %  (want blocked:false)   <-- the auto_approved trap\n'
        '  not on the list           -> %  (want PRESALE_REGISTRATION_REQUIRED)\n'
        '  public sale open          -> %  (want blocked:false)',
        v_before, v_future, v_listed, v_stranger, v_public;
END
$test$;
