-- Campaign audience dedup.
--
-- 1. get_recently_emailed: every address a partner has sent a campaign to in
--    the last N days. send-promotional-email subtracts this from the audience
--    when the organizer asks (exclude_recent_days), and the composer uses it
--    to preview how many will be skipped. Before this, nothing remembered a
--    send: 13 people got two campaigns from the same organizer inside a week.
--
-- 2. get_due_abandoned_checkouts deduped per INTENT (dedup_key = pi.id), so a
--    buyer who abandoned three times on one event was due three emails. Dedup
--    per person-per-event instead, and hand the consumer that key so the run
--    record matches what the query checks.

CREATE OR REPLACE FUNCTION public.get_recently_emailed(p_partner_id uuid, p_days integer)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT DISTINCT lower(s.recipient)
    FROM public.email_sends s
    WHERE s.partner_id = p_partner_id
      AND s.created_at >= now() - make_interval(days => GREATEST(p_days, 0))
      AND s.recipient IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_recently_emailed(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recently_emailed(uuid, integer) TO service_role;

CREATE INDEX IF NOT EXISTS email_sends_partner_created_idx
    ON public.email_sends (partner_id, created_at DESC);

DROP FUNCTION IF EXISTS public.get_due_abandoned_checkouts();
CREATE FUNCTION public.get_due_abandoned_checkouts()
RETURNS TABLE(automation_id uuid, partner_id uuid, subject text, html_content text, business_name text,
              intent_id uuid, guest_email text, guest_name text, event_id uuid, event_title text,
              checkout_url text, dedup_key text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT DISTINCT ON (a.id, e.id, lower(pi.guest_email))
           a.id, a.partner_id, a.subject, a.html_content, p.business_name,
           pi.id, pi.guest_email, pi.guest_name, e.id, e.title,
           COALESCE(
               NULLIF(CASE WHEN pi.status = 'pending' THEN pi.xendit_invoice_url END, ''),
               'https://hanghut.com/events/' || e.id::text
           ),
           e.id::text || ':' || lower(pi.guest_email)
    FROM public.email_automations a
    JOIN public.partners p ON p.id = a.partner_id
    JOIN public.events e ON e.organizer_id = a.partner_id
    JOIN public.purchase_intents pi ON pi.event_id = e.id
    WHERE a.enabled = true
      AND a.trigger_type = 'abandoned_checkout'
      AND a.subject IS NOT NULL AND a.html_content IS NOT NULL
      AND pi.status IN ('pending', 'expired')
      AND pi.guest_email IS NOT NULL AND pi.guest_email <> ''
      AND pi.created_at <= now() - make_interval(mins => COALESCE(a.offset_minutes, 60))
      AND pi.created_at > now() - interval '7 days'
      AND NOT EXISTS (
          SELECT 1 FROM public.purchase_intents c
          WHERE c.event_id = pi.event_id
            AND lower(c.guest_email) = lower(pi.guest_email)
            AND c.status = 'completed'
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.email_automation_runs r
          WHERE r.automation_id = a.id
            AND r.dedup_key IN (pi.id::text, e.id::text || ':' || lower(pi.guest_email))
      )
    ORDER BY a.id, e.id, lower(pi.guest_email), pi.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_due_abandoned_checkouts() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_abandoned_checkouts() TO service_role;
