-- ============================================================================
-- Two asks from the app team (team_comms #292 / #293, approved in #294).
-- ============================================================================

-- 1. FEATURED BADGE SELECTION (app-writable)
--
-- The app lets a user curate which badges appear on their profile, up to 6.
-- That selection cannot live on user_creator_badges: that table is server-write
-- only by design, so a client cannot reorder or pick from it. It is a user
-- PREFERENCE, not an award record, so it belongs on the user.
--
-- No new RLS policy is needed — users already carries "Users can update own
-- profile" (auth.uid() = id), which covers this column for its owner and nobody
-- else. Web does not read this; it is the app's to own.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS featured_creator_badge_ids uuid[];

COMMENT ON COLUMN users.featured_creator_badge_ids IS
    'App-owned: badges the user has chosen to feature on their profile (max 6, ordered). Written by the app, not read by web. Holding a badge is recorded in user_creator_badges; this is only the display choice.';


-- 2. EMAIL EVENT -> USER RESOLUTION
--
-- email_events keys only on `recipient` (email text). Turning that into a taste
-- signal needs a user, and resolving it later with a fuzzy join is exactly what
-- must not happen: a normalised match can attribute one person's email clicks to
-- a different account, and a poisoned taste profile is not recoverable.
--
-- So the match is made ONCE, at insert (resend-webhook), and only when it is
-- exact and unambiguous. NULL is the correct value for "we do not confidently
-- know who this was" — the app has said it would rather have a null than a wrong
-- attribution, and so would we.
--
-- ON DELETE SET NULL: a deleted account must not delete the email history, but it
-- must stop pointing at a user id that no longer means anything.
ALTER TABLE email_events
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN email_events.user_id IS
    'Resolved at insert by EXACT lower(email) match, NULL when no confident match. Never fuzzy-matched after the fact — a wrong attribution poisons downstream taste profiles permanently.';

CREATE INDEX IF NOT EXISTS email_events_user_id_idx
    ON email_events (user_id) WHERE user_id IS NOT NULL;

-- Backfill, exact matches only, same rule as the insert path.
UPDATE email_events ee
   SET user_id = u.id
  FROM users u
 WHERE ee.user_id IS NULL
   AND ee.recipient IS NOT NULL
   AND lower(u.email) = lower(ee.recipient);
