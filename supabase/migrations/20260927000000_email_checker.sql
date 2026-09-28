-- Email checking, in the database, so every caller shares one rulebook.
--
-- The logic already exists in src/lib/email/validate.ts and is good. The
-- problem is WHERE it lives: TypeScript in src/ cannot be imported by an edge
-- function (Deno) and cannot be reached by the app at all, so the typo check
-- is advisory on web and absent everywhere else. `gmail.con` is shown to the
-- buyer as a hint, ignored, and accepted.
--
-- Putting it here gives exactly one implementation that web server actions,
-- edge functions and the app can all reach, and a domain list that can be
-- corrected without shipping a deploy. The TypeScript stays as the instant
-- client-side hint; this is the copy that gets to say no.

-- ---------------------------------------------------------------------------
-- The domain list
-- ---------------------------------------------------------------------------
-- A table rather than a hardcoded array for one reason that matters: the first
-- time a real buyer on an unlisted domain gets told their address looks wrong,
-- the fix must be an INSERT, not a release.

create table if not exists public.email_known_domains (
    domain      text primary key,
    note        text,
    created_at  timestamptz not null default now()
);

comment on table public.email_known_domains is
    'Domains our buyers demonstrably use. A typed domain found here is always accepted as-is and never draws a typo suggestion. Add to this table when a legitimate address is wrongly flagged — it needs no deploy.';

alter table public.email_known_domains enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'email_known_domains'
          and policyname = 'email_known_domains_readable'
    ) then
        -- Readable by everyone: it is a list of public mail providers, and the
        -- checker has to work for a guest with no session.
        create policy email_known_domains_readable
            on public.email_known_domains for select
            using (true);
    end if;
end $$;

-- Mirrors KNOWN_DOMAINS in src/lib/email/validate.ts at the time of writing.
-- The PH entries are load-bearing, not decoration: ymail.com is one edit from
-- gmail.com and yahoo.com.ph is three from yahoo.com, so without them the
-- suggester "corrects" real addresses belonging to real buyers.
insert into public.email_known_domains (domain, note) values
    ('gmail.com',                 'consumer'),
    ('yahoo.com',                 'consumer'),
    ('icloud.com',                'consumer'),
    ('me.com',                    'consumer'),
    ('mac.com',                   'consumer'),
    ('outlook.com',               'consumer'),
    ('hotmail.com',               'consumer'),
    ('live.com',                  'consumer'),
    ('msn.com',                   'consumer'),
    ('ymail.com',                 'consumer — one edit from gmail.com, must never be corrected'),
    ('rocketmail.com',            'consumer'),
    ('aol.com',                   'consumer'),
    ('proton.me',                 'consumer'),
    ('protonmail.com',            'consumer'),
    ('gmx.com',                   'consumer'),
    ('zoho.com',                  'consumer'),
    ('fastmail.com',              'consumer'),
    ('privaterelay.appleid.com',  'Apple Hide My Email — common here, never correct it'),
    ('yahoo.com.ph',              'PH consumer'),
    ('gmail.com.ph',              'PH consumer'),
    ('up.edu.ph',                 'PH academic'),
    ('dlsu.edu.ph',               'PH academic'),
    ('admu.edu.ph',               'PH academic'),
    ('ust.edu.ph',                'PH academic'),
    ('ess.edu.ph',                'PH academic'),
    ('feu.edu.ph',                'PH academic'),
    ('mapua.edu.ph',              'PH academic'),
    ('addu.edu.ph',               'PH academic'),
    ('usc.edu.ph',                'PH academic'),
    ('hanghut.com',               'ours')
on conflict (domain) do nothing;

-- ---------------------------------------------------------------------------
-- Normalisation
-- ---------------------------------------------------------------------------
-- Strips the wrapping a paste leaves behind and lowercases the domain.
-- '"Juan <juan@gmail.com>"' and ' JUAN@Gmail.Com ' both come out clean — a
-- stray '>' is exactly how 'gmail.com>' reached prod as a stored address.

create or replace function public.email_normalize(p_raw text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
    v text;
    v_at int;
begin
    v := btrim(coalesce(p_raw, ''));

    -- "Name <addr>" or a bare "<addr>"
    if v ~ '<[^<>]+>\s*$' then
        v := btrim((regexp_match(v, '<([^<>]+)>\s*$'))[1]);
    end if;

    v := regexp_replace(v, '^[<"''\s]+', '');
    v := regexp_replace(v, '[>"''\s.,;]+$', '');

    v_at := length(v) - position('@' in reverse(v)) + 1;
    if position('@' in v) = 0 then
        return v;
    end if;

    return substring(v from 1 for v_at - 1) || '@' || lower(substring(v from v_at + 1));
end;
$$;

-- ---------------------------------------------------------------------------
-- Structural check
-- ---------------------------------------------------------------------------
-- Returns a human-readable reason the address cannot be used, or NULL when it
-- is fine. Structure only — it cannot tell whether a mailbox exists. Messages
-- are written for the buyer, because that is who reads them.

create or replace function public.email_format_error(p_raw text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
    v_email  text;
    v_at     int;
    v_local  text;
    v_domain text;
begin
    v_email := public.email_normalize(p_raw);

    if v_email = '' or v_email is null then
        return 'Enter an email address';
    end if;
    if position('@' in v_email) = 0 then
        return 'That address is missing an @';
    end if;
    if (length(v_email) - length(replace(v_email, '@', ''))) > 1 then
        return 'That address has more than one @';
    end if;

    v_at     := length(v_email) - position('@' in reverse(v_email)) + 1;
    v_local  := substring(v_email from 1 for v_at - 1);
    v_domain := substring(v_email from v_at + 1);

    if v_local = '' then
        return 'Add the part before the @';
    end if;
    if v_domain = '' then
        return 'Add the part after the @';
    end if;
    if position('.' in v_domain) = 0 then
        return v_domain || ' is missing a .com or similar';
    end if;
    -- Same shape the edge functions enforce, so the paths agree on what an
    -- address even is.
    if v_email !~ '^[^\s@,;<>()\[\]\\]+@[^\s@,;<>()\[\]\\]+\.[A-Za-z]{2,}$' then
        return 'That doesn''t look like a valid email address';
    end if;
    if v_domain like '.%' or v_domain like '%.' or position('..' in v_domain) > 0 then
        return 'That address has a misplaced dot';
    end if;

    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Damerau-Levenshtein (optimal string alignment)
-- ---------------------------------------------------------------------------
-- Hand-written rather than fuzzystrmatch's levenshtein() for two reasons: the
-- extension is not installed on this project, and its distance does NOT count
-- a transposition as one edit. 'gmial.com' has to read as one slip from
-- 'gmail.com', not two, or the tight budget on short domains misses it.
--
-- This deliberately matches editDistance() in src/lib/email/validate.ts, so
-- the client hint and the server refusal can never disagree about closeness.

create or replace function public.email_edit_distance(p_a text, p_b text)
returns int
language plpgsql
immutable
set search_path to 'public'
as $$
declare
    m int := length(coalesce(p_a, ''));
    n int := length(coalesce(p_b, ''));
    -- Two rows would be cheaper, but a transposition needs to look back two.
    d int[][];
    i int;
    j int;
    cost int;
begin
    if m = 0 then return n; end if;
    if n = 0 then return m; end if;

    d := array_fill(0, array[m + 1, n + 1]);
    for i in 0..m loop d[i + 1][1] := i; end loop;
    for j in 0..n loop d[1][j + 1] := j; end loop;

    for i in 1..m loop
        for j in 1..n loop
            cost := case when substring(p_a from i for 1) = substring(p_b from j for 1)
                         then 0 else 1 end;
            d[i + 1][j + 1] := least(
                d[i][j + 1] + 1,          -- deletion
                d[i + 1][j] + 1,          -- insertion
                d[i][j] + cost            -- substitution
            );
            if i > 1 and j > 1
               and substring(p_a from i for 1)     = substring(p_b from j - 1 for 1)
               and substring(p_a from i - 1 for 1) = substring(p_b from j for 1) then
                d[i + 1][j + 1] := least(d[i + 1][j + 1], d[i - 1][j - 1] + cost);
            end if;
        end loop;
    end loop;

    return d[m + 1][n + 1];
end;
$$;

-- ---------------------------------------------------------------------------
-- The suggestion
-- ---------------------------------------------------------------------------
-- Returns the WHOLE corrected address so a caller can apply it in one tap, or
-- NULL when there is nothing confident to say. The local part is never
-- touched, and a typed domain is never rewritten silently: an over-eager
-- auto-correct is worse than the typo it replaces.

create or replace function public.email_suggest(p_raw text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
    v_email    text;
    v_at       int;
    v_local    text;
    v_domain   text;
    v_dot      int;
    v_name     text;
    v_match    text;
    v_matches  int;
    v_budget   int;
    v_best     text;
    v_best_d   int;
    v_ties     int;
begin
    v_email := public.email_normalize(p_raw);
    if public.email_format_error(v_email) is not null then
        return null;
    end if;

    v_at     := length(v_email) - position('@' in reverse(v_email)) + 1;
    v_local  := substring(v_email from 1 for v_at - 1);
    v_domain := substring(v_email from v_at + 1);

    -- A domain we know is correct by definition. This is also the fast path:
    -- no distances are computed for the overwhelming majority of addresses.
    if exists (select 1 from public.email_known_domains k where k.domain = v_domain) then
        return null;
    end if;

    -- Same name, wrong ending. 'gmail.on' sits TWO plain edits from
    -- 'gmail.com' (insert c, n->m) so a distance budget alone missed it — yet
    -- it is one of the typos actually costing us tickets. Matching the name and
    -- treating the ending separately catches that class exactly, without
    -- loosening the budget for everything else.
    v_dot := length(v_domain) - position('.' in reverse(v_domain)) + 1;
    if v_dot > 1 then
        v_name := substring(v_domain from 1 for v_dot - 1);
        select count(*), min(k.domain) into v_matches, v_match
        from public.email_known_domains k
        where split_part(k.domain, '.', 1) = v_name
          and position('.' in k.domain) > 0
          -- Compare the whole name before the LAST dot, not just the first
          -- label, so 'yahoo.com.ph' is matched on 'yahoo.com'.
          and substring(k.domain from 1 for
                length(k.domain) - position('.' in reverse(k.domain))) = v_name;
        if v_matches = 1 then
            return v_local || '@' || v_match;
        end if;
    end if;

    -- Tighter tolerance on short domains, where one edit can legitimately land
    -- on a different real company.
    v_budget := case when length(v_domain) >= 9 then 2 else 1 end;

    select k.domain, dist
    into v_best, v_best_d
    from (
        select k.domain, public.email_edit_distance(v_domain, k.domain) as dist
        from public.email_known_domains k
    ) k
    where k.dist > 0 and k.dist <= v_budget
    order by k.dist, k.domain
    limit 1;

    if v_best is null then
        return null;
    end if;

    -- Two equally-close candidates is a coin flip. Say nothing.
    select count(*) into v_ties
    from public.email_known_domains k
    where public.email_edit_distance(v_domain, k.domain) = v_best_d;

    if v_ties > 1 then
        return null;
    end if;

    return v_local || '@' || v_best;
end;
$$;

-- ---------------------------------------------------------------------------
-- The callable checkers
-- ---------------------------------------------------------------------------

-- One address. This is what the checkout path calls.
create or replace function public.check_email_address(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_norm  text := public.email_normalize(p_email);
    v_err   text := public.email_format_error(v_norm);
    v_sugg  text;
begin
    if v_err is null then
        v_sugg := public.email_suggest(v_norm);
    end if;

    return jsonb_build_object(
        'input',      p_email,
        'normalized', v_norm,
        -- 'ok' means structurally usable. A likely typo is still "ok" — it is
        -- a real address, just probably not the one they meant — so callers
        -- decide whether a suggestion is worth interrupting someone for.
        'ok',         v_err is null,
        'error',      v_err,
        'suggestion', v_sugg
    );
end;
$$;

comment on function public.check_email_address(text) is
    'Normalise + structurally validate one address and offer a typo correction. ok=false means unusable; ok=true with a suggestion means deliverable-looking but probably mistyped.';

-- Many addresses, for list checking before a campaign or an import.
--
-- Distances are computed once per DISTINCT DOMAIN rather than per address: a
-- 10,000-row list is typically a few dozen domains, which is the difference
-- between this returning instantly and timing out.
create or replace function public.check_email_addresses(p_emails text[])
returns table (
    input      text,
    normalized text,
    ok         boolean,
    error      text,
    suggestion text
)
language sql
stable
security definer
set search_path to 'public'
as $$
    with raw as (
        select e as input, public.email_normalize(e) as normalized
        from unnest(coalesce(p_emails, array[]::text[])) as e
    ),
    checked as (
        select r.input, r.normalized,
               public.email_format_error(r.normalized) as error,
               case
                   when position('@' in r.normalized) = 0 then null
                   else substring(r.normalized from
                        length(r.normalized) - position('@' in reverse(r.normalized)) + 2)
               end as domain
        from raw r
    ),
    -- One suggestion per distinct domain, not per row.
    domain_sugg as (
        select distinct c.domain,
               public.email_suggest('probe@' || c.domain) as probe
        from checked c
        where c.error is null and c.domain is not null
    )
    select c.input,
           c.normalized,
           c.error is null as ok,
           c.error,
           case
               when d.probe is null then null
               -- Re-attach this row's own local part to the corrected domain.
               else substring(c.normalized from 1 for
                        length(c.normalized) - position('@' in reverse(c.normalized)))
                    || '@'
                    || substring(d.probe from
                        length(d.probe) - position('@' in reverse(d.probe)) + 2)
           end as suggestion
    from checked c
    left join domain_sugg d on d.domain = c.domain;
$$;

comment on function public.check_email_addresses(text[]) is
    'Bulk email check for list import and pre-send review. Computes one suggestion per distinct domain, so a 10k list costs a few dozen distance calculations.';

grant execute on function public.email_normalize(text)         to anon, authenticated;
grant execute on function public.email_format_error(text)      to anon, authenticated;
grant execute on function public.email_edit_distance(text,text) to anon, authenticated;
grant execute on function public.email_suggest(text)           to anon, authenticated;
grant execute on function public.check_email_address(text)     to anon, authenticated;
grant execute on function public.check_email_addresses(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
