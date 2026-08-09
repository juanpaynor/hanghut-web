-- Reconcile: the funnel already lives in event_interactions. Drop the duplicate
-- tracking_events/record_tracking_event introduced in the previous migration, and
-- instead add acquisition ATTRIBUTION to the existing pipeline.
-- (purchase_intents/transactions.attribution from the previous migration are kept.)

drop function if exists public.record_tracking_event(uuid, text, text, text, text, text, text, text, jsonb);
drop table if exists public.tracking_events;

alter table public.event_interactions add column if not exists channel text;
alter table public.event_interactions add column if not exists utm_source text;
alter table public.event_interactions add column if not exists utm_medium text;
alter table public.event_interactions add column if not exists utm_campaign text;
alter table public.event_interactions add column if not exists referrer text;

create index if not exists idx_event_interactions_channel
    on public.event_interactions (event_id, channel);
