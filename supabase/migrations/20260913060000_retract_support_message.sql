-- Let a requester take back something they said. Agents cannot.
--
-- WHY ONLY THE REQUESTER, AND WHY DELETE RATHER THAN EDIT:
--
-- A support thread is a record — it is what an organizer points at when they
-- say "you told me my payout would land Tuesday". An agent who could edit their
-- own words would turn that record into a draft, and since we email a
-- transcript on close, an edit would also make the emailed copy and the in-app
-- copy disagree. An agent who said something wrong corrects it with a NEW
-- message, which is also how the customer finds out about the correction.
--
-- The requester's case is different and real: someone pastes an API key, a
-- password, or a customer's phone number into a support chat. That is their own
-- data and there has to be a way to pull it back.
--
-- Edit is deliberately NOT offered to either side. An edit after an agent has
-- read and answered rewrites the question underneath the answer, leaving a
-- thread where support appears to reply to something nobody asked.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.support_messages.deleted_at IS
    'Retracted by its sender. The row survives on purpose: an agent must be able to see that something WAS here, or a thread that silently loses a message reads as an agent misremembering. Renderers must show a placeholder and must NOT show body.';

-- No UPDATE policy is added, deliberately. A general UPDATE grant would also let
-- a requester rewrite `body`, which is the thing we are specifically not
-- offering. This definer function is the whole mutation surface: it sets
-- deleted_at and nothing else, after checking ownership itself.
CREATE OR REPLACE FUNCTION public.retract_support_message(p_message_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_msg     support_messages%ROWTYPE;
    v_ticket  support_tickets%ROWTYPE;
    v_paths   text[];
    v_preview text;
BEGIN
    SELECT * INTO v_msg FROM support_messages WHERE id = p_message_id;
    IF v_msg.id IS NULL THEN
        RAISE EXCEPTION 'No such message' USING ERRCODE = 'no_data_found';
    END IF;

    -- Yours, and only if you were the one asking. An agent message is a record.
    IF v_msg.sender_user_id IS DISTINCT FROM auth.uid() OR v_msg.sender <> 'requester' THEN
        RAISE EXCEPTION 'Not your message' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_msg.deleted_at IS NOT NULL THEN
        RETURN ARRAY[]::text[];
    END IF;

    -- THE BODY IS DESTROYED, not merely flagged.
    --
    -- Stripping it in the read path only hides it from one renderer: the text
    -- would still sit in Postgres, in every backup, and behind any future query
    -- that forgets the filter. This feature exists because someone pasted a live
    -- API key into a chat box, so "removed" has to mean removed.
    --
    -- What survives is the FACT: the row, its author, its position in the
    -- thread, and when it was retracted. That is what an agent needs to see —
    -- that something was here — and it is not the part anyone wants gone.
    UPDATE support_messages
       SET body = '', deleted_at = now(), deleted_by = auth.uid()
     WHERE id = p_message_id;

    -- Hand the storage paths back so the caller can purge the objects. The rows
    -- go now: the point of a retraction is that nothing points at the file any
    -- more, and a signed URL must stop being issuable immediately.
    SELECT coalesce(array_agg(storage_path), ARRAY[]::text[]) INTO v_paths
      FROM support_attachments WHERE message_id = p_message_id;

    DELETE FROM support_attachments WHERE message_id = p_message_id;

    SELECT * INTO v_ticket FROM support_tickets WHERE id = v_msg.ticket_id;

    -- THE PREVIEW IS THE WHOLE POINT OF THIS BLOCK.
    --
    -- upsert_support_inbox mirrors each message's first 140 characters into the
    -- app's chat inbox as the row subtitle. So a pasted secret survives the
    -- retraction sitting in the user's own inbox list unless the preview is
    -- rewritten. Re-mirror from the newest message that is still standing.
    --
    -- p_bump_unread => false zeroes the app's unread count rather than leaving
    -- it (the app team's declared behaviour, team_comms #310). That is correct
    -- here for the same reason it is correct on send: retracting IS the
    -- requester acting inside the thread, so they are looking at it.
    SELECT left(regexp_replace(body, '\s+', ' ', 'g'), 140) INTO v_preview
      FROM support_messages
     WHERE ticket_id = v_msg.ticket_id
       AND deleted_at IS NULL
       AND internal = false
     ORDER BY seq DESC
     LIMIT 1;

    BEGIN
        PERFORM upsert_support_inbox(
            p_user_id     => v_ticket.user_id,
            p_ticket_id   => v_msg.ticket_id,
            p_reference   => v_ticket.reference,
            p_preview     => coalesce(v_preview, 'Message removed'),
            p_bump_unread => false
        );
    EXCEPTION WHEN OTHERS THEN
        -- Same guard as the message trigger: a mirror failure must never undo a
        -- retraction. But unlike there, this one is worth being loud about — a
        -- stale preview here is the leak this function exists to close.
        RAISE WARNING 'retract: inbox re-mirror FAILED for ticket %, preview may still show removed text: %',
            v_msg.ticket_id, SQLERRM;
    END;

    RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.retract_support_message(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.retract_support_message(uuid) TO authenticated;

-- Purging the object needs a delete grant; there was none on this bucket, so
-- `remove()` silently did nothing. Scoped to the uploader's own files.
DROP POLICY IF EXISTS "Delete your own support attachments" ON storage.objects;
CREATE POLICY "Delete your own support attachments"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'support-attachments' AND owner = auth.uid());

-- A live message must still carry text. A RETRACTED one must be allowed to
-- carry none — emptying the body is how a retraction removes a pasted secret
-- from Postgres rather than merely hiding it from one renderer. The original
-- CHECK refused the empty string outright and blocked exactly that.
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_body_check;
ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_body_check CHECK (
    length(btrim(body)) <= 8000
    AND (deleted_at IS NOT NULL OR length(btrim(body)) >= 1)
);
