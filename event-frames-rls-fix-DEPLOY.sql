-- DEPLOY: make the event_frames RLS policy agree with the app's own rule
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- THE BUG, as reproduced on prod rather than reasoned about:
--
-- Uploading a frame failed with
--     new row violates row-level security policy for table "event_frames"
-- even though the server action had already authorised the caller.
--
-- The two disagreed. The app decides "may manage this event" with
-- getActingPartnerId(), which is owner-first and falls back to a PLATFORM
-- SUPPORT seat in partner_team_members. The policy I shipped asked only
--     partners.user_id = auth.uid()
-- which is exactly the comparison src/lib/organizer/attendee-actions.ts warns
-- about in a comment: "Comparing partners.user_id directly would lock out
-- ghost mode."
--
-- VERIFIED as the real signed-in user (443fe5a8, johninopatin31@gmail.com,
-- the support seat on Hex Fest), with RLS active:
--     partners owned by that user ........... 0
--     getActingPartnerId resolves to ........ c374c7bd (Hex Fest)
--     current policy allows ................. FALSE   <- the failure
--     policy below allows ................... TRUE
--
-- WHY FIX THE POLICY RATHER THAN THE APP: the established pattern elsewhere in
-- this codebase is to authorise in the server action and then write with the
-- service-role client, bypassing RLS (see terms-actions.ts:35-38). That works,
-- but it moves the rule out of the database and adds service-role surface --
-- a week after an audit found a function handing the service_role key to anon.
-- Teaching the policy the real rule keeps the database enforcing it, and makes
-- the policy correct rather than bypassed.
--
-- This is a WIDENING, not a loosening of who may act: it admits exactly the
-- seats the dashboard already admits, and nobody else. A plain team member who
-- is not platform support is still refused, matching getActingPartnerId.

BEGIN;

ALTER POLICY "Organizers manage their own event frames"
    ON public.event_frames
    USING (
        EXISTS (
            SELECT 1
              FROM public.events e
              JOIN public.partners p ON p.id = e.organizer_id
             WHERE e.id = event_frames.event_id
               AND (
                    p.user_id = auth.uid()
                 OR EXISTS (
                        SELECT 1
                          FROM public.partner_team_members tm
                         WHERE tm.partner_id = p.id
                           AND tm.user_id = auth.uid()
                           AND tm.is_platform_support
                    )
               )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.events e
              JOIN public.partners p ON p.id = e.organizer_id
             WHERE e.id = event_frames.event_id
               AND (
                    p.user_id = auth.uid()
                 OR EXISTS (
                        SELECT 1
                          FROM public.partner_team_members tm
                         WHERE tm.partner_id = p.id
                           AND tm.user_id = auth.uid()
                           AND tm.is_platform_support
                    )
               )
        )
    );

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY 1: the support seat can now act, and the owner still can.
-- Expect support_seat_allowed = true AND owner_allowed = true.
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"443fe5a8-531e-4263-9bca-027c266e5811","role":"authenticated"}';
SELECT EXISTS (
  SELECT 1 FROM public.events e JOIN public.partners p ON p.id = e.organizer_id
   WHERE e.id = 'fcd12279-0ee8-42a9-b783-05a10e957bb2'
     AND (p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.partner_team_members tm
                      WHERE tm.partner_id = p.id AND tm.user_id = auth.uid()
                        AND tm.is_platform_support))
) AS support_seat_allowed;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"12f3de21-914a-4967-bbe6-2913790a2aa1","role":"authenticated"}';
SELECT EXISTS (
  SELECT 1 FROM public.events e JOIN public.partners p ON p.id = e.organizer_id
   WHERE e.id = '9650bdf7-3dce-4faf-a407-e6ade364a264'
     AND (p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.partner_team_members tm
                      WHERE tm.partner_id = p.id AND tm.user_id = auth.uid()
                        AND tm.is_platform_support))
) AS owner_allowed;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- VERIFY 2: a STRANGER is still refused. This is the check that matters --
-- a widening that also admits everyone is not a fix. Expect false.
-- (3f22c2dd is the KOOLPALS support seat: a real support user, but not on
-- Hex Fest, so it proves the seat is scoped to its own partner.)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"3f22c2dd-ebbc-430a-bb40-328aee3f09bf","role":"authenticated"}';
SELECT EXISTS (
  SELECT 1 FROM public.events e JOIN public.partners p ON p.id = e.organizer_id
   WHERE e.id = 'fcd12279-0ee8-42a9-b783-05a10e957bb2'
     AND (p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.partner_team_members tm
                      WHERE tm.partner_id = p.id AND tm.user_id = auth.uid()
                        AND tm.is_platform_support))
) AS other_partners_support_seat_allowed;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- VERIFY 3: anon is untouched -- it still sees only approved + active frames.
-- Expect anon_sees_everything = false.
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE anon;
SELECT EXISTS (
  SELECT 1 FROM public.event_frames WHERE NOT is_active OR status <> 'approved'
) AS anon_sees_everything;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restores the owner-only rule, and the bug with it):
--
--   ALTER POLICY "Organizers manage their own event frames"
--       ON public.event_frames
--       USING (EXISTS (SELECT 1 FROM public.events e
--                        JOIN public.partners p ON p.id = e.organizer_id
--                       WHERE e.id = event_frames.event_id
--                         AND p.user_id = auth.uid()))
--       WITH CHECK (EXISTS (SELECT 1 FROM public.events e
--                             JOIN public.partners p ON p.id = e.organizer_id
--                            WHERE e.id = event_frames.event_id
--                              AND p.user_id = auth.uid()));
-- ---------------------------------------------------------------------------
