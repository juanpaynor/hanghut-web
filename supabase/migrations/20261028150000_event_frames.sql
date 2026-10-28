-- Event story frames: a transparent 1080x1920 PNG an organizer supplies per
-- event, which the app composites over a user's photo and posts to their story
-- and to Instagram.
--
-- Shape agreed with the app team in team_comms #365-#370:
--
--  * created_by is users.id, NOT partner_id. Ownership is already derivable
--    (event_id -> events.organizer_id IS the partner), so this column records
--    the thing that cannot be reconstructed: which human uploaded it. That is
--    what makes "HangHut staff uploaded on behalf of a partner" auditable.
--    It is never the permission check -- permission comes from the event.
--
--  * SEVERAL rows per event, EXACTLY ONE active. A frame can never be edited in
--    place: stories already posted reference the frame they were made with, so
--    replacing art means a new row and rows necessarily accumulate. The partial
--    unique index below is what stops "which one is current" from being a guess.
--
--  * status defaults to 'pending'. The artwork leaves our surfaces entirely --
--    it lands on someone's Instagram next to the HangHut wordmark -- so nothing
--    an organizer uploads is live until a human approves it.

create table if not exists public.event_frames (
    id           uuid primary key default gen_random_uuid(),
    event_id     uuid not null references public.events(id) on delete cascade,
    name         text not null,
    image_url    text not null,
    status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
    is_active    boolean not null default false,
    active_from  timestamptz,
    active_until timestamptz,
    created_by   uuid references public.users(id) on delete set null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on column public.event_frames.created_by is
    'The human who uploaded this frame, for audit -- NOT the owner and never the '
    'permission check. Ownership is event_id -> events.organizer_id.';

-- The app reads `where event_id = ? and is_active and status = 'approved'` and
-- relies on this for uniqueness, so it never needs an ordering or a tie-break.
create unique index if not exists event_frames_one_active_per_event
    on public.event_frames (event_id) where is_active;

-- The app's read path.
create index if not exists event_frames_event_live
    on public.event_frames (event_id, status) where is_active;

alter table public.event_frames enable row level security;

-- Public read is deliberately narrow: approved AND active only, and the time
-- window when one is set. Enforced here rather than in the client, so it holds
-- whatever any caller asks for.
create policy "Anyone can read live frames"
    on public.event_frames for select
    using (
        is_active
        and status = 'approved'
        and (active_from is null or active_from <= now())
        and (active_until is null or active_until > now())
    );

-- The event's organizer sees and manages its own frames in every state.
create policy "Organizers manage their own event frames"
    on public.event_frames for all
    using (
        exists (
            select 1
            from public.events e
            join public.partners p on p.id = e.organizer_id
            where e.id = event_frames.event_id
              and p.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.events e
            join public.partners p on p.id = e.organizer_id
            where e.id = event_frames.event_id
              and p.user_id = auth.uid()
        )
    );

create trigger set_event_frames_updated_at
    before update on public.event_frames
    for each row execute function public.update_updated_at_column();

-- Storage. 2 MB and image/png are enforced here as well as in the form: the
-- form validation is a courtesy to the organizer, this is the actual limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-frames', 'event-frames', true, 2097152, array['image/png'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read event frame art"
    on storage.objects for select
    using (bucket_id = 'event-frames');

create policy "Authenticated can upload event frame art"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'event-frames');
