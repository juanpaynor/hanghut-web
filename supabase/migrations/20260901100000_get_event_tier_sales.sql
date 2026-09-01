-- Per-tier SALES breakdown for the Attendees page.
--
-- The check-in stats component pulled every ticket row for the event to the
-- browser and grouped them in JS. That answers "who has entered", not "what
-- sold", and it is a full-table pull per organizer every 30s. This aggregates in
-- Postgres and reports the sales side: how many bought each tier.
--
-- security invoker (not definer) on purpose: tickets RLS already scopes reads to
-- the organizer of the event, so this adds no new privilege surface.
create or replace function public.get_event_tier_sales(p_event_id uuid)
returns table (
    tier_id uuid,
    tier_name text,
    price numeric,
    quantity_total integer,
    sold bigint,
    checked_in bigint,
    refunded bigint,
    revenue numeric,
    sort_order integer
)
language sql
stable
security invoker
set search_path = public
as $$
    with tk as (
        select
            t.tier_id,
            nullif(btrim(coalesce(t.tier, '')), '')  as legacy_tier,
            t.status::text                            as status,
            -- Per-ticket paid share of its order. Mirrors what the attendee list
            -- shows per row, so a tier's revenue reflects promo discounts rather
            -- than the tier's current list price.
            case when t.status::text in ('valid', 'used')
                 then coalesce(pi.total_amount, 0) / greatest(coalesce(pi.quantity, 1), 1)
                 else 0 end                           as paid_share
        from tickets t
        left join purchase_intents pi on pi.id = t.purchase_intent_id
        where t.event_id = p_event_id
          -- Pre-minted inventory and abandoned checkouts were never bought.
          and t.status::text not in ('available', 'reserved')
    )
    select
        tt.id,
        tt.name,
        tt.price,
        tt.quantity_total,
        count(*) filter (where tk.status in ('valid', 'used')),
        count(*) filter (where tk.status = 'used'),
        count(*) filter (where tk.status = 'refunded'),
        coalesce(sum(tk.paid_share), 0),
        coalesce(tt.sort_order, 0)::integer
    from ticket_tiers tt
    left join tk on tk.tier_id = tt.id
    where tt.event_id = p_event_id
    group by tt.id, tt.name, tt.price, tt.quantity_total, tt.sort_order

    union all

    -- Tier-less tickets (flat-price events, and orders predating ticket_tiers)
    -- still need a row, or the breakdown would not add up to the Attendees count
    -- shown above it.
    select
        null::uuid,
        coalesce(tk.legacy_tier, 'General Admission'),
        null::numeric,
        null::integer,
        count(*) filter (where tk.status in ('valid', 'used')),
        count(*) filter (where tk.status = 'used'),
        count(*) filter (where tk.status = 'refunded'),
        coalesce(sum(tk.paid_share), 0),
        2147483647
    from tk
    where tk.tier_id is null
    group by coalesce(tk.legacy_tier, 'General Admission')

    order by 9, 5 desc;
$$;

revoke all on function public.get_event_tier_sales(uuid) from public, anon;
grant execute on function public.get_event_tier_sales(uuid) to authenticated, service_role;
