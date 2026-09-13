-- One atomic step for "someone attached a file to a support thread".
--
-- An attachment has to become a MESSAGE, not a row hanging off the ticket. A
-- bare support_attachments row moves nothing: no unread count, no notification,
-- no line in the conversation. The first cut of this let an organizer upload a
-- screenshot that literally nobody could ever see.
--
-- Two inserts, so they need one transaction: a message promising a file that
-- has no attachment row renders as a bare filename with nothing behind it, and
-- an attachment row with no message is the invisible case all over again.
--
-- SECURITY INVOKER, like open_support_ticket. This function adds atomicity and
-- nothing else — RLS on support_messages stays the only authorization, so a
-- closed thread, a thread you cannot see, or a forged sender are all still
-- refused by the same policy that governs a plain reply.
--
-- THE SENDER COMES FROM THE SURFACE, NOT THE ROLE. An earlier version derived
-- it from is_support_agent(), and an admin who is also an organizer uploaded a
-- screenshot in their own support widget and it rendered as though HangHut
-- Support had sent it to them. Staff are requesters too: on /organizer they are
-- asking, on /admin/support they are answering, and only the caller knows
-- which. Trusting the caller is safe here precisely because the INSERT policy
-- validates both branches — sender='agent' still requires is_support_agent().
CREATE OR REPLACE FUNCTION public.attach_support_file(
    p_ticket_id    uuid,
    p_storage_path text,
    p_file_name    text,
    p_mime_type    text,
    p_size_bytes   integer,
    p_sender       text DEFAULT 'requester'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
    v_message_id uuid;
BEGIN
    -- 'system' is written by triggers, never by a person.
    IF p_sender NOT IN ('requester', 'agent') THEN
        RAISE EXCEPTION 'Unknown sender %', p_sender USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO support_messages (ticket_id, sender, sender_user_id, body, internal)
    VALUES (p_ticket_id, p_sender, auth.uid(), left(coalesce(p_file_name, 'Attachment'), 200), false)
    RETURNING id INTO v_message_id;

    INSERT INTO support_attachments (
        ticket_id, message_id, uploaded_by, storage_path, file_name, mime_type, size_bytes
    )
    VALUES (
        p_ticket_id, v_message_id, auth.uid(), p_storage_path,
        left(coalesce(p_file_name, 'Attachment'), 200), p_mime_type, p_size_bytes
    );

    RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_support_file(uuid, text, text, text, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_support_file(uuid, text, text, text, integer, text) TO authenticated;
