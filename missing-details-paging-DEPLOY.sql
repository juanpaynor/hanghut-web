-- DEPLOY: paging/sort/search for get_event_missing_details
-- Run this whole file in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
-- It is one transaction: the function is never absent, and a failure rolls back.
--
-- Nothing live calls this yet (the panel is still unpushed), so there is no
-- window to worry about. Rollback, if ever needed, is attendee-link-ROLLBACK
-- style: re-run migration 20261017140759 to restore the 2-arg version.

BEGIN;

-- Paging, sorting and search for the organizer's missing-details panel, plus
-- the two fields the "send their link" action needs.
--
-- WHY: the first version returned every buyer in one payload. Measured on Back
-- to the Garden that is 182 buyer rows, 522 slot rows and 100 kB -- on every
-- open of the Attendees tab -- and 182 expandable rows is not a list anyone
-- reads. Sinadya's 3 buyers hid all of this.
--
-- Totals stay whole-event while the list pages. This is the part that is easy
-- to get wrong: "519 missing across 182 bookings" cannot be derived from a page
-- of 25, so tickets_total / missing_total / buyers_total / no_link_total are
-- still computed over every ticket on the event, and only `buyers` is sliced.
--
-- SORT: buyers whose answers are SUSPECT come first -- `rewritten` (a later
-- booking overwrote them, so they may describe someone else) and `shared` (one
-- set covering several tickets). Those are worse than a plain blank, because
-- the organizer holds data that looks complete and names the wrong person. The
-- old order was "earliest order first", which is meaningless for a chase list.
--
-- KNOWN LIMIT: totals require ticket_detail_status() over every ticket on the
-- event, so a page turn costs the same scan as the first load. At 937 tickets
-- that is well inside an interactive budget. An event an order of magnitude
-- larger would want the status denormalised onto tickets and maintained by
-- trigger; deliberately not doing that yet rather than guessing at the shape.


-- The old 2-arg signature has to go, not just get overloaded: a call passing
-- (uuid, integer) would keep resolving to it and silently skip every change
-- below.
DROP FUNCTION IF EXISTS public.get_event_missing_details(uuid, integer);

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
    flagged AS (
        SELECT *, (st->>'complete')::boolean AS complete FROM slots
    ),
    buyers AS (
        SELECT buyer_email,
               -- The name on their EARLIEST order. min() would pick
               -- alphabetically and label Matt Collado's group "Erica Delos
               -- Santos", which reads as though the wrong person bought it.
               (array_agg(buyer_name ORDER BY created_at))[1]   AS buyer_name,
               -- Any of this buyer's tokens opens all their slots, so the
               -- choice is arbitrary -- but it must be DETERMINISTIC and the
               -- intent must be the one that token belongs to, because the send
               -- action records that intent id and the cooldown reads it back.
               -- Ordering both by the same key is what keeps them in step.
               (array_agg(intent_id ORDER BY access_token::text
                          NULLS LAST))[1]                       AS intent_id,
               (array_agg(access_token::text ORDER BY access_token::text
                          NULLS LAST))[1]                       AS token,
               count(*)                                         AS slots_total,
               count(*) FILTER (WHERE NOT complete)             AS slots_missing,
               count(*) FILTER (WHERE NOT complete
                   AND st->>'answer_source' IN ('rewritten','shared'))
                                                                AS slots_suspect,
               jsonb_agg(jsonb_build_object(
                   'ticket_number', ticket_number,
                   'attendee_name', guest_name,
                   'answer_source', st->>'answer_source',
                   'missing_count', (st->>'missing_count')::int,
                   'complete',      complete
               ) ORDER BY created_at, ticket_number)            AS tickets
          FROM flagged
         WHERE buyer_email IS NOT NULL
         GROUP BY buyer_email
        HAVING count(*) FILTER (WHERE NOT complete) > 0
    ),
    matched AS (
        SELECT * FROM buyers
         WHERE v_search IS NULL
            OR buyer_email ILIKE '%' || v_search || '%'
            OR COALESCE(buyer_name, '') ILIKE '%' || v_search || '%'
    ),
    page AS (
        SELECT m.*,
               -- When this buyer was last sent their link for THIS event.
               -- Keyed on the representative intent above, which is why that
               -- choice has to be stable. Any row counts as an attempt,
               -- including one that later bounced: a bounce is a reason to
               -- chase another way, not to re-send the same dead address.
               (SELECT max(es.created_at)
                  FROM email_sends es
                 WHERE es.kind = 'attendee_details'
                   AND es.purchase_intent_id = m.intent_id
                   AND lower(es.recipient) = m.buyer_email
                   -- 'failed' is excluded on purpose. A send we never managed
                   -- to hand to Resend must not start a 24h cooldown, or one
                   -- provider outage locks the organizer out of chasing anyone
                   -- for a day. 'bounced' DOES count: that address is dead and
                   -- re-sending to it is pointless.
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
        'buyers_total',   (SELECT count(*) FROM buyers),
        -- A ticket with no purchase_intent (box office, offline, kiosk) has no
        -- link to hand out. Counted, but reported separately so the organizer
        -- is not left wondering why the numbers disagree.
        'no_link_total',  (SELECT count(*) FROM flagged
                            WHERE NOT complete AND access_token IS NULL),
        -- Paging metadata. buyers_matched is the search-filtered count, which
        -- is what the pager counts through; buyers_total stays whole-event so
        -- the headline never changes as you type in the search box.
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

-- Authenticated only. Never anon: the payload contains buyer emails and the
-- tokens that open their tickets.
--
-- PUBLIC and anon both have to be revoked, and neither implies the other.
-- Supabase sets `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon,
-- authenticated, service_role`, so a new function starts out anon-executable;
-- REVOKE FROM PUBLIC leaves the role's own grant, and REVOKE FROM anon leaves
-- PUBLIC's. Both, every time -- this feature has now been bitten in each
-- direction. The in-function is_partner_owner() check does refuse anon on its
-- own, but a payload of buyer emails and ticket-editing tokens should not rest
-- on a single check.
REVOKE ALL ON FUNCTION public.get_event_missing_details(uuid, integer, integer, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_missing_details(uuid, integer, integer, text)
    TO authenticated, service_role;


-- Ledger row, so the CLI does not later think this migration is pending.
-- (Prod's ledger is squashed; never `supabase db push` against it.)
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261017170000', 'missing_details_paging')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run after the COMMIT; expect exactly one row, anon absent)
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       (SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
          FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'get_event_missing_details';
