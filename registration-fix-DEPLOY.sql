-- ===========================================================================
-- DEPLOY — per-order registration submissions.
--
-- This is the MIGRATION ONLY. No test fixtures, no trigger disabling, no
-- harness. Verified by registration-fix-harness.sql: 10 passed, 0 failed,
-- against the real SINADYA RUN 2026 form (20 required answers per attendee).
--
-- Unlike the harness, this one COMMITS. That is the point.
--
-- The editor will warn about destructive operations. What it is flagging:
--   DROP INDEX event_registrations_unique_guest / _unique_user
--     -> these two indexes ARE the bug. They forbade a second registration
--        for one email on one event, which is why submit_event_request
--        overwrote the first attendee's answers instead of inserting. 0 rows
--        currently violate either; dropping them loses nothing.
--   UPDATE event_registrations
--     -> fills the new purchase_intent_id column only where it is NULL.
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--     -> additive, nullable, no table rewrite.
--
-- ROLLBACK, if checkout misbehaves after this:
--   1. Recreate the two dropped indexes (definitions at the bottom of this
--      file, commented out).
--   2. Restore the previous submit_event_request body -- it is in git at
--      supabase/migrations/, and the pre-deploy definition was captured in
--      the session transcript for 2026-10-17.
--   Nothing here deletes or rewrites existing registration or answer rows,
--   so a rollback loses no customer data.
-- ===========================================================================
BEGIN;

-- Per-order registration submissions.
--
-- THE BUG. `submit_event_request` resolved an existing registration by
-- (event_id, email) alone, took a "reuse" branch, and then ran
--
--     DELETE FROM registration_answers WHERE registration_id = v_registration_id;
--
-- before writing the new answers. That is correct for ONE PERSON BUYING AGAIN.
-- It is wrong for TWO PEOPLE SHARING AN INBOX, which on a fun run is the normal
-- case: spouses, a parent registering a child, one person entering the family.
-- The second submission destroyed the first attendee's entire answer set.
-- Confirmed destroyed on 6 orders across 4 events; rbalgos19@gmail.com on
-- SINADYA RUN 2026 lost a runner's singlet size, medical history and emergency
-- contact seven minutes after paying for them.
--
-- THE SPLIT. `event_registrations` was doing two unrelated jobs at once:
--
--   ELIGIBILITY  -- "is this person allowed to buy?" One answer per person per
--                   event. Rationed. This is what require_approval and
--                   invite_only exist to decide.
--   SUBMISSION   -- "here are the answers that came with this order." One per
--                   order, and never overwritten by a later one.
--
-- Identity is now a property of the SUBMISSION, and eligibility is a QUERY over
-- a person's submissions (`event_registration_eligibility`). Deliberately NOT
-- derived from require_approval/invite_only: those are access-control rules and
-- are used below only where access is actually being controlled -- the ration
-- guard. Whether a new row is created now depends solely on whether the
-- previous submission was CONSUMMATED (produced a ticket or a completed
-- intent), which is true or false regardless of how the event gates access.
--
-- PHASE 1 of 2. This migration touches the registration/answer path only. The
-- ticket-issuance half -- issue_tickets' duplicate guard keys on
-- registration_id and so silently issued NOTHING for a second order on a shared
-- registration -- is money path and ships separately.

-- ---------------------------------------------------------------------------
-- 1. Additive schema. Nullable, defaulted, no rewrite of existing rows.
-- ---------------------------------------------------------------------------

-- Which order this submission came with. The export's order reference, and the
-- thing that makes "one submission per order" legible rather than implied by
-- row count. Stamped by issue_tickets in phase 2; backfilled from tickets below.
ALTER TABLE public.event_registrations
    ADD COLUMN IF NOT EXISTS purchase_intent_id uuid
        REFERENCES public.purchase_intents(id) ON DELETE SET NULL;

-- OPTION B HOOK. NULL means "this answer applies to the whole order", which is
-- every answer today and stays the default. Non-NULL means "this is THIS
-- attendee's answer" -- per-attendee forms, later, with no migration of the
-- rows written before it. The column is the entire forward-compatibility story;
-- nothing reads it yet.
ALTER TABLE public.registration_answers
    ADD COLUMN IF NOT EXISTS ticket_id uuid
        REFERENCES public.tickets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_event_registrations_purchase_intent
    ON public.event_registrations(purchase_intent_id)
    WHERE purchase_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_answers_ticket
    ON public.registration_answers(ticket_id)
    WHERE ticket_id IS NOT NULL;

-- An answer is one value per (submission, question, attendee). There was no
-- constraint at all, so a double-write produced two rows for one question and
-- the export picked whichever came back first. NULLS NOT DISTINCT makes the
-- order-level case (ticket_id IS NULL) collide correctly -- without it every
-- order-level answer would be exempt from the constraint, which is all of them.
-- Verified 0 violating groups on prod before writing this.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_registration_answer_per_attendee
    ON public.registration_answers(registration_id, question_id, ticket_id)
    NULLS NOT DISTINCT;

-- THE SCHEMA-LEVEL CAUSE. Two partial unique indexes enforced ONE REGISTRATION
-- PER PERSON PER EVENT:
--
--   event_registrations_unique_guest  (event_id, lower(guest_email))
--                                     WHERE user_id IS NULL AND status <> 'cancelled'
--   event_registrations_unique_user   (event_id, user_id)
--                                     WHERE user_id IS NOT NULL AND status <> 'cancelled'
--
-- The DELETE in submit_event_request was never a careless choice. It was the
-- only move available: the function COULD NOT insert a second row for the same
-- email, so overwriting the first attendee's answers was its sole way to record
-- the second. Fixing the function without fixing these indexes just converts
-- silent data loss into a 23505 at checkout -- which is exactly what the
-- regression harness caught before this ever reached production.
--
-- They are dropped, not relaxed, because the invariant they encode is the one
-- that is wrong. Verified before dropping: 0 rows currently violate either.
DROP INDEX IF EXISTS public.event_registrations_unique_guest;
DROP INDEX IF EXISTS public.event_registrations_unique_user;

-- What replaces them is the NEW model's real invariant: one submission per
-- ORDER. A person may hold many submissions on an event; an order may carry
-- exactly one. Verified: 0 orders currently map to more than one registration.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_registration_per_order
    ON public.event_registrations(purchase_intent_id)
    WHERE purchase_intent_id IS NOT NULL;

COMMENT ON COLUMN public.event_registrations.purchase_intent_id IS
    'The order this submission accompanied. NULL for legacy rows and for a submission that has not reached checkout yet.';
COMMENT ON COLUMN public.registration_answers.ticket_id IS
    'NULL = answer applies to the whole order (current behaviour). Non-NULL = per-attendee answer, for per-attendee forms.';

-- Backfill the order reference from the tickets that already carry both ids.
-- Read-only in effect: it fills a column nothing has read yet.
UPDATE public.event_registrations r
   SET purchase_intent_id = sub.intent_id
  FROM (
        SELECT DISTINCT ON (t.registration_id)
               t.registration_id, t.purchase_intent_id AS intent_id
          FROM public.tickets t
         WHERE t.registration_id IS NOT NULL
           AND t.purchase_intent_id IS NOT NULL
         ORDER BY t.registration_id, t.created_at
       ) sub
 WHERE r.id = sub.registration_id
   AND r.purchase_intent_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Eligibility, as a question you can ask about a PERSON.
-- ---------------------------------------------------------------------------
-- Returns the person's strongest standing on this event, independent of which
-- submission row you happen to be holding. 'none' when they have never
-- submitted. This is what replaces "find the one registration row and read its
-- status" -- the assumption that there IS only one row is exactly what broke.
CREATE OR REPLACE FUNCTION public.event_registration_eligibility(
    p_event_id    uuid,
    p_user_id     uuid,
    p_guest_email text
) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(
        (SELECT r.status
           FROM event_registrations r
          WHERE r.event_id = p_event_id
            AND r.status <> 'cancelled'
            AND (
                 (p_user_id IS NOT NULL AND r.user_id = p_user_id)
              OR (p_user_id IS NULL
                  AND r.user_id IS NULL
                  AND p_guest_email IS NOT NULL
                  AND lower(r.guest_email) = lower(p_guest_email))
            )
          ORDER BY CASE r.status
                     WHEN 'approved'      THEN 1
                     WHEN 'auto_approved' THEN 1
                     WHEN 'pending'       THEN 2
                     WHEN 'rejected'      THEN 3
                     ELSE 4
                   END,
                   r.created_at DESC
          LIMIT 1),
        'none'
    );
$$;

COMMENT ON FUNCTION public.event_registration_eligibility(uuid, uuid, text) IS
    'A person''s strongest standing on an event: approved | auto_approved | pending | rejected | none. Access control, deliberately separate from which submission row an order is attached to.';

-- Does this PERSON hold a live ticket for this event, by any route?
--
-- The ration on approval-gated events used to ask "does THIS REGISTRATION ROW
-- hold a ticket". Once there is a row per order, a fresh row holds none by
-- definition -- so asked that way the ration would evaporate and an
-- approval-only event would become unlimited. It has to be asked about the
-- person. Matches on user_id or email so box office, offline and comp tickets
-- count too.
CREATE OR REPLACE FUNCTION public.person_holds_event_ticket(
    p_event_id    uuid,
    p_user_id     uuid,
    p_guest_email text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM tickets t
         WHERE t.event_id = p_event_id
           AND t.status::text IN ('valid', 'used')
           AND (
                (p_user_id IS NOT NULL AND t.user_id = p_user_id)
             OR (p_guest_email IS NOT NULL
                 AND lower(t.guest_email) = lower(p_guest_email))
           )
    );
$$;

COMMENT ON FUNCTION public.person_holds_event_ticket(uuid, uuid, text) IS
    'Whether a person already holds a live ticket for an event, across every submission and every sales channel. The ration guard for approval-gated events.';

REVOKE ALL ON FUNCTION public.event_registration_eligibility(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_holds_event_ticket(uuid, uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. submit_event_request: one submission per order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_event_request(
    p_event_id    uuid,
    p_answers     jsonb,
    p_tier_id     uuid    DEFAULT NULL::uuid,
    p_guest_email text    DEFAULT NULL::text,
    p_guest_name  text    DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id            UUID;
    v_event              RECORD;
    v_registration_id    UUID;
    v_status             TEXT;
    v_required_questions UUID[];
    v_answered_questions UUID[];
    v_missing            UUID[];
    v_effective_email    TEXT;
    v_invite_status      TEXT;
    v_eligibility        TEXT;
    v_open_id            UUID;
    v_pending_id         UUID;
    v_reused             BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL AND (p_guest_email IS NULL OR trim(p_guest_email) = '') THEN
        RAISE EXCEPTION 'Must provide guest_email if not authenticated'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT id, require_approval, invite_only, status, organizer_id
      INTO v_event
      FROM events
     WHERE id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_event.status NOT IN ('active', 'hidden') THEN
        RAISE EXCEPTION 'Event is not accepting registrations (status: %)', v_event.status
            USING ERRCODE = 'P0003';
    END IF;

    -- Serialise this person's submissions on this event.
    --
    -- The dropped unique indexes were doing double duty: they encoded the wrong
    -- business rule (one registration per person) but they also made the
    -- reuse-or-create decision below race-safe for free. Two concurrent submits
    -- would now both see no consummated row and both INSERT.
    --
    -- A transaction-scoped advisory lock restores that safety without
    -- reinstating the wrong rule: concurrent submissions for the same person
    -- and event queue up, so the second one sees the first one's row and reuses
    -- it. Released automatically on commit or rollback.
    PERFORM pg_advisory_xact_lock(
        hashtext(p_event_id::text),
        hashtext(COALESCE(v_user_id::text, lower(p_guest_email)))
    );

    -- The person's standing, asked once, about the person.
    v_eligibility := event_registration_eligibility(p_event_id, v_user_id, p_guest_email);

    -- RATION -- the one place require_approval/invite_only belong, because this
    -- IS the access-control decision. An approval-gated or invite-only event
    -- allows one ticket per person; a plain ticketed event allows as many as
    -- they want to buy. Asked about the PERSON, not about one submission row:
    -- a per-order row holds no tickets when it is created, so asking it about
    -- the row would silently remove the ration altogether.
    IF (v_event.require_approval OR v_event.invite_only)
       AND person_holds_event_ticket(p_event_id, v_user_id, p_guest_email) THEN
        RAISE EXCEPTION 'You have already registered for this event'
            USING ERRCODE = 'P0004';
    END IF;

    -- An approval request already in the queue is returned as-is. Stacking a
    -- second pending row would show the organizer the same person twice and
    -- make them review it twice.
    IF v_eligibility = 'pending' THEN
        SELECT r.id INTO v_pending_id
          FROM event_registrations r
         WHERE r.event_id = p_event_id
           AND r.status = 'pending'
           AND ((v_user_id IS NOT NULL AND r.user_id = v_user_id)
                OR (v_user_id IS NULL AND r.user_id IS NULL
                    AND lower(r.guest_email) = lower(p_guest_email)))
         ORDER BY r.created_at DESC
         LIMIT 1;

        RETURN jsonb_build_object(
            'registration_id', v_pending_id,
            'status',          'pending',
            'require_approval', (v_event.require_approval OR v_event.invite_only),
            'resubmitted',     true
        );
    END IF;

    -- Rejected stays rejected. Unchanged: the old function raised here too, via
    -- its "status NOT IN (approved, auto_approved)" branch.
    IF v_eligibility = 'rejected' THEN
        RAISE EXCEPTION 'You have already registered for this event'
            USING ERRCODE = 'P0004';
    END IF;

    -- Required-question validation. Carried through UNCHANGED from the previous
    -- definition -- tier-scoped and conditional questions are legitimately
    -- absent and must not read as missing.
    SELECT array_agg(q.id) INTO v_required_questions
      FROM registration_questions q
     WHERE q.event_id = p_event_id
       AND q.is_required = true
       AND (
           q.tier_ids IS NULL
           OR jsonb_typeof(q.tier_ids) <> 'array'
           OR jsonb_array_length(q.tier_ids) = 0
           OR (p_tier_id IS NOT NULL AND q.tier_ids ? p_tier_id::text)
       )
       AND (
           q.depends_on_question_id IS NULL
           OR EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
                WHERE (a->>'question_id') = q.depends_on_question_id::text
                  AND a->>'answer' IS NOT NULL
                  AND (
                      q.depends_on_values IS NULL
                      OR jsonb_typeof(q.depends_on_values) <> 'array'
                      OR jsonb_array_length(q.depends_on_values) = 0
                      OR EXISTS (
                          SELECT 1
                            FROM jsonb_array_elements_text(q.depends_on_values) AS dv
                           WHERE a->>'answer' = dv
                              OR position('"' || dv || '"' in a->>'answer') > 0
                      )
                  )
           )
       );

    IF v_required_questions IS NOT NULL AND array_length(v_required_questions, 1) > 0 THEN
        SELECT array_agg((value->>'question_id')::UUID) INTO v_answered_questions
          FROM jsonb_array_elements(p_answers)
         WHERE value->>'answer' IS NOT NULL
           AND trim(value->>'answer') != '';

        SELECT array_agg(q_id) INTO v_missing
          FROM unnest(v_required_questions) AS q_id
         WHERE q_id != ALL(COALESCE(v_answered_questions, ARRAY[]::UUID[]));

        IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
            RAISE EXCEPTION 'Required questions not answered: %', v_missing
                USING ERRCODE = 'P0005';
        END IF;
    END IF;

    -- >>> THE FIX <<<
    --
    -- Reuse a submission only when it is UNCONSUMMATED -- no live ticket, no
    -- completed order. That is the abandoned-cart resubmit this platform
    -- already supports, and replacing its answers destroys nothing because
    -- nothing was ever bought against them.
    --
    -- A submission that DID produce an order is finished. A later submission
    -- gets its own row and the earlier answers are never touched. That single
    -- change is what stops attendee two from erasing attendee one.
    --
    -- Note the second NOT EXISTS: it reads the intent's metadata as TEXT rather
    -- than casting to uuid, both to avoid a cast error on a malformed value and
    -- because tickets.registration_id is NULL on some orders (the phase-2 bug) --
    -- there the intent is the only surviving proof that the row was consummated.
    SELECT r.id INTO v_open_id
      FROM event_registrations r
     WHERE r.event_id = p_event_id
       AND r.status IN ('approved', 'auto_approved')
       AND ((v_user_id IS NOT NULL AND r.user_id = v_user_id)
            OR (v_user_id IS NULL AND r.user_id IS NULL
                AND lower(r.guest_email) = lower(p_guest_email)))
       AND NOT EXISTS (
            SELECT 1 FROM tickets t
             WHERE t.registration_id = r.id
               AND t.status::text IN ('valid', 'used')
       )
       AND NOT EXISTS (
            SELECT 1 FROM purchase_intents pi
             WHERE pi.status = 'completed'
               AND (pi.metadata->>'registration_id') = r.id::text
       )
       AND NOT EXISTS (
            SELECT 1 FROM purchase_intents pi2
             WHERE pi2.id = r.purchase_intent_id
               AND pi2.status = 'completed'
       )
     ORDER BY r.created_at DESC
     LIMIT 1;

    IF v_open_id IS NOT NULL THEN
        v_registration_id := v_open_id;
        v_reused := true;

        UPDATE event_registrations
           SET guest_name = COALESCE(p_guest_name, guest_name),
               tier_id    = COALESCE(p_tier_id, tier_id),
               updated_at = now()
         WHERE id = v_registration_id
        RETURNING status INTO v_status;

        -- Order-level answers only. A per-attendee answer (ticket_id NOT NULL)
        -- belongs to a ticket that was already issued, so it is not part of
        -- this unconsummated submission and must survive.
        DELETE FROM registration_answers
         WHERE registration_id = v_registration_id
           AND ticket_id IS NULL;
    ELSE
        -- Seed the new submission's status from the person's standing. A repeat
        -- buyer who was already approved stays approved -- they are not sent
        -- back through the queue for every ticket. Everyone else is gated
        -- exactly as a first-time registrant would be.
        IF v_eligibility IN ('approved', 'auto_approved') THEN
            v_status := 'approved';
        ELSIF v_event.invite_only THEN
            v_effective_email := COALESCE(
                (SELECT email FROM users WHERE id = v_user_id),
                p_guest_email
            );
            v_invite_status := is_email_invited(p_event_id, v_effective_email);
            IF v_invite_status IN ('invited', 'accepted') THEN
                v_status := 'approved';
            ELSE
                v_status := 'pending';
            END IF;
        ELSIF v_event.require_approval THEN
            v_status := 'pending';
        ELSE
            v_status := 'auto_approved';
        END IF;

        INSERT INTO event_registrations (
            event_id, user_id, guest_email, guest_name, tier_id, status
        ) VALUES (
            p_event_id, v_user_id, p_guest_email, p_guest_name, p_tier_id, v_status
        )
        RETURNING id INTO v_registration_id;
    END IF;

    IF p_answers IS NOT NULL AND jsonb_array_length(p_answers) > 0 THEN
        INSERT INTO registration_answers (registration_id, question_id, answer)
        SELECT
            v_registration_id,
            (a->>'question_id')::UUID,
            CASE
                WHEN jsonb_typeof(a->'answer') = 'string' THEN a->>'answer'
                ELSE (a->'answer')::TEXT
            END
          FROM jsonb_array_elements(p_answers) AS a
         WHERE a->>'question_id' IS NOT NULL
        ON CONFLICT (registration_id, question_id, ticket_id) DO UPDATE
            SET answer = EXCLUDED.answer;
    END IF;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'status',          v_status,
        'require_approval', (v_event.require_approval OR v_event.invite_only),
        'resubmitted',     v_reused,
        'new_submission',  NOT v_reused
    );
END;
$function$;

COMMENT ON FUNCTION public.submit_event_request(uuid, jsonb, uuid, text, text) IS
    'Records one form submission per order. Reuses a submission only while it is unconsummated (abandoned cart); a submission that produced an order is never rewritten. Eligibility is carried forward via event_registration_eligibility; the one-ticket ration for approval-gated events is enforced via person_holds_event_ticket.';


-- Record it in the ledger so the repo and the database agree, and so
-- `supabase db push` does not try to apply it a second time.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261014090000', 'per_order_registration_submissions')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK ONLY -- do not run as part of the deploy.
-- ---------------------------------------------------------------------------
-- CREATE UNIQUE INDEX event_registrations_unique_guest
--     ON public.event_registrations USING btree (event_id, lower(guest_email))
--     WHERE ((user_id IS NULL) AND (guest_email IS NOT NULL) AND (status <> 'cancelled'::text));
-- CREATE UNIQUE INDEX event_registrations_unique_user
--     ON public.event_registrations USING btree (event_id, user_id)
--     WHERE ((user_id IS NOT NULL) AND (status <> 'cancelled'::text));
-- NOTE: recreating these will FAIL if any attendee has by then legitimately
-- registered twice on one email. That failure is informative, not a problem:
-- it means the fix is already carrying real data the old schema cannot hold.
