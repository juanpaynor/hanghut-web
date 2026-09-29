-- Multiple, separately-accepted Terms & Conditions documents per event.
--
-- WHY THIS IS NOT JUST A LONGER TEXT FIELD. Until now an event carried one
-- `custom_tos` blob behind one checkbox. A running organizer asked for three
-- documents -- participant terms, a declaration of fitness & participant
-- waiver, and a data privacy consent -- and that split is substantive, not
-- cosmetic. A fitness declaration folded into a generic "I accept the terms"
-- tick is a materially weaker record than one carrying its own affirmative
-- acceptance, and DPA consent is meant to be specific rather than bundled with
-- everything else the organizer wants agreed to.
--
-- `events.custom_tos` stays exactly as it is. It remains the organizer's
-- general terms; these documents are additional. Nothing already on sale
-- changes behaviour.

create table if not exists public.event_terms_documents (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    title text not null,
    body text not null,
    -- A document may be informational (privacy notice the buyer must see but
    -- need not tick). Required is the safe default: these are consents.
    is_required boolean not null default true,
    display_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint event_terms_documents_title_not_blank check (btrim(title) <> ''),
    constraint event_terms_documents_body_not_blank check (btrim(body) <> ''),
    -- Deliberately generous. The old 2,000-char cap silently truncated a real
    -- race waiver mid-sentence; a ceiling exists only to stop a runaway paste,
    -- not to shape anyone's legal text.
    constraint event_terms_documents_title_len check (length(title) <= 120),
    constraint event_terms_documents_body_len check (length(body) <= 100000)
);

create index if not exists event_terms_documents_event_order_idx
    on public.event_terms_documents (event_id, display_order);

alter table public.event_terms_documents enable row level security;

-- Buyers must be able to read what they are being asked to accept, and
-- checkout serves guests as well as signed-in users. Mirrors
-- registration_questions, which is public-read for the same reason.
drop policy if exists "Public can read event terms documents" on public.event_terms_documents;
create policy "Public can read event terms documents"
    on public.event_terms_documents for select using (true);

-- Ownership goes through partners.user_id to match the sibling policy on
-- registration_questions. Team members and platform-support (ghost) users edit
-- through the server action, which resolves via getActingPartnerId and writes
-- with the service role, so they are not locked out by this narrower policy.
drop policy if exists "Organizers can manage own event terms documents" on public.event_terms_documents;
create policy "Organizers can manage own event terms documents"
    on public.event_terms_documents for all using (
        event_id in (
            select e.id from public.events e
            where e.organizer_id in (
                select p.id from public.partners p where p.user_id = (select auth.uid())
            )
        )
    );

drop policy if exists "Admins can read all event terms documents" on public.event_terms_documents;
create policy "Admins can read all event terms documents"
    on public.event_terms_documents for select using (
        exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin = true)
    );

create or replace function public.touch_event_terms_documents()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists event_terms_documents_touch on public.event_terms_documents;
create trigger event_terms_documents_touch
    before update on public.event_terms_documents
    for each row execute function public.touch_event_terms_documents();

-- The acceptance record. `accepted_organizer_terms_text` already snapshots the
-- single custom_tos blob; this carries the per-document set alongside it, as a
-- snapshot of title+body at acceptance time rather than a reference -- a
-- pointer to a row the organizer can later edit is not evidence of what
-- somebody agreed to.
alter table public.purchase_intents
    add column if not exists accepted_terms_documents jsonb;

comment on column public.purchase_intents.accepted_terms_documents is
    'Snapshot array of {id, title, body, is_required} for each event terms document the buyer accepted. Snapshotted, not referenced: the organizer can edit the source rows afterwards.';
