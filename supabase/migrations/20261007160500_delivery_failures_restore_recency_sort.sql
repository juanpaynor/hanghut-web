-- Fixes a regression introduced minutes earlier in
-- 20261007160000_delivery_failures_one_row_per_order.
--
-- DISTINCT ON (intent_id) forces intent_id to lead the ORDER BY, which silently
-- dropped the most-recent-bounce-first ordering the banner had always had: the
-- list came back ordered by a UUID. Dedupe in an inner query, sort in an outer
-- one.
CREATE OR REPLACE FUNCTION public.get_event_delivery_failures(p_event_id uuid)
RETURNS TABLE(ticket_id uuid, intent_id uuid, recipient text, buyer_name text,
              bounced_at timestamp with time zone, bounce_count integer, ticket_status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
    with gate as (
        select e.id from events e
        where e.id = p_event_id and can_sell_at_door(e.organizer_id)
    ),
    bounced as (
        select lower(ev.recipient) as email, max(ev.occurred_at) as last_bounce,
               count(*)::int as n
        from email_events ev
        where ev.type = 'bounced' and ev.campaign_id is null
        group by 1
    ),
    rows as (
        select t.id as ticket_id, pi.id as intent_id, b.email as recipient,
               coalesce(pi.guest_name, u.display_name) as buyer_name,
               b.last_bounce, b.n, t.status::text as ticket_status
        from gate g
        join tickets t            on t.event_id = g.id
        join purchase_intents pi  on pi.id = t.purchase_intent_id
        left join users u         on u.id = pi.user_id
        join bounced b            on b.email = lower(coalesce(pi.guest_email, u.email))
        where t.status in ('valid', 'used') and b.last_bounce >= pi.created_at
    ),
    deduped as (
        select distinct on (intent_id)
               ticket_id, intent_id, recipient, buyer_name, last_bounce, n, ticket_status
        from rows order by intent_id, ticket_id
    )
    select ticket_id, intent_id, recipient, buyer_name, last_bounce, n, ticket_status
    from deduped order by last_bounce desc
$fn$;
