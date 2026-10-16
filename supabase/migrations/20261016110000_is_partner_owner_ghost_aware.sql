-- is_partner_owner(): recognise the platform-support (ghost) seat.
--
-- getUserRole() in src/lib/auth/cached.ts promotes a platform-support seat to
-- role 'owner', so HangHut staff helping a partner can reach owner-gated pages
-- without taking the client's ownership away. RLS never learned that rule, and
-- is_partner_owner() asked the narrower question "are you partners.user_id?".
--
-- The two answers disagreed in a visible way on the Team page. Its two tables
-- are governed by different policies:
--
--   partner_team_members  -> is_partner_owner()            -> FALSE for a ghost
--   partner_invites       -> a team row with role in
--                            ('owner','manager')           -> TRUE  for a ghost
--                                                             (the seat is a
--                                                              manager)
--
-- So a staff member ghosting Upper Room Worship saw an EMPTY "Active Members"
-- table above a correctly populated "Pending Invites" table, on a page they
-- were allowed to open. The six scanners were there the whole time; the policy
-- simply would not return them.
--
-- Fixing the function rather than the policy keeps ONE definition of owner.
-- Only two policies call it, so the whole blast radius is:
--
--   partner_team_members  "Owners can manage team members"        (ALL)
--   support_tickets       "View own, owned-partner, or as agent"  (SELECT)
--
-- Both widen to platform-support seats, which is the already-stated intent of
-- that seat: it is owner-equivalent in the web app. Note the first is ALL, so
-- a ghost can now add and remove team members, not merely see them.
--
-- Partner-OWNED access is unchanged: the original EXISTS is still the first
-- branch, so no partner loses anything.

CREATE OR REPLACE FUNCTION public.is_partner_owner(p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p_partner_id IS NOT NULL
       AND (
            EXISTS (
                SELECT 1 FROM partners
                 WHERE id = p_partner_id
                   AND user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM partner_team_members
                 WHERE partner_id = p_partner_id
                   AND user_id = auth.uid()
                   AND is_platform_support = true
            )
       );
$function$;
