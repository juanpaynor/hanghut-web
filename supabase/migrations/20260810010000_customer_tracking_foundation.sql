-- ── Customer tracking foundation ─────────────────────────────────────────────
-- Web funnel + acquisition attribution. Views/presses/checkout-starts land here;
-- the final "purchase" step lives in transactions (don't duplicate). Attribution
-- (channel + utm + referrer) is captured on view and carried to the purchase.

create table if not exists public.tracking_events (
    id uuid primary key default gen_random_uuid(),
    event_id uuid references public.events(id) on delete cascade,
    partner_id uuid references public.partners(id) on delete cascade,
    type text not null check (type in ('view','get_tickets_press','checkout_start')),
    user_id uuid,          -- set when the visitor is logged in
    anon_id text,          -- first-party device/session id for guests
    channel text,          -- storefront | discover | embed | share | email | direct | app
    utm_source text,
    utm_medium text,
    utm_campaign text,
    referrer text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_tracking_events_event_type_time
    on public.tracking_events (event_id, type, created_at desc);
create index if not exists idx_tracking_events_partner_time
    on public.tracking_events (partner_id, created_at desc);
create index if not exists idx_tracking_events_channel
    on public.tracking_events (partner_id, channel);

alter table public.tracking_events enable row level security;

-- Organizers read their own tracking; admins read all. Inserts go ONLY through the
-- SECURITY DEFINER RPC below (so partner_id can't be forged) — no direct insert policy.
create policy "Organizers read own tracking" on public.tracking_events
    for select to authenticated
    using (
        partner_id in (select id from public.partners where user_id = auth.uid())
        or public.is_user_admin() is not null
    );

-- Attribution carried onto the money path (additive, nullable).
alter table public.purchase_intents add column if not exists attribution jsonb;
alter table public.transactions    add column if not exists attribution jsonb;

-- Insert helper: resolves partner_id from the event, stamps auth.uid() if present.
create or replace function public.record_tracking_event(
    p_event_id uuid,
    p_type text,
    p_channel text default null,
    p_utm_source text default null,
    p_utm_medium text default null,
    p_utm_campaign text default null,
    p_referrer text default null,
    p_anon_id text default null,
    p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_partner uuid;
begin
    if p_type not in ('view','get_tickets_press','checkout_start') then
        return;
    end if;

    select organizer_id into v_partner from public.events where id = p_event_id;
    if v_partner is null then
        return;
    end if;

    insert into public.tracking_events (
        event_id, partner_id, type, user_id, anon_id, channel,
        utm_source, utm_medium, utm_campaign, referrer, metadata
    ) values (
        p_event_id, v_partner, p_type, auth.uid(), p_anon_id, p_channel,
        p_utm_source, p_utm_medium, p_utm_campaign, p_referrer, coalesce(p_metadata, '{}'::jsonb)
    );
end;
$$;

grant execute on function public.record_tracking_event(uuid, text, text, text, text, text, text, text, jsonb)
    to anon, authenticated;
