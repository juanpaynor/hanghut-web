-- ═══════════════════════════════════════════════════════════════════════
-- Corrections to the support inbox, all from the app team's review in
-- team_comms #308. Every one verified against the live schema before applying.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. 'organizer' -> 'requester', at ALL FIVE sites ───────────────────
-- The value was wrong the moment the app team took source 'app_user': the
-- person raising an app ticket is a ticket BUYER, not an organizer.
--
-- The rename was NOT the one-constraint change it looked like. Two of the five
-- sites fail SILENTLY if missed: the trigger's CASE branches compare against
-- the literal, so with the constraint renamed but the trigger untouched, an
-- insert succeeds, the client renders the message, and agent_unread never
-- increments — the message lands in a table nobody is told to look at.

ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_check;
ALTER TABLE public.support_tickets  DROP CONSTRAINT IF EXISTS support_tickets_last_sender_check;

DROP POLICY IF EXISTS "Reply as yourself" ON public.support_messages;
DROP POLICY IF EXISTS "Read the threads you can see" ON public.support_messages;

UPDATE public.support_messages SET sender      = 'requester' WHERE sender      = 'organizer';
UPDATE public.support_tickets  SET last_sender = 'requester' WHERE last_sender = 'organizer';

ALTER TABLE public.support_tickets ALTER COLUMN last_sender SET DEFAULT 'requester';

ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_sender_check
        CHECK (sender IN ('requester', 'agent', 'system'));
ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_last_sender_check
        CHECK (last_sender IN ('requester', 'agent', 'system'));

-- ── 2. Internal agent notes ────────────────────────────────────────────
-- Added before the app ships a reader, which was the app team's point: after,
-- their reader would have quietly shown staff notes to the person they were
-- written about.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;

-- ── 3. Monotonic ordering ──────────────────────────────────────────────
-- created_at orders by wall clock, which is not an ordering — two inserts in
-- the same millisecond, or any clock skew, and the thread renders out of order.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS seq bigserial;

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_seq
    ON public.support_messages (ticket_id, seq);

-- ── 4. Who is an agent ─────────────────────────────────────────────────
-- Was `is_admin = true`, which is every admin account. Narrowed to the roles
-- that actually answer support. No finance_admin account exists today, so this
-- locks nobody out now; it stops a future one inheriting access silently.

CREATE OR REPLACE FUNCTION public.is_support_agent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
          AND is_admin = true
          AND admin_role IN ('super_admin', 'admin', 'support')
    );
$$;

-- ── 5. Policies ────────────────────────────────────────────────────────
-- The SELECT policy gates internal notes with `OR is_support_agent()`. Writing
-- it as plain `AND internal = false`, which is what #306 said, would have
-- locked agents out of their own notes: there is ONE policy here and it serves
-- both sides of the conversation.

CREATE POLICY "Read the threads you can see" ON public.support_messages
    FOR SELECT TO authenticated
    USING (
        can_view_support_ticket(ticket_id)
        AND (internal = false OR is_support_agent())
    );

-- A requester cannot post as an agent, and cannot write an internal note
-- either — otherwise `internal` would be a flag anyone could set to hide their
-- own message from the queue.
CREATE POLICY "Reply as yourself" ON public.support_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()
        AND (
            (sender = 'requester' AND internal = false AND can_reply_support_ticket(ticket_id))
            OR (sender = 'agent' AND is_support_agent())
        )
    );

-- The original ticket policies predate this work and still used `is_admin`
-- directly; align them so there is one definition of "agent".
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can update tickets" ON public.support_tickets;

CREATE POLICY "Agents can update tickets" ON public.support_tickets
    FOR UPDATE TO authenticated USING (is_support_agent());

-- ── 6. Closed is final ─────────────────────────────────────────────────
-- Rich's call. `can_reply_support_ticket` already refuses replies on a closed
-- ticket, which made the trigger's 'closed' reopen branch unreachable — the
-- two rules disagreed and the dead branch hid it. Resolved still reopens on a
-- reply; closed does not, and the client is expected to read `status` and
-- offer "start a new ticket" rather than letting the insert fail.

CREATE OR REPLACE FUNCTION public.sync_support_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    UPDATE support_tickets
    SET last_message_at  = NEW.created_at,
        last_sender      = NEW.sender,
        organizer_unread = CASE WHEN NEW.sender = 'agent' AND NEW.internal = false
                                THEN organizer_unread + 1 ELSE organizer_unread END,
        agent_unread     = CASE WHEN NEW.sender = 'requester'
                                THEN agent_unread + 1 ELSE agent_unread END,
        -- Resolved reopens on a reply; closed is final and cannot be replied to.
        status           = CASE WHEN NEW.sender = 'requester' AND status = 'resolved'
                                THEN 'open' ELSE status END,
        updated_at       = now()
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;

-- ── 7. The opening RPC writes the new sender value ─────────────────────

CREATE OR REPLACE FUNCTION public.open_support_ticket(
    p_body             text,
    p_partner_id       uuid    DEFAULT NULL,
    p_category         text    DEFAULT 'other',
    p_subject          text    DEFAULT NULL,
    p_opened_from_path text    DEFAULT NULL
)
RETURNS TABLE (id uuid, reference text)
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
    v_id      uuid;
    v_ref     text;
    v_subject text;
BEGIN
    IF length(btrim(coalesce(p_body, ''))) = 0 THEN
        RAISE EXCEPTION 'A message is required' USING ERRCODE = 'check_violation';
    END IF;

    v_subject := COALESCE(
        NULLIF(btrim(p_subject), ''),
        left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 80)
    );

    INSERT INTO support_tickets (
        user_id, partner_id, subject, ticket_type, status, category, source, opened_from_path
    )
    VALUES (
        auth.uid(), p_partner_id, v_subject, 'support', 'open',
        p_category, 'organizer_web', p_opened_from_path
    )
    RETURNING support_tickets.id, support_tickets.reference INTO v_id, v_ref;

    INSERT INTO support_messages (ticket_id, sender, sender_user_id, body)
    VALUES (v_id, 'requester', auth.uid(), p_body);

    RETURN QUERY SELECT v_id, v_ref;
END;
$$;

-- ── 8. Off Supabase realtime ───────────────────────────────────────────
-- Message bodies move to Ably (team_comms #306/#308). The chat_inbox row keeps
-- riding Supabase realtime, which is the app's existing and deliberate split:
-- derived state maintained by triggers is free and exactly correct there.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.support_messages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
