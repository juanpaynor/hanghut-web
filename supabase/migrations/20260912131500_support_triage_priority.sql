-- Triage: money and identity questions open at high priority.
--
-- Everything else stays 'normal'. The distinction is not "how upset is the
-- organizer" — it is what a slow answer actually costs. A payouts question
-- means someone cannot get their money out, and an account/verification one
-- means they cannot sell at all; both have a deadline attached that a question
-- about editing an event description does not.
--
-- Deliberately the only automatic rule. Agents can still set priority by hand,
-- and nothing here ever lowers what a human chose.
CREATE OR REPLACE FUNCTION public.open_support_ticket(
    p_body text,
    p_partner_id uuid DEFAULT NULL::uuid,
    p_category text DEFAULT 'other'::text,
    p_subject text DEFAULT NULL::text,
    p_opened_from_path text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, reference text)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
        user_id, partner_id, subject, ticket_type, status, category, source,
        opened_from_path, priority
    )
    VALUES (
        auth.uid(), p_partner_id, v_subject, 'support', 'open',
        p_category, 'organizer_web', p_opened_from_path,
        CASE WHEN p_category IN ('payouts', 'account') THEN 'high' ELSE 'normal' END
    )
    RETURNING support_tickets.id, support_tickets.reference INTO v_id, v_ref;

    INSERT INTO support_messages (ticket_id, sender, sender_user_id, body)
    VALUES (v_id, 'requester', auth.uid(), p_body);

    RETURN QUERY SELECT v_id, v_ref;
END;
$function$;

-- Agents set priority by hand. SECURITY DEFINER with an explicit agent check,
-- matching set_support_ticket_status — organizers must not be able to mark
-- their own ticket urgent, or every ticket is urgent within a week.
CREATE OR REPLACE FUNCTION public.set_support_ticket_priority(
    p_ticket_id uuid,
    p_priority  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT is_support_agent() THEN
        RAISE EXCEPTION 'Not a support agent' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Unknown priority' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE support_tickets
       SET priority = p_priority, updated_at = now()
     WHERE id = p_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_support_ticket_priority(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_support_ticket_priority(uuid, text) TO authenticated;
