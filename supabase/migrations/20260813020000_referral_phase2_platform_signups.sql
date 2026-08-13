-- Phase 2: HangHut platform links + partner-signup attribution.

-- Signup attribution: the ref stamped on a partner account at registration.
alter table public.partners add column if not exists referral_code text;
create index if not exists partners_referral_code_idx on public.partners(referral_code);

-- Distinguish a normal /r link hit from an app-download-button click (the proxy
-- metric for installs we can't truly attribute on the web).
alter table public.referral_clicks add column if not exists kind text not null default 'link'
    check (kind in ('link', 'app_download'));

-- Redefine the click RPC to accept a kind (defaults to 'link' so the existing
-- 3-arg /r route call keeps working via the default).
drop function if exists public.track_referral_click(text, text, text);
create or replace function public.track_referral_click(
    p_code text,
    p_referrer text default null,
    p_user_agent text default null,
    p_kind text default 'link'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_link public.referral_links%rowtype;
    v_slug text;
    v_kind text := case when p_kind = 'app_download' then 'app_download' else 'link' end;
begin
    select * into v_link from public.referral_links where code = p_code and is_active = true;
    if not found then
        return null;
    end if;

    insert into public.referral_clicks(link_id, referrer, user_agent, kind)
        values (v_link.id, left(p_referrer, 500), left(p_user_agent, 500), v_kind);

    select slug into v_slug from public.partners where id = v_link.organizer_id;

    return jsonb_build_object(
        'code', v_link.code,
        'type', v_link.type,
        'event_id', v_link.event_id,
        'partner_slug', v_slug
    );
end;
$$;

revoke all on function public.track_referral_click(text, text, text, text) from public;
grant execute on function public.track_referral_click(text, text, text, text) to anon, authenticated, service_role;

-- Admin-only stats for platform links: clicks, app-download proxy clicks, and
-- partner signups (matched by partners.referral_code).
create or replace function public.get_platform_referral_stats()
returns table(
    link_id uuid, code text, label text, is_active boolean, created_at timestamptz,
    clicks bigint, app_downloads bigint, signups bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.users where id = auth.uid() and is_admin = true) then
        raise exception 'not authorized';
    end if;

    return query
    select l.id, l.code, l.label, l.is_active, l.created_at,
        coalesce(cl.link_clicks, 0)::bigint,
        coalesce(cl.app_clicks, 0)::bigint,
        coalesce(s.signups, 0)::bigint
    from referral_links l
    left join (
        select link_id,
            count(*) filter (where kind = 'link') as link_clicks,
            count(*) filter (where kind = 'app_download') as app_clicks
        from referral_clicks group by link_id
    ) cl on cl.link_id = l.id
    left join (
        select referral_code as code, count(*) as signups
        from partners where referral_code is not null group by referral_code
    ) s on s.code = l.code
    where l.type = 'platform'
    order by l.created_at desc;
end;
$$;

revoke all on function public.get_platform_referral_stats() from public;
grant execute on function public.get_platform_referral_stats() to authenticated, service_role;
