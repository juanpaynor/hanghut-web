-- ============================================================================
-- Stop buyer_email (362 distinct customer addresses) being readable with the
-- publishable anon key, WITHOUT narrowing the RLS policy.
--
-- Why not scope the policy to own-rows: the app's badge case is cross-profile.
-- user_profile_screen mounts CreatorBadgeCase(userId: <whoever you are viewing>)
-- and reads user_creator_badges for THAT user, so
-- `USING (user_id = auth.uid())` would blank the badge case on every profile but
-- your own (app confirmed in team_comms #353). The rows are fine to read; one
-- COLUMN is not.
--
-- CRITICAL MECHANIC -- a bare column REVOKE here is a NO-OP:
--
--     REVOKE SELECT (buyer_email) ON user_creator_badges FROM anon;   -- does nothing
--
-- anon and authenticated hold a TABLE-level SELECT, which implies every column,
-- and a column-level revoke cannot subtract from a table-level grant. Verified
-- on prod: after that statement has_column_privilege(...,'buyer_email') was
-- still true. The table grant must be dropped first and only the needed columns
-- granted back -- which is what this does.
--
-- Safe for both clients, checked rather than assumed:
--   app  — never selects buyer_email; both read sites name columns explicitly
--          ('id, earned_at, grant_type, badge:creator_badges(*)' and
--           'id, badge_id, earned_at, grant_type').
--   web  — zero references to user_creator_badges anywhere in src; every read
--          goes through a SECURITY DEFINER RPC, which runs as the owner and is
--          unaffected by these grants.
--
-- A `select('*')` from a client WILL now fail with 42501. That is the intended
-- trade and the reason the column list above matters: adding a column to this
-- table does not automatically expose it.
--
-- granted_by is excluded for the same reason — neither client reads it.
-- ============================================================================
REVOKE SELECT ON public.user_creator_badges FROM anon, authenticated;

GRANT SELECT (id, badge_id, user_id, earned_at, grant_type)
  ON public.user_creator_badges TO anon, authenticated;
