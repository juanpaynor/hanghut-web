-- ============================================================================
-- Both badge tables were left with the project's default ACL: anon AND
-- authenticated held INSERT, UPDATE, DELETE and TRUNCATE.
--
-- RLS hides this most of the way -- neither table has a write POLICY, so
-- row-level DML is refused. But TRUNCATE is a TABLE-level privilege and RLS does
-- not gate it. Anyone holding the public anon key could have emptied
-- creator_badges (3 badges) and user_creator_badges (386 earned badges, which
-- are permanent by contract and have no other home).
--
-- This is the same trap this project has hit before: `pg_default_acl` on schema
-- public grants ALL on new relations to anon and authenticated, so every new
-- table needs an explicit REVOKE. The August creator_badges migration locked
-- down the FUNCTIONS and wrote the RLS policies, but never revoked the table
-- grants.
--
-- Awarding is SECURITY DEFINER only (grant_creator_badge / evaluate_creator_badge),
-- so no client has ever needed write access to user_creator_badges.
-- creator_badges IS organizer-writable through creator_badges_owner_rw, so
-- authenticated keeps row DML there -- but not TRUNCATE, which that policy
-- cannot restrain.
--
-- NOT CHANGED HERE, STILL OPEN: `user_creator_badges_public_read` is
-- USING (true) and anon retains SELECT, so every row -- including buyer_email --
-- is readable with the public anon key. Narrowing it to the holder's own rows is
-- the right fix, but the app owns the badge case and may read other people's
-- badges for "who else has this", so it needs their answer first rather than a
-- unilateral change that blanks a screen. Raised in team_comms.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_creator_badges FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.creator_badges FROM anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.creator_badges TO authenticated;
