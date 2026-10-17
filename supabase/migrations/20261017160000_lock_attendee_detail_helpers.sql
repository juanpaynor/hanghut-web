-- Close a direct back door into attendee answers.
--
-- ticket_detail_status() and event_required_question_ids() are INTERNAL helpers.
-- They exist so that get_attendee_details, save_attendee_details and
-- get_event_missing_details share one definition of "what is missing" and one
-- definition of "required". None of them is meant to be reachable from a
-- client: every client path is supposed to go through a gated RPC that first
-- proves the caller holds a link token, or owns the partner.
--
-- But Supabase's default privileges grant EXECUTE on every new function to both
-- PUBLIC and anon, so ticket_detail_status was callable directly by anon with a
-- bare ticket id and NO token, and it returns the answers themselves -- verified
-- on prod returning 20 real answers including a phone number. A ticket id is a
-- random v4 uuid, so this was not enumerable and there is no sign it was used;
-- it was still a route to medical details that bypassed the token entirely.
--
-- Revoking does not break the three RPCs above: they are SECURITY DEFINER, so
-- their internal calls execute as the function owner, which keeps its grant.
-- Verified in a rolled-back transaction -- with these revokes in place,
-- get_attendee_details('<Matt's token>') still returned all 3 slots while a
-- direct anon call raised 42501 permission denied.
--
-- BOTH grants have to go. These two are independent: REVOKE ... FROM anon
-- leaves the PUBLIC grant in place (and vice versa), and either one alone is
-- enough to keep the door open. An earlier revoke on this feature removed only
-- PUBLIC and the function stayed anon-callable; here removing only anon left it
-- callable too. Always revoke PUBLIC and anon together.

REVOKE ALL ON FUNCTION public.ticket_detail_status(uuid)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.event_required_question_ids(uuid, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
