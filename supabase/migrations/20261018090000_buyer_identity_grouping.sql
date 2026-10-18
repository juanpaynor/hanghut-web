-- Group buyers the way the LINK resolves them, not by email alone.
--
-- THE BUG. The panel grouped by email; `resolve_attendee_detail_token` matches
-- on user_id OR email. Those disagree, and on Back to the Garden the
-- disagreement was a privacy leak:
--
--   Marjorie Payumo (one account) bought 4 tickets and typed a DIFFERENT
--   contact email per booking -- her own, plus her two friends'. The panel
--   therefore showed THREE rows, each claiming "1 of 1 missing". But every one
--   of those three links opens all four slots. Verified on prod: the link
--   issued against arnarisrael@gmail.com returns
--   "Marjorie Payumo | Marjorie Payumo | Israel Arnar | Marie Claire Tiongson".
--
--   So "email everyone" would have sent Israel and Marie Claire a link that
--   reads and edits each other's answers -- on an event collecting medical
--   details. One entry, one link, to Marjorie, is the correct behaviour.
--
-- WHY NOT COALESCE(user_id, email). That was the obvious fix and it is not
-- enough: on the same event 2 emails appear BOTH as a logged-in purchase and as
-- a guest purchase. Keying on the user id when present would put those in two
-- different groups while one link still covers both.
--
-- THE KEY. An email is claimed by the account that ever bought under it, and
-- everything that account touches collapses into one entry:
--
--   buyer_key = COALESCE(user_id, account_that_owns(buyer_email), 'e:'||email)
--
-- No email on prod maps to more than one account (checked: 0 on both events),
-- which is what makes this well defined -- the graph is a forest of stars, not
-- an arbitrary mesh. min() picks deterministically if that ever stops holding,
-- and merging two accounts into one entry is the SAFE direction: one link that
-- covers a superset beats two links that each leak into the other's tickets.
--
-- WHO WE SHOW AND MAIL. The account's own `users.email` -- the person who
-- logged in and paid -- falling back to the earliest contact email for a pure
-- guest group. This is why the fix is not cosmetic: the recipient changes.
--
-- The two functions MUST keep identical grouping. If they drift, the panel
-- shows one token and the email carries another.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The organizer panel.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_missing_details(
    p_event_id uuid,
    p_limit    integer DEFAULT 25,
    p_offset   integer DEFAULT 0,
    p_search   text    DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_partner uuid;
    v_result  jsonb;
    v_limit   integer := least(greatest(COALESCE(p_limit, 25), 1), 200);
    v_offset  integer := greatest(COALESCE(p_offset, 0), 0);
    v_search  text    := nullif(trim(COALESCE(p_search, '')), '');
BEGIN
    SELECT organizer_id INTO v_partner FROM events WHERE id = p_event_id;
    IF v_partner IS NULL THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;

    -- Owner-level, not team-level. These rows carry a link that can edit an
    -- attendee's medical details, so a door scanner must not be handed them.
    -- is_partner_owner is ghost-seat aware, so platform support can still help.
    IF NOT public.is_partner_owner(v_partner) THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    WITH slots AS (
        SELECT t.id,
               t.ticket_number,
               t.guest_name,
               t.created_at,
               t.user_id,
               lower(nullif(trim(COALESCE(t.guest_email, u.email)), '')) AS buyer_email,
               COALESCE(pi.guest_name, u.display_name)                   AS buyer_name,
               pi.id                                                     AS intent_id,
               pi.user_id                                                AS intent_user_id,
               pi.access_token,
               public.ticket_detail_status(t.id)                         AS st
          FROM tickets t
          LEFT JOIN users u             ON u.id  = t.user_id
          LEFT JOIN purchase_intents pi ON pi.id = t.purchase_intent_id
         WHERE t.event_id = p_event_id
           AND t.status::text IN ('valid','used')
    ),
    flagged AS (SELECT *, (st->>'complete')::boolean AS complete FROM slots),
    -- Which account, if any, claims each contact email.
    owner AS (
        SELECT buyer_email, min(user_id::text)::uuid AS acct
          FROM flagged
         WHERE user_id IS NOT NULL AND buyer_email IS NOT NULL
         GROUP BY buyer_email
    ),
    keyed AS (
        SELECT f.*,
               COALESCE(f.user_id, o.acct) AS acct_key
          FROM flagged f
          LEFT JOIN owner o ON o.buyer_email = f.buyer_email
    ),
    buyers AS (
        SELECT COALESCE(acct_key::text, 'e:' || buyer_email) AS buyer_key,
               min(acct_key::text)::uuid                     AS acct_key,
               (array_agg(buyer_email ORDER BY created_at))[1] AS fallback_email,
               (array_agg(buyer_name  ORDER BY created_at))[1] AS fallback_name,
               -- Prefer a token from an intent that carries the user id: that
               -- link covers every ticket the account holds, not just the ones
               -- sharing one contact email.
               (array_agg(intent_id ORDER BY (access_token IS NULL),
                          (intent_user_id IS NULL), access_token::text))[1] AS intent_id,
               (array_agg(access_token::text ORDER BY (access_token IS NULL),
                          (intent_user_id IS NULL), access_token::text))[1] AS token,
               count(*)                             AS slots_total,
               count(*) FILTER (WHERE NOT complete) AS slots_missing,
               count(*) FILTER (WHERE NOT complete
                   AND st->>'answer_source' IN ('rewritten','shared')) AS slots_suspect,
               jsonb_agg(jsonb_build_object(
                   'ticket_number', ticket_number,
                   'attendee_name', guest_name,
                   'answer_source', st->>'answer_source',
                   'missing_count', (st->>'missing_count')::int,
                   'complete',      complete
               ) ORDER BY created_at, ticket_number) AS tickets
          FROM keyed
         WHERE buyer_email IS NOT NULL OR acct_key IS NOT NULL
         GROUP BY COALESCE(acct_key::text, 'e:' || buyer_email)
        HAVING count(*) FILTER (WHERE NOT complete) > 0
    ),
    resolved AS (
        SELECT b.*,
               COALESCE(au.email, b.fallback_email)        AS buyer_email,
               COALESCE(au.display_name, b.fallback_name)  AS buyer_name
          FROM buyers b
          LEFT JOIN users au ON au.id = b.acct_key
    ),
    matched AS (
        SELECT * FROM resolved
         WHERE v_search IS NULL
            OR COALESCE(buyer_email, '') ILIKE '%' || v_search || '%'
            OR COALESCE(buyer_name, '')  ILIKE '%' || v_search || '%'
    ),
    page AS (
        SELECT m.*,
               -- When this buyer was last sent their link for THIS event.
               -- 'failed' is excluded on purpose: a send we never managed to
               -- hand to Resend must not start a 24h cooldown, or one provider
               -- outage locks the organizer out of chasing anyone for a day.
               -- 'bounced' DOES count -- that address is dead.
               (SELECT max(es.created_at)
                  FROM email_sends es
                 WHERE es.kind = 'attendee_details'
                   AND es.purchase_intent_id = m.intent_id
                   AND lower(es.recipient) = lower(m.buyer_email)
                   AND COALESCE(es.status, '') <> 'failed') AS last_emailed_at
          FROM matched m
         ORDER BY (m.slots_suspect > 0) DESC, m.slots_missing DESC, m.buyer_email
         LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_build_object(
        'event', (SELECT jsonb_build_object('id', e.id, 'title', e.title,
                                            'start_datetime', e.start_datetime)
                    FROM events e WHERE e.id = p_event_id),
        'tickets_total',  (SELECT count(*) FROM flagged),
        'missing_total',  (SELECT count(*) FROM flagged WHERE NOT complete),
        'buyers_total',   (SELECT count(*) FROM resolved),
        -- A ticket with no purchase_intent (box office, offline, kiosk) has no
        -- link to hand out. Counted, but reported separately so the organizer
        -- is not left wondering why the numbers disagree.
        'no_link_total',  (SELECT count(*) FROM flagged
                            WHERE NOT complete AND access_token IS NULL),
        -- buyers_matched is the search-filtered count the pager counts through;
        -- buyers_total stays whole-event so the headline does not move as you
        -- type in the search box.
        'buyers_matched', (SELECT count(*) FROM matched),
        'limit',          v_limit,
        'offset',         v_offset,
        'search',         v_search,
        'buyers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'email',           buyer_email,
                       'name',            buyer_name,
                       'token',           token,
                       'intent_id',       intent_id,
                       'slots_total',     slots_total,
                       'slots_missing',   slots_missing,
                       'slots_suspect',   slots_suspect,
                       'last_emailed_at', last_emailed_at,
                       'tickets',         tickets
                   ) ORDER BY (slots_suspect > 0) DESC, slots_missing DESC, buyer_email)
              FROM page
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The send claim. Grouping below must stay byte-for-byte equivalent to the
--    block above, or the panel shows one token and the email carries another.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_attendee_detail_emails(
    p_event_id       uuid,
    p_emails         text[]  DEFAULT NULL,
    p_cooldown_hours integer DEFAULT 24,
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
      INTO v_event FROM events e WHERE e.id = p_event_id;

    IF v_event.id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    v_partner := v_event.organizer_id;

    IF NOT public.is_partner_owner(v_partner) THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    WITH slots AS (
        SELECT t.id,
               t.created_at,
               t.user_id,
               lower(nullif(trim(COALESCE(t.guest_email, u.email)), '')) AS buyer_email,
               COALESCE(pi.guest_name, u.display_name)                   AS buyer_name,
               pi.id                                                     AS intent_id,
               pi.user_id                                                AS intent_user_id,
               pi.access_token,
               public.ticket_detail_status(t.id)                         AS st
          FROM tickets t
          LEFT JOIN users u             ON u.id  = t.user_id
          LEFT JOIN purchase_intents pi ON pi.id = t.purchase_intent_id
         WHERE t.event_id = p_event_id
           AND t.status::text IN ('valid','used')
    ),
    flagged AS (SELECT *, (st->>'complete')::boolean AS complete FROM slots),
    owner AS (
        SELECT buyer_email, min(user_id::text)::uuid AS acct
          FROM flagged
         WHERE user_id IS NOT NULL AND buyer_email IS NOT NULL
         GROUP BY buyer_email
    ),
    keyed AS (
        SELECT f.*, COALESCE(f.user_id, o.acct) AS acct_key
          FROM flagged f LEFT JOIN owner o ON o.buyer_email = f.buyer_email
    ),
    buyers AS (
        SELECT COALESCE(acct_key::text, 'e:' || buyer_email) AS buyer_key,
               min(acct_key::text)::uuid                     AS acct_key,
               (array_agg(buyer_email ORDER BY created_at))[1] AS fallback_email,
               (array_agg(buyer_name  ORDER BY created_at))[1] AS fallback_name,
               (array_agg(intent_id ORDER BY (access_token IS NULL),
                          (intent_user_id IS NULL), access_token::text))[1] AS intent_id,
               (array_agg(access_token::text ORDER BY (access_token IS NULL),
                          (intent_user_id IS NULL), access_token::text))[1] AS token,
               count(*) FILTER (WHERE NOT complete) AS slots_missing
          FROM keyed
         WHERE buyer_email IS NOT NULL OR acct_key IS NOT NULL
         GROUP BY COALESCE(acct_key::text, 'e:' || buyer_email)
        HAVING count(*) FILTER (WHERE NOT complete) > 0
    ),
    resolved AS (
        SELECT b.*,
               lower(COALESCE(au.email, b.fallback_email))  AS buyer_email,
               COALESCE(au.display_name, b.fallback_name)   AS buyer_name
          FROM buyers b LEFT JOIN users au ON au.id = b.acct_key
    ),
    cand AS (
        SELECT r.*,
               CASE
                   WHEN r.token IS NULL OR r.buyer_email IS NULL THEN 'no_link'
                   WHEN EXISTS (SELECT 1 FROM email_suppressions s
                                 WHERE lower(s.email) = r.buyer_email
                                   AND s.reason = 'bounce')          THEN 'bounced'
                   WHEN EXISTS (SELECT 1 FROM email_sends es
                                 WHERE es.kind = 'attendee_details'
                                   AND es.purchase_intent_id = r.intent_id
                                   AND lower(es.recipient) = r.buyer_email
                                   AND COALESCE(es.status,'') <> 'failed'
                                   AND es.created_at > now() - v_cooldown) THEN 'cooldown'
                   ELSE NULL
               END AS skip_reason
          FROM resolved r
         WHERE p_emails IS NULL
            OR r.buyer_email = ANY (SELECT lower(trim(x)) FROM unnest(p_emails) x)
    ),
    -- Reserve the sendable ones BEFORE Resend is called. That is what makes the
    -- cooldown real: a double-click, or two staff on the same event, claim
    -- nothing the second time.
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
              -- LEFT JOIN, not JOIN: on a dry run `ins` is empty and the
              -- eligible buyers must still come back (with a null send_id) so
              -- the confirm dialog can count and name them.
              FROM cand c LEFT JOIN ins i ON i.recipient = c.buyer_email
             WHERE c.skip_reason IS NULL), '[]'::jsonb),
        'skipped', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('email', buyer_email,
                                                'reason', skip_reason))
              FROM cand WHERE skip_reason IS NOT NULL), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

-- PUBLIC and anon are separate grants and neither implies the other. CREATE OR
-- REPLACE keeps the existing ACL, but re-stating it costs nothing and means
-- this file is correct run on its own.
REVOKE ALL ON FUNCTION public.get_event_missing_details(uuid, integer, integer, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_missing_details(uuid, integer, integer, text)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_attendee_detail_emails(uuid, text[], integer, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_attendee_detail_emails(uuid, text[], integer, boolean)
    TO authenticated, service_role;

COMMIT;
