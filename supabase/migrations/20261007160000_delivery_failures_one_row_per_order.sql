-- The delivery-failure banner listed one row PER TICKET, so a buyer with 3
-- tickets on one order appeared 3 times and the heading counted them as 3
-- buyers. On "Back to the Garden" it read "8 buyers never received their ticket"
-- when it was 4 people.
--
-- The address is typed once, on the ORDER -- correct_order_email is already
-- scoped that way for exactly this reason -- so one row per order is the honest
-- unit. ticket_id stays a representative ticket, because correct_order_email
-- and resend_order_email both take one.
--
-- Signature deliberately unchanged: adding a column would need DROP + CREATE on
-- a function the attendee tab calls on every load.
--
-- SUPERSEDED a few minutes later by 20261007160500 -- see that file. Kept as its
-- own migration because it is its own ledger row.
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
    )
    select distinct on (intent_id)
           ticket_id, intent_id, recipient, buyer_name, last_bounce, n, ticket_status
    from rows
    order by intent_id, ticket_id
$fn$;
