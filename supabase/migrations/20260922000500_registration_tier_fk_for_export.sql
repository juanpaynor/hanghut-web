-- event_registrations.tier_id has always been a bare uuid with no foreign key.
--
-- Two consequences. It could point at a deleted tier with nothing to stop it,
-- and — the reason this surfaced — PostgREST cannot embed `tier:ticket_tiers(name)`
-- without a declared relationship, so the registrations CSV had no way to say
-- which ticket someone registered for.
--
-- That matters for a race: the shirt-size answers are collected to place a
-- supplier order, and an order has to be split by distance. 0 orphan rows at
-- the time of writing, so the constraint applies cleanly.
alter table public.event_registrations
    drop constraint if exists event_registrations_tier_id_fkey;
alter table public.event_registrations
    add constraint event_registrations_tier_id_fkey
    foreign key (tier_id) references public.ticket_tiers(id) on delete set null;

create index if not exists idx_event_registrations_tier_id
    on public.event_registrations (tier_id) where tier_id is not null;
