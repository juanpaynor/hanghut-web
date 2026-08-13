-- Per-link referral stats for the organizer dashboard. Security-definer so it can
-- read purchase_intents (organizers can't select it directly), with an explicit
-- ownership guard. Purchases are matched by the ref stamped in attribution jsonb.
create or replace function public.get_referral_link_stats(p_organizer_id uuid, p_event_id uuid default null)
returns table(
    link_id uuid, code text, label text, type text, event_id uuid,
    is_active boolean, created_at timestamptz,
    clicks bigint, purchases bigint, tickets bigint, revenue numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from partners p where p.id = p_organizer_id and p.user_id = auth.uid()
    ) and not exists (
        select 1 from partner_team_members m
        where m.partner_id = p_organizer_id and m.user_id = auth.uid() and m.role in ('owner','manager')
    ) then
        raise exception 'not authorized';
    end if;

    return query
    select l.id, l.code, l.label, l.type, l.event_id, l.is_active, l.created_at,
        coalesce(c.clicks, 0)::bigint,
        coalesce(pi.purchases, 0)::bigint,
        coalesce(pi.tickets, 0)::bigint,
        coalesce(pi.revenue, 0)::numeric
    from referral_links l
    left join (
        select link_id, count(*) as clicks from referral_clicks group by link_id
    ) c on c.link_id = l.id
    left join (
        select attribution->>'ref' as ref,
               count(*) as purchases,
               coalesce(sum(quantity), 0) as tickets,
               coalesce(sum(total_amount - coalesce(refunded_amount, 0)), 0) as revenue
        from purchase_intents
        where status = 'completed' and attribution->>'ref' is not null
        group by attribution->>'ref'
    ) pi on pi.ref = l.code
    where l.organizer_id = p_organizer_id
      and (p_event_id is null or l.event_id = p_event_id)
    order by l.created_at desc;
end;
$$;

revoke all on function public.get_referral_link_stats(uuid, uuid) from public;
grant execute on function public.get_referral_link_stats(uuid, uuid) to authenticated, service_role;
