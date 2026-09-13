-- ═══════════════════════════════════════════════════════════════════════
-- SUPPORT INBOX — async ticketing with threaded replies.
--
-- A ticket IS a thread. Rather than adding a `support_conversations` table
-- beside `support_tickets`, this extends the table that already exists: the
-- two are the same object, and keeping them apart would mean an agent looking
-- in two queues and a status that lives in one place while the conversation
-- lives in another.
--
-- `support_tickets` was built for single-shot account appeals — one `message`,
-- one `admin_response`, 2 rows ever. Those columns become legacy; the thread
-- moves to `support_messages` and the 2 existing rows are backfilled into it
-- so nothing has to know about the old shape.
--
-- Async by design: there is no presence and no typing state anywhere in here.
-- The counters and `last_message_at` are what the UI reads, and email is what
-- carries a reply when nobody is looking at a screen.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Who is who ─────────────────────────────────────────────────────────
-- Both predicates are SECURITY DEFINER because RLS policies call them against
-- tables the caller may not be able to read. `is_admin = true` matches the
-- existing support_tickets policies exactly rather than inventing a second
-- notion of "staff" alongside the one already in use.

CREATE OR REPLACE FUNCTION public.is_support_agent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true);
$$;

CREATE OR REPLACE FUNCTION public.is_partner_owner(p_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT p_partner_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.is_support_agent() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_partner_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_agent() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_partner_owner(uuid) TO authenticated, service_role;

-- ── The ticket ─────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_ref_seq START 1001;

ALTER TABLE public.support_tickets
    ADD COLUMN IF NOT EXISTS partner_id       uuid REFERENCES public.partners(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reference        text,
    ADD COLUMN IF NOT EXISTS category         text NOT NULL DEFAULT 'other',
    ADD COLUMN IF NOT EXISTS source           text NOT NULL DEFAULT 'organizer_web',
    ADD COLUMN IF NOT EXISTS assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS opened_from_path text,
    ADD COLUMN IF NOT EXISTS last_message_at  timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_sender      text NOT NULL DEFAULT 'organizer',
    ADD COLUMN IF NOT EXISTS organizer_unread integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS agent_unread     integer NOT NULL DEFAULT 0;

-- The thread now holds the body. A new ticket writes support_messages only,
-- so this stops being required; the 2 legacy rows keep theirs.
ALTER TABLE public.support_tickets ALTER COLUMN message DROP NOT NULL;

ALTER TABLE public.support_tickets
    DROP CONSTRAINT IF EXISTS support_tickets_status_check,
    DROP CONSTRAINT IF EXISTS support_tickets_category_check,
    DROP CONSTRAINT IF EXISTS support_tickets_source_check,
    DROP CONSTRAINT IF EXISTS support_tickets_last_sender_check,
    DROP CONSTRAINT IF EXISTS support_tickets_reference_key;

ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_status_check
        CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
    ADD CONSTRAINT support_tickets_category_check
        CHECK (category IN ('payouts', 'events', 'tickets', 'account', 'technical', 'other')),
    -- 'app_user' is reserved for the app-initiated path (team_comms #304); the
    -- column exists now so the agent queue is one queue from the first day.
    ADD CONSTRAINT support_tickets_source_check
        CHECK (source IN ('organizer_web', 'app_user', 'admin')),
    ADD CONSTRAINT support_tickets_last_sender_check
        CHECK (last_sender IN ('organizer', 'agent', 'system')),
    ADD CONSTRAINT support_tickets_reference_key UNIQUE (reference);

-- Human reference. Agents and organizers quote these at each other over email,
-- so it is generated once and never changes.
CREATE OR REPLACE FUNCTION public.set_support_ticket_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
    IF NEW.reference IS NULL THEN
        NEW.reference := 'HH-' || lpad(nextval('support_ticket_ref_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_reference ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_reference
    BEFORE INSERT ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_reference();

-- ── The thread ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_messages (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender         text NOT NULL CHECK (sender IN ('organizer', 'agent', 'system')),
    sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    body           text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_attachments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    message_id   uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
    uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    storage_path text NOT NULL,
    file_name    text NOT NULL,
    mime_type    text NOT NULL,
    size_bytes   integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket    ON public.support_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON public.support_attachments (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_partner    ON public.support_tickets (partner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user       ON public.support_tickets (user_id, last_message_at DESC);
-- The agent queue: everything not yet resolved, newest activity first.
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue      ON public.support_tickets (last_message_at DESC)
    WHERE status <> 'resolved';

-- ── Counters are trigger-owned ─────────────────────────────────────────
-- last_message_at, last_sender and both unread counts are written HERE and
-- nowhere else. Hand-writing a counter a trigger owns has already caused two
-- separate defects in this codebase (tickets_sold); the rule is one writer.

CREATE OR REPLACE FUNCTION public.sync_support_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    UPDATE support_tickets
    SET last_message_at  = NEW.created_at,
        last_sender      = NEW.sender,
        organizer_unread = CASE WHEN NEW.sender = 'agent'     THEN organizer_unread + 1 ELSE organizer_unread END,
        agent_unread     = CASE WHEN NEW.sender = 'organizer' THEN agent_unread + 1     ELSE agent_unread END,
        -- An organizer replying to something we called resolved did not agree.
        status           = CASE WHEN NEW.sender = 'organizer' AND status IN ('resolved', 'closed')
                                THEN 'open' ELSE status END,
        updated_at       = now()
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_message_sync ON public.support_messages;
CREATE TRIGGER trg_support_message_sync
    AFTER INSERT ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.sync_support_ticket_on_message();

-- ── Visibility ─────────────────────────────────────────────────────────
-- The rule: you see your own threads; a partner OWNER also sees every thread
-- raised for their partner; support agents see everything.
--
-- Owner-sees-all rather than team-sees-all because a payout or KYC thread
-- should not be readable by door staff. Owner-sees-all rather than
-- opener-only because a thread must not become unreachable when the manager
-- who opened it leaves.

CREATE OR REPLACE FUNCTION public.can_view_support_ticket(p_ticket_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM support_tickets t
        WHERE t.id = p_ticket_id
          AND (t.user_id = auth.uid() OR is_partner_owner(t.partner_id) OR is_support_agent())
    );
$$;

-- Writing is the same rule minus agents, who post as 'agent' instead.
CREATE OR REPLACE FUNCTION public.can_reply_support_ticket(p_ticket_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM support_tickets t
        WHERE t.id = p_ticket_id
          AND t.status <> 'closed'
          AND (t.user_id = auth.uid() OR is_partner_owner(t.partner_id))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_support_ticket(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_reply_support_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_support_ticket(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_reply_support_ticket(uuid) TO authenticated, service_role;

-- ── RLS ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
CREATE POLICY "View own, owned-partner, or as agent" ON public.support_tickets
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_partner_owner(partner_id) OR is_support_agent());

DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
CREATE POLICY "Open a ticket for yourself or your partner" ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND (partner_id IS NULL OR can_manage_partner(partner_id))
    );

ALTER TABLE public.support_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read the threads you can see" ON public.support_messages
    FOR SELECT TO authenticated USING (can_view_support_ticket(ticket_id));

-- Sender is not a claim the client gets to make freely: an organizer cannot
-- post as 'agent', and an agent cannot post as 'organizer'.
CREATE POLICY "Reply as yourself" ON public.support_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()
        AND (
            (sender = 'organizer' AND can_reply_support_ticket(ticket_id))
            OR (sender = 'agent' AND is_support_agent())
        )
    );

-- Deliberately no UPDATE or DELETE policy on messages, for anyone including
-- agents. A support thread is a record of what was said.

CREATE POLICY "Read attachments on visible threads" ON public.support_attachments
    FOR SELECT TO authenticated USING (can_view_support_ticket(ticket_id));

CREATE POLICY "Attach to threads you can reply to" ON public.support_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        uploaded_by = auth.uid()
        AND (can_reply_support_ticket(ticket_id) OR is_support_agent())
    );

REVOKE ALL ON public.support_messages, public.support_attachments FROM anon;
GRANT SELECT, INSERT ON public.support_messages    TO authenticated;
GRANT SELECT, INSERT ON public.support_attachments TO authenticated;

-- ── Backfill the 2 legacy appeals into threads ─────────────────────────

UPDATE public.support_tickets
SET reference       = 'HH-' || lpad(nextval('support_ticket_ref_seq')::text, 4, '0'),
    category        = 'account',
    source          = 'app_user',
    last_message_at = COALESCE(resolved_at, updated_at, created_at),
    last_sender     = CASE WHEN admin_response IS NOT NULL THEN 'agent' ELSE 'organizer' END
WHERE reference IS NULL;

INSERT INTO public.support_messages (ticket_id, sender, sender_user_id, body, created_at)
SELECT t.id, 'organizer', t.user_id, t.message, t.created_at
FROM public.support_tickets t
WHERE t.message IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.support_messages m WHERE m.ticket_id = t.id);

INSERT INTO public.support_messages (ticket_id, sender, sender_user_id, body, created_at)
SELECT t.id, 'agent', t.admin_id, t.admin_response, COALESCE(t.resolved_at, t.updated_at, t.created_at)
FROM public.support_tickets t
WHERE t.admin_response IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.support_messages m
      WHERE m.ticket_id = t.id AND m.sender = 'agent'
  );

-- The backfill inserts fired the counter trigger. Reset: history is read.
UPDATE public.support_tickets SET organizer_unread = 0, agent_unread = 0;

-- ── Realtime ───────────────────────────────────────────────────────────
-- postgres_changes honours the RLS above per subscriber, so no token service
-- is needed the way seat maps need one for anonymous buyers.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
