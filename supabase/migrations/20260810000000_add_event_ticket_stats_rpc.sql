-- Aggregate ticket stats for the organizer event-detail page in ONE query,
-- replacing two all-rows fetches (soldTickets + refundedTickets) that were
-- summed in JS. SECURITY DEFINER + scoped by event_id (page already authorizes
-- the organizer owns the event before calling).
create or replace function public.get_event_ticket_stats(p_event_id uuid)
returns table (
    sold_count bigint,
    checked_in_count bigint,
    gross_revenue numeric,
    refunded_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
    select
        count(*) filter (
            where t.status::text not in ('cancelled','refunded','available','reserved')
        ) as sold_count,
        count(*) filter (
            where t.checked_in_at is not null
              and t.status::text not in ('cancelled','refunded','available','reserved')
        ) as checked_in_count,
        coalesce(sum(pi.unit_price) filter (
            where t.status::text not in ('cancelled','refunded','available','reserved')
        ), 0) as gross_revenue,
        coalesce(sum(pi.unit_price) filter (
            where t.status::text = 'refunded'
        ), 0) as refunded_amount
    from public.tickets t
    left join public.purchase_intents pi on pi.id = t.purchase_intent_id
    where t.event_id = p_event_id;
$$;

grant execute on function public.get_event_ticket_stats(uuid) to authenticated, service_role;

-- Helps the "Manage Events" list, which filters organizer_id and sorts by start_datetime.
create index if not exists idx_events_organizer_start
    on public.events (organizer_id, start_datetime desc);
