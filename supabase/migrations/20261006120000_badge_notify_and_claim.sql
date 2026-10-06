-- ============================================================================
-- Badges: tell people they earned one, and attach badges to accounts.
--
-- 386 badges had been awarded on prod and not one holder was ever told: there
-- was no trigger on user_creator_badges, no push, no email. Worse, 351 of them
-- (91%) are keyed to an email with no account attached, and
-- claim_creator_badges_for_user() -- written in August for exactly that case --
-- was called by nothing at all (verified against pg_proc.prosrc across the
-- whole schema, and against the app and web source).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. notified_at -- RESERVED, nothing reads it.
--
-- Badge notification is PUSH-ONLY by decision (2026-10-06): no award email
-- exists and none is planned. The in-app notification has its own durable
-- record in `notifications`, so this column has no consumer today.
--
-- It is kept for one reason: the backfill below. Every one of the 386
-- pre-existing rows is stamped, so an email sender added later cannot read
-- "notified_at IS NULL" against virgin rows and mail all 386 holders about
-- badges they earned weeks ago -- 306 of them for a single KOOLPALS badge.
-- Doing that now costs nothing; doing it at 386,000 rows would not.
-- ---------------------------------------------------------------------------
ALTER TABLE user_creator_badges
    ADD COLUMN IF NOT EXISTS notified_at timestamptz;

UPDATE user_creator_badges
   SET notified_at = earned_at
 WHERE notified_at IS NULL;

COMMENT ON COLUMN user_creator_badges.notified_at IS
    'Reserved. Badge award notification is PUSH-ONLY by decision (2026-10-06) -- there is no award email and no sender reads this. Kept because all 386 pre-existing rows are backfilled to earned_at, so if an email path is ever built it cannot blast historical holders on its first run.';

CREATE INDEX IF NOT EXISTS user_creator_badges_unnotified_idx
    ON user_creator_badges (earned_at) WHERE notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Has this badge had its retroactive sweep yet?
--
-- The engine is a pure function over history, so the FIRST evaluation of a new
-- badge awards everyone who already qualified -- that is how one KOOLPALS badge
-- reached 306 holders in a single statement. Notifying on that sweep would be a
-- 306-message blast about something nobody just did. So: the first sweep is
-- silent, every award after it notifies.
--
-- An organizer who wants to announce a new badge has email campaigns for that,
-- which is the right tool for a deliberate blast.
--
-- Backfilled to created_at for the three live badges: they have already had
-- their sweep, so their NEXT award is a real one and should notify.
-- ---------------------------------------------------------------------------
ALTER TABLE creator_badges
    ADD COLUMN IF NOT EXISTS first_evaluated_at timestamptz;

UPDATE creator_badges
   SET first_evaluated_at = created_at
 WHERE first_evaluated_at IS NULL;

COMMENT ON COLUMN creator_badges.first_evaluated_at IS
    'When the engine first swept this badge. NULL means the retroactive sweep has not run, and awards from it are deliberately NOT notified. Set by evaluate_creator_badge().';

-- ---------------------------------------------------------------------------
-- 3. Notify on award.
--
-- STATEMENT-level with a transition table, not FOR EACH ROW. The engine inserts
-- a badge's entire qualifying set in one statement; a row-level trigger would
-- mean 306 separate trigger invocations and 306 separate pgmq sends inside one
-- transaction. This is one set-based INSERT regardless of batch size.
--
-- Push comes free: trigger_notifications_webhook already fires on every
-- notifications row and enqueues pgmq 'push_notifications'. Nothing new is
-- needed for push, and nothing here should duplicate it. Push IS the whole
-- delivery mechanism -- see note 1 on why there is no email.
--
-- Note which fields actually reach the device: handle_notifications_webhook
-- forwards only type, notification_id, entity_id and (when present) kind.
-- badge_id, organizer_id, tier and claimed live on the notifications ROW, not
-- in the push payload, so a client that wants them reads the row.
--
-- type = 'badge_earned' is ALREADY in notifications_type_check (the app's older
-- global badge system claimed it and never used it -- zero rows exist). It is
-- reused rather than extended so the CHECK constraint is untouched, and
-- metadata.kind = 'creator_badge' disambiguates which table entity_id points at.
-- handle_notifications_webhook already forwards metadata->>'kind' into the push
-- payload, which is the mechanism built for exactly this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_creator_badge_awards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, entity_id, title, body, metadata)
    SELECT nr.user_id,
           'badge_earned',
           b.id,
           'You earned ' || b.name,
           COALESCE(p.business_name, 'An organizer')
               || ' awarded you the ' || b.name || ' badge.',
           jsonb_build_object(
               'kind',         'creator_badge',
               'badge_id',     b.id,
               'organizer_id', b.organizer_id,
               'tier',         b.tier
           )
      FROM new_rows nr
      JOIN creator_badges b ON b.id = nr.badge_id
      LEFT JOIN partners p  ON p.id = b.organizer_id
     WHERE nr.user_id IS NOT NULL          -- email-only holders: the email path
       AND b.is_active
       -- A hand-granted badge always notifies: the organizer just did it
       -- deliberately to one person. An auto award only notifies once the
       -- badge's retroactive sweep is behind it.
       AND (nr.grant_type <> 'auto' OR b.first_evaluated_at IS NOT NULL);

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    -- Never let a notification failure roll back the award itself, or take the
    -- whole hourly sweep with it. Warn so it is visible in logs rather than
    -- silently swallowed.
    RAISE WARNING 'notify_creator_badge_awards failed: %', SQLERRM;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_notify_creator_badge_awards
    AFTER INSERT ON public.user_creator_badges
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.notify_creator_badge_awards();

-- ---------------------------------------------------------------------------
-- 4. Notify on claim.
--
-- Separate from the award trigger because an INSERT trigger has no OLD TABLE to
-- reference -- the two cannot share one function. This is the moment a badge
-- earned as a guest becomes visible to a real account, which for 91% of holders
-- is the only moment they could ever learn about it.
--
-- The first_evaluated_at suppression deliberately does NOT apply here: a claim
-- is one person signing up, never a blast, so an old badge is still news to them.
--
-- No column list on the trigger: Postgres rejects "UPDATE OF user_id" together
-- with transition tables ("transition tables cannot be specified for triggers
-- with column lists"). The NULL -> non-NULL predicate below is what actually
-- selects claims, so firing on every UPDATE costs nothing -- the only other
-- writer to this table is the notified_at stamp, which the predicate excludes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_creator_badge_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, entity_id, title, body, metadata)
    SELECT nr.user_id,
           'badge_earned',
           b.id,
           'You earned ' || b.name,
           COALESCE(p.business_name, 'An organizer')
               || ' awarded you the ' || b.name || ' badge.',
           jsonb_build_object(
               'kind',         'creator_badge',
               'badge_id',     b.id,
               'organizer_id', b.organizer_id,
               'tier',         b.tier,
               'claimed',      true
           )
      FROM new_rows nr
      JOIN old_rows o        ON o.id = nr.id
      JOIN creator_badges b  ON b.id = nr.badge_id
      LEFT JOIN partners p   ON p.id = b.organizer_id
     WHERE o.user_id IS NULL
       AND nr.user_id IS NOT NULL
       AND b.is_active;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_creator_badge_claims failed: %', SQLERRM;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_notify_creator_badge_claims
    AFTER UPDATE ON public.user_creator_badges
    REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.notify_creator_badge_claims();

-- ---------------------------------------------------------------------------
-- 5. Stamp the sweep.
--
-- Set AFTER the insert, so the trigger above still sees NULL during the first
-- sweep and stays quiet for it. Unchanged otherwise -- replaced verbatim from
-- the live definition plus these four lines.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_creator_badge(p_badge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_badge   record;
    v_awarded integer;
BEGIN
    SELECT b.id, b.criteria, b.organizer_id, b.is_active
      INTO v_badge
      FROM creator_badges b
     WHERE b.id = p_badge_id;

    IF v_badge IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;

    IF v_badge.criteria->>'type' = 'manual_grant' THEN
        RETURN jsonb_build_object('success', true, 'awarded', 0, 'skipped', 'manual_grant');
    END IF;

    IF v_badge.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', true, 'awarded', 0, 'skipped', 'inactive');
    END IF;

    -- Badges are PERMANENT (#239): never revoked, even if a later refund drops
    -- someone under the threshold. So this only ever inserts.
    INSERT INTO user_creator_badges (badge_id, user_id, buyer_email, grant_type, granted_by)
    SELECT p_badge_id, u.id, q.buyer_email, 'auto', NULL
      FROM public.creator_badge_qualifying_emails(v_badge.organizer_id, v_badge.criteria) q
      LEFT JOIN LATERAL (
          SELECT id FROM users WHERE lower(email) = q.buyer_email LIMIT 1
      ) u ON true
    ON CONFLICT (badge_id, buyer_email) DO NOTHING;

    GET DIAGNOSTICS v_awarded = ROW_COUNT;

    -- Must come after the INSERT above: the notify trigger reads this column to
    -- tell a retroactive sweep from a live award, and it has to still be NULL
    -- while the sweep's own rows are landing.
    UPDATE creator_badges
       SET first_evaluated_at = now()
     WHERE id = p_badge_id
       AND first_evaluated_at IS NULL;

    -- Absolute recompute, never an increment.
    PERFORM public.recompute_badge_holder_count(p_badge_id);

    RETURN jsonb_build_object('success', true, 'awarded', v_awarded);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Claim badges onto an account.
--
-- public.users rows are inserted by application code, NOT by a trigger on
-- auth.users -- handle_new_user() exists but has no trigger attached to it, so
-- hooking auth.users would never fire. public.users is therefore the only
-- reliable place for this.
--
-- INSERT OR UPDATE OF email covers both signup and a later email change (a
-- guest who bought as one address and then sets that address on their account).
-- claim_creator_badges_for_user is left exactly as written in August; this only
-- calls it.
--
-- The exception handler is not optional: an unhandled error in an AFTER INSERT
-- trigger on users would abort the INSERT, which would mean badge claiming
-- could block a signup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_creator_badges_on_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
        PERFORM public.claim_creator_badges_for_user(NEW.id);
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'claim_creator_badges_on_user_email failed for %: %', NEW.id, SQLERRM;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_claim_creator_badges
    AFTER INSERT OR UPDATE OF email ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.claim_creator_badges_on_user_email();
