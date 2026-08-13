-- Referral / influencer tracking — Phase 1 (additive, no changes to the money hot path).
--
-- Two new tables only. Conversions are read from where the data already lives:
--   • purchases → purchase_intents.attribution->>'ref' (existing jsonb pipeline)
--   • signups   → partners.referral_code (added in Phase 2)
--
-- A referral link is a short code an organizer (or HangHut) hands to an influencer.
-- The /r/<code> route logs a click and 302s to the target with ?ref=<code>, which
-- the existing first-touch attribution capture picks up and carries into checkout.

create table if not exists public.referral_links (
    id            uuid primary key default gen_random_uuid(),
    code          text not null unique,
    type          text not null default 'organizer_event'
                    check (type in ('organizer_event', 'organizer_storefront', 'platform')),
    organizer_id  uuid references public.partners(id) on delete cascade,   -- null for platform links
    event_id      uuid references public.events(id) on delete cascade,     -- set for organizer_event
    label         text not null,                                           -- influencer name / campaign
    is_active     boolean not null default true,
    created_by    uuid references auth.users(id) on delete set null,
    created_at    timestamptz not null default now()
);

create index if not exists referral_links_organizer_idx on public.referral_links(organizer_id);
create index if not exists referral_links_event_idx on public.referral_links(event_id);

create table if not exists public.referral_clicks (
    id          uuid primary key default gen_random_uuid(),
    link_id     uuid not null references public.referral_links(id) on delete cascade,
    referrer    text,
    user_agent  text,
    created_at  timestamptz not null default now()
);

create index if not exists referral_clicks_link_idx on public.referral_clicks(link_id, created_at);

-- Dashboard aggregates purchases by the ref stamped inside the attribution jsonb.
create index if not exists purchase_intents_attribution_ref_idx
    on public.purchase_intents ((attribution->>'ref'));

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.referral_links enable row level security;
alter table public.referral_clicks enable row level security;

-- Organizer (owner or team manager) manages their own links. Platform links
-- (organizer_id is null) are admin-only via service_role, which bypasses RLS.
drop policy if exists referral_links_owner_rw on public.referral_links;
create policy referral_links_owner_rw on public.referral_links
    for all
    using (
        organizer_id in (select id from public.partners where user_id = auth.uid())
        or exists (
            select 1 from public.partner_team_members m
            where m.partner_id = referral_links.organizer_id
              and m.user_id = auth.uid()
              and m.role in ('owner', 'manager')
        )
    )
    with check (
        organizer_id in (select id from public.partners where user_id = auth.uid())
        or exists (
            select 1 from public.partner_team_members m
            where m.partner_id = referral_links.organizer_id
              and m.user_id = auth.uid()
              and m.role in ('owner', 'manager')
        )
    );

-- referral_clicks has no user-facing policies: written only by the RPC below
-- (security definer) and read only by server code via service_role.

-- ── Click capture RPC ─────────────────────────────────────────────────────────
-- Called by the public /r/<code> route (anon). Resolves an active link, logs the
-- click, and returns just enough to build the redirect target. Returns null for
-- unknown/inactive codes so the route can fall back to home without logging.
create or replace function public.track_referral_click(
    p_code text,
    p_referrer text default null,
    p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_link public.referral_links%rowtype;
    v_slug text;
begin
    select * into v_link from public.referral_links where code = p_code and is_active = true;
    if not found then
        return null;
    end if;

    insert into public.referral_clicks(link_id, referrer, user_agent)
        values (v_link.id, left(p_referrer, 500), left(p_user_agent, 500));

    select slug into v_slug from public.partners where id = v_link.organizer_id;

    return jsonb_build_object(
        'code', v_link.code,
        'type', v_link.type,
        'event_id', v_link.event_id,
        'partner_slug', v_slug
    );
end;
$$;

revoke all on function public.track_referral_click(text, text, text) from public;
grant execute on function public.track_referral_click(text, text, text) to anon, authenticated, service_role;
