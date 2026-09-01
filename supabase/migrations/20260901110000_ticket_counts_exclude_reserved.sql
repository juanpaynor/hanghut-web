-- 'reserved' is an in-flight/abandoned checkout, not a sale. Counting it inflated
-- every "sold" figure that reads through this function: the organizer dashboard,
-- the events list, the public storefront and the public API. On prod one event
-- reported 45 sold against 26 real tickets — 19 abandoned carts.
create or replace function public.get_ticket_counts_by_events(p_event_ids uuid[])
returns table(event_id uuid, sold_count bigint)
language sql
stable
set search_path = public
as $function$
    select t.event_id, count(*) as sold_count
    from tickets t
    where t.event_id = any(p_event_ids)
      and t.status not in ('available', 'cancelled', 'refunded', 'reserved')
    group by t.event_id;
$function$;
