-- Teach the event_frames policy the app's real rule for "may manage this event".
--
-- The original policy asked only `partners.user_id = auth.uid()`. The dashboard
-- decides with getActingPartnerId(), which is owner-first and falls back to a
-- PLATFORM SUPPORT seat in partner_team_members -- so a support user passed the
-- server action and was then refused by the database:
--     new row violates row-level security policy for table "event_frames"
--
-- Widened to exactly the seats the dashboard already admits. A plain team
-- member who is not platform support is still refused, matching the helper.

alter policy "Organizers manage their own event frames"
    on public.event_frames
    using (
        exists (
            select 1
              from public.events e
              join public.partners p on p.id = e.organizer_id
             where e.id = event_frames.event_id
               and (
                    p.user_id = auth.uid()
                 or exists (
                        select 1 from public.partner_team_members tm
                         where tm.partner_id = p.id
                           and tm.user_id = auth.uid()
                           and tm.is_platform_support
                    )
               )
        )
    )
    with check (
        exists (
            select 1
              from public.events e
              join public.partners p on p.id = e.organizer_id
             where e.id = event_frames.event_id
               and (
                    p.user_id = auth.uid()
                 or exists (
                        select 1 from public.partner_team_members tm
                         where tm.partner_id = p.id
                           and tm.user_id = auth.uid()
                           and tm.is_platform_support
                    )
               )
        )
    );
