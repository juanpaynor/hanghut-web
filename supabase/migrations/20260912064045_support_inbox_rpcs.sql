-- ── Opening a ticket ───────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: the RLS written in the previous migration is
-- the single source of authorization, and a definer function here would be a
-- second, quietly divergent copy of it. All this adds is atomicity — a ticket
-- and its first message land together or not at all, so the queue never shows
-- an empty thread an agent cannot answer.

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

    -- An async queue is triaged by subject line, so there is always one. If the
    -- organizer did not write a title, the opening line is the honest summary —
    -- better than making them invent one before they can ask for help.
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
    VALUES (v_id, 'organizer', auth.uid(), p_body);

    RETURN QUERY SELECT v_id, v_ref;
END;
$$;

-- ── Read state ─────────────────────────────────────────────────────────
-- Organizers have no UPDATE on support_tickets (status and assignment are not
-- theirs to move), so clearing their own unread badge has to come through a
-- definer function that touches exactly one column and nothing else.

CREATE OR REPLACE FUNCTION public.mark_support_read(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_is_organizer_side boolean;
BEGIN
    IF NOT can_view_support_ticket(p_ticket_id) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT (t.user_id = auth.uid() OR is_partner_owner(t.partner_id))
      INTO v_is_organizer_side
      FROM support_tickets t WHERE t.id = p_ticket_id;

    -- Checked organizer-side first so a support agent who also happens to own a
    -- partner clears the badge they are actually looking at.
    IF v_is_organizer_side THEN
        UPDATE support_tickets SET organizer_unread = 0 WHERE id = p_ticket_id;
    ELSIF is_support_agent() THEN
        UPDATE support_tickets SET agent_unread = 0 WHERE id = p_ticket_id;
    END IF;
END;
$$;

-- ── Agent controls ─────────────────────────────────────────────────────
-- Narrow definer functions rather than letting the agent UI UPDATE the row
-- directly: last_message_at, last_sender and the unread counts are owned by
-- the message trigger, and a broad UPDATE is how a second writer creeps in.

CREATE OR REPLACE FUNCTION public.set_support_ticket_status(p_ticket_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NOT is_support_agent() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_status NOT IN ('open', 'pending', 'resolved', 'closed') THEN
        RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = 'check_violation';
    END IF;

    UPDATE support_tickets
    SET status      = p_status,
        resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN now() ELSE NULL END,
        updated_at  = now()
    WHERE id = p_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_support_ticket(p_ticket_id uuid, p_assignee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    IF NOT is_support_agent() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE support_tickets
    SET assigned_to = p_assignee, updated_at = now()
    WHERE id = p_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_support_ticket(text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_support_read(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_support_ticket_status(uuid, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_support_ticket(uuid, uuid)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.open_support_ticket(text, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_support_read(uuid)                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_support_ticket_status(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_support_ticket(uuid, uuid)                  TO authenticated, service_role;
