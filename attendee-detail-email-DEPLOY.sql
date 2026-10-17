-- DEPLOY: attendee-detail email send (claim + finalize RPCs)
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- Run missing-details-paging-DEPLOY.sql FIRST -- this file assumes the paged
-- get_event_missing_details is in place (the panel reads last_emailed_at from
-- it, and only the paged version returns that).
--
-- Both functions are new, so there is nothing to roll back TO. Rollback is:
--   DROP FUNCTION public.claim_attendee_detail_emails(uuid, text[], integer, boolean);
--   DROP FUNCTION public.finalize_attendee_detail_sends(jsonb);
-- Neither destroys rows -- claim only INSERTs into email_sends.

BEGIN;
-- "Send their link" — the organizer-side chase, as two RPCs.
--
-- The caller never names recipients. They name an EVENT (optionally narrowed to
-- specific buyer emails for a single-row nudge) and this decides, as the user,
-- who is eligible and what each one's link is. Same posture as get-sent-email:
-- a client-supplied recipient list would turn an organizer tool into a way to
-- mail arbitrary addresses a valid detail-editing token.
--
-- CLAIM-THEN-SEND. The email_sends rows are written BEFORE Resend is called,
-- with status 'queued'. That is what makes the cooldown real: an organizer who
-- double-clicks, or two staff on the same event, hit rows that already exist
-- and claim nothing. Sending first and recording after would mail everyone
-- twice in exactly the situation people actually produce.
--
-- Not the campaign path, on purpose. Routing this through email_campaigns /
-- email_send_queue would (a) create a campaign row that shows in the
-- organizer's dashboard as though they had sent a marketing blast, (b) append
-- an unsubscribe footer to a message about the buyer's own order, and (c)
-- silently drop anyone who unsubscribed from marketing -- on Back to the Garden
-- that is 2 buyers whose emergency contact is missing for a physical race.
-- Marketing consent is the wrong gate for this message. Hard BOUNCES are the
-- right gate, and those are honoured below.


-- ---------------------------------------------------------------------------
-- 1. Claim: decide who to mail, reserve them, hand back their links.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_attendee_detail_emails(
    p_event_id       uuid,
    p_emails         text[]  DEFAULT NULL,
    p_cooldown_hours integer DEFAULT 24,
    -- Preview mode: works out exactly who would be mailed and who would be
    -- skipped, and claims nobody. The confirm dialog needs this -- promising
    -- the organiser an itemised "4 skipped, their email bounced" and then
    -- discovering it only after the send is the wrong order.
    p_dry_run        boolean DEFAULT false
) RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_partner  uuid;
    v_event    record;
    v_cooldown interval := make_interval(hours => greatest(COALESCE(p_cooldown_hours, 24), 0));
    v_result   jsonb;
BEGIN
    SELECT e.id, e.title, e.organizer_id, e.start_datetime
      INTO v_event
      FROM events e WHERE e.id = p_event_id;

    IF v_event.id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    v_partner := v_event.organizer_id;

    -- Owner-level, like the panel that launches it. Sending mail in the
    -- organizer's name is not something a door scanner should be able to do.
    IF NOT public.is_partner_owner(v_partner) THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    -- One statement, no temp table: a temp table with ON COMMIT DROP would
    -- collide if this function ran twice inside one transaction. The candidate
    -- set is a CTE, and `ins` joins back to it by RETURNING.
    WITH slots AS (
        SELECT t.id,
               t.created_at,
               lower(nullif(trim(COALESCE(t.guest_email, u.email)), '')) AS buyer_email,
               COALESCE(pi.guest_name, u.display_name)                   AS buyer_name,
               pi.id                                                     AS intent_id,
               pi.access_token,
               public.ticket_detail_status(t.id)                         AS st
          FROM tickets t
          LEFT JOIN users u             ON u.id  = t.user_id
          LEFT JOIN purchase_intents pi ON pi.id = t.purchase_intent_id
         WHERE t.event_id = p_event_id
           AND t.status::text IN ('valid','used')
    ),
    flagged AS (SELECT *, (st->>'complete')::boolean AS complete FROM slots),
    buyers AS (
        SELECT buyer_email,
               (array_agg(buyer_name ORDER BY created_at))[1] AS buyer_name,
               -- Must match get_event_missing_details exactly, or the panel
               -- shows one token and the email carries another.
               (array_agg(intent_id    ORDER BY access_token::text NULLS LAST))[1] AS intent_id,
               (array_agg(access_token::text ORDER BY access_token::text NULLS LAST))[1] AS token,
               count(*) FILTER (WHERE NOT complete) AS slots_missing
          FROM flagged
         WHERE buyer_email IS NOT NULL
         GROUP BY buyer_email
        HAVING count(*) FILTER (WHERE NOT complete) > 0
    ),
    cand AS (
        SELECT b.*,
               CASE
                   WHEN b.token IS NULL THEN 'no_link'
                   WHEN EXISTS (SELECT 1 FROM email_suppressions s
                                 WHERE lower(s.email) = b.buyer_email
                                   AND s.reason = 'bounce')          THEN 'bounced'
                   WHEN EXISTS (SELECT 1 FROM email_sends es
                                 WHERE es.kind = 'attendee_details'
                                   AND es.purchase_intent_id = b.intent_id
                                   AND lower(es.recipient) = b.buyer_email
                                   AND COALESCE(es.status,'') <> 'failed'
                                   AND es.created_at > now() - v_cooldown) THEN 'cooldown'
                   ELSE NULL
               END AS skip_reason
          FROM buyers b
         WHERE p_emails IS NULL
            OR b.buyer_email = ANY (SELECT lower(trim(x)) FROM unnest(p_emails) x)
    ),
    -- Reserve the sendable ones. status 'queued' until the edge function
    -- stamps the Resend id; a row that never gets stamped is visible as stuck
    -- rather than invisible as never-attempted.
    ins AS (
        INSERT INTO email_sends (partner_id, recipient, kind, purchase_intent_id,
                                 subject, status)
        SELECT v_partner, buyer_email, 'attendee_details', intent_id,
               'Please complete attendee details for ' || v_event.title, 'queued'
          FROM cand WHERE skip_reason IS NULL AND NOT p_dry_run
        RETURNING id, recipient
    )
    SELECT jsonb_build_object(
        'dry_run', p_dry_run,
        'event', jsonb_build_object('id', v_event.id, 'title', v_event.title,
                                    'start_datetime', v_event.start_datetime),
        'organizer', (SELECT jsonb_build_object(
                                 'name',     p.business_name,
                                 'reply_to', COALESCE(p.contact_person_email,
                                                      p.work_email, ou.email))
                        FROM partners p
                        LEFT JOIN users ou ON ou.id = p.user_id
                       WHERE p.id = v_partner),
        'recipients', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'send_id',       i.id,
                       'email',         c.buyer_email,
                       'name',          c.buyer_name,
                       'token',         c.token,
                       'slots_missing', c.slots_missing))
              -- LEFT JOIN, not JOIN: on a dry run `ins` is empty, and the
              -- eligible buyers must still come back (with a null send_id) so
              -- the dialog can count and name them.
              FROM cand c LEFT JOIN ins i ON i.recipient = c.buyer_email
             WHERE c.skip_reason IS NULL), '[]'::jsonb),
        -- Reported, not swallowed. An organizer who sends and then hears
        -- nothing from four people needs to know those four were never
        -- reachable, or they will assume it landed.
        'skipped', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('email', buyer_email,
                                                'reason', skip_reason))
              FROM cand WHERE skip_reason IS NOT NULL), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Finalize: stamp each claimed row with what Resend said.
-- ---------------------------------------------------------------------------
-- Takes [{send_id, resend_id, status}]. Scoped by ownership, so a caller
-- cannot stamp rows belonging to someone else's partner, and restricted to
-- kind='attendee_details' so it can never touch campaign or ticket accounting.
CREATE OR REPLACE FUNCTION public.finalize_attendee_detail_sends(
    p_updates jsonb
) RETURNS integer
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_count integer := 0;
BEGIN
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
        RETURN 0;
    END IF;

    WITH upd AS (
        SELECT (x->>'send_id')::uuid   AS send_id,
               nullif(x->>'resend_id','') AS resend_id,
               COALESCE(nullif(x->>'status',''), 'sent') AS status
          FROM jsonb_array_elements(p_updates) x
    ),
    done AS (
        UPDATE email_sends es
           SET resend_id = u.resend_id,
               status    = u.status
          FROM upd u
         WHERE es.id = u.send_id
           AND es.kind = 'attendee_details'
           AND public.is_partner_owner(es.partner_id)
           AND u.status IN ('sent','failed')
        RETURNING es.id
    )
    SELECT count(*) INTO v_count FROM done;

    RETURN v_count;
END;
$fn$;

-- Both are organizer actions reached through an edge function carrying the
-- user's JWT. anon must never hold EXECUTE: claim_ hands back live
-- detail-editing tokens for every buyer on an event. PUBLIC and anon are
-- separate grants and neither implies the other -- revoke both.
REVOKE ALL ON FUNCTION public.claim_attendee_detail_emails(uuid, text[], integer, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_attendee_detail_emails(uuid, text[], integer, boolean)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_attendee_detail_sends(jsonb)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_attendee_detail_sends(jsonb)
    TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261017180000', 'attendee_detail_email_send')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (after COMMIT). Expect both functions, each granted to
-- authenticated + service_role only -- no anon, no '-' (which is PUBLIC).
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       (SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
          FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('claim_attendee_detail_emails','finalize_attendee_detail_sends')
 ORDER BY p.proname;

-- DRY RUN (safe -- claims nobody, because it rolls back).
-- Swap in your event id. Expect a recipients count, a skipped count, and
-- 'queued' rows that vanish on the ROLLBACK.
--
-- BEGIN;
--   SELECT jsonb_array_length(j->'recipients') AS will_send,
--          jsonb_array_length(j->'skipped')    AS skipped
--     FROM (SELECT public.claim_attendee_detail_emails('<EVENT-UUID>'::uuid) AS j) q;
--   SELECT count(*) AS rows_claimed FROM email_sends WHERE kind = 'attendee_details';
-- ROLLBACK;
