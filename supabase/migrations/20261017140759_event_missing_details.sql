-- Organizer view: which attendees are missing their own details, and the link
-- to collect them.
--
-- Until now this only existed as ad-hoc SQL I ran by hand, which does not scale
-- past a handful of buyers and leaves the organizer unable to act at all.
--
-- One call per event rather than one per ticket: ticket_detail_status() is
-- cheap individually but an event with 937 tickets would otherwise be 937 round
-- trips from the dashboard.
--
-- A buyer appears once, with ONE link, because the link is buyer-scoped — it
-- opens every ticket that buyer holds on this event regardless of how many
-- separate orders they placed. Which of their access_tokens we hand back is
-- therefore arbitrary, so it is deterministic (min) rather than random.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_event_missing_details(
    p_event_id uuid,
    p_limit    integer DEFAULT 500
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_partner uuid;
    v_result  jsonb;
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
               pi.access_token,
               public.ticket_detail_status(t.id)                         AS st
          FROM tickets t
          LEFT JOIN users u            ON u.id  = t.user_id
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
               -- Any of this buyer's tokens opens all their slots; pick one.
               min(access_token::text)                          AS token,
               count(*)                                         AS slots_total,
               count(*) FILTER (WHERE NOT complete)             AS slots_missing,
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
        'buyers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'email',         buyer_email,
                       'name',          buyer_name,
                       'token',         token,
                       'slots_total',   slots_total,
                       'slots_missing', slots_missing,
                       'tickets',       tickets
                   ) ORDER BY slots_missing DESC, buyer_email)
              FROM (SELECT * FROM buyers
                     ORDER BY slots_missing DESC, buyer_email
                     LIMIT greatest(p_limit, 1)) b
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

-- Authenticated only. Never anon: the payload contains buyer emails and the
-- tokens that open their tickets.
--
-- The explicit REVOKE FROM anon is load-bearing. Supabase sets
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated,
-- service_role`, so every new function starts out anon-executable, and
-- REVOKE FROM PUBLIC does not remove a grant held by the role itself. The
-- in-function is_partner_owner() check does refuse anon on its own, but a
-- payload of buyer emails and ticket-editing tokens should not rest on a single
-- check.
REVOKE ALL ON FUNCTION public.get_event_missing_details(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_missing_details(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_missing_details(uuid, integer)
    TO authenticated, service_role;

COMMIT;
