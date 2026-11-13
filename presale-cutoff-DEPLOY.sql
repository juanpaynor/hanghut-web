-- DEPLOY: presale list cutoff + stop the abandon job eating the list
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- TWO FIXES. Part 1 is urgent and was found while writing Part 2.
--
-- ===========================================================================
-- PART 1 -- WHY THIS IS URGENT
-- ===========================================================================
--
-- expire_stale_registrations() cancels any approved/auto_approved registration
-- on a PAID event that has not paid within events.abandon_unpaid_after_hours.
-- Verified on prod today: ALL 490 events have that column set (column default
-- 24, range 3..24). It is not an opt-in setting -- everybody has it.
--
-- A pre-registrant on a paid event matches every one of those conditions:
-- approved, unpaid, no ticket, not mid-checkout, event upcoming. They are
-- unpaid for the one reason the job cannot see -- THE PRESALE HAS NOT OPENED,
-- so paying was never possible. The job's premise is "they had the chance and
-- walked away". During a shut presale there was no chance.
--
-- So the list silently empties, and then:
--   * is_on_presale_list requires approved/auto_approved -> they are refused
--     at the till holding a link we mailed them
--   * presale_announcement_list filters the same way -> the on-sale email
--     goes to nobody and reports success
--   * presale_conversion's on_list count quietly falls to zero
--
-- This was 19 hours from happening on the live test event:
--   test prereg -- ticket_price 100.00, abandon_unpaid_after_hours 24,
--   2 auto_approved registrations created 2026-11-13 10:34, presale opens
--   2026-11-16. Both would have been cancelled on 14 Nov, two days before the
--   presale they were waiting for, and both scheduled emails would have found
--   an empty list.
--
-- THE FIX: start the abandon clock when the person could first BUY, not when
-- they registered. One expression, and provably a no-op without a presale --
-- coalesce(presale_starts_at, r.created_at) collapses greatest() back to
-- r.created_at, which is exactly today's condition for all 490 events.
--
-- Rollback for Part 1: re-run this file's PART 1 ROLLBACK block at the bottom.

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_stale_registrations()
RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count integer;
BEGIN
    WITH released AS (
        UPDATE event_registrations r
           SET status = 'cancelled',
               updated_at = now()
          FROM events e
         WHERE e.id = r.event_id
           AND e.abandon_unpaid_after_hours IS NOT NULL
           AND r.status IN ('auto_approved', 'approved')
           -- ⚠ THE CLOCK STARTS WHEN THEY COULD BUY, NOT WHEN THEY SIGNED UP.
           --
           -- This read `r.created_at < now() - interval`, which on a presale
           -- event cancels people for not paying during a window in which
           -- paying was impossible. A pre-registrant signs up weeks early BY
           -- DESIGN; the whole feature is "give us your details now, buy
           -- later".
           --
           -- coalesce(e.presale_starts_at, r.created_at) makes this identical
           -- to the previous behaviour on every event without a presale:
           -- greatest(r.created_at, r.created_at) IS r.created_at. With a
           -- presale, the person gets their full abandon window measured from
           -- the moment tickets actually opened to them.
           AND greatest(r.created_at,
                        coalesce(e.presale_starts_at, r.created_at))
               < now() - make_interval(hours => e.abandon_unpaid_after_hours)
           -- Upcoming only: rewriting a finished event's roster destroys the record.
           AND coalesce(e.end_datetime, e.start_datetime) > now()
           -- PAID registrations only. A free RSVP never produces a payment, so
           -- without this the job would wipe legitimate attendees (521 of them on
           -- one worship night alone). The chosen tier decides, falling back to the
           -- event price, so a free tier on a mixed event stays safe.
           AND (CASE
                    WHEN r.tier_id IS NOT NULL
                        THEN coalesce((SELECT t.price FROM ticket_tiers t WHERE t.id = r.tier_id), 0) > 0
                    ELSE coalesce(e.ticket_price, 0) > 0
                END)
           -- Never paid, by any route.
           AND NOT EXISTS (
                SELECT 1 FROM purchase_intents pi
                 WHERE pi.event_id = r.event_id
                   AND pi.status = 'completed'
                   AND ((r.user_id IS NOT NULL AND pi.user_id = r.user_id)
                        OR lower(pi.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
           -- Holds no live ticket by any route (box office, offline, comp).
           AND NOT EXISTS (
                SELECT 1 FROM tickets tk
                 WHERE tk.event_id = r.event_id
                   AND tk.status NOT IN ('cancelled', 'refunded', 'available')
                   AND ((r.user_id IS NOT NULL AND tk.user_id = r.user_id)
                        OR lower(tk.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
           -- Mid-checkout right now: releasing someone sitting on the GCash screen
           -- would break the payment they are in the middle of making.
           AND NOT EXISTS (
                SELECT 1 FROM purchase_intents pi
                 WHERE pi.event_id = r.event_id
                   AND pi.status = 'pending'
                   AND (pi.expires_at IS NULL OR pi.expires_at > now())
                   AND ((r.user_id IS NOT NULL AND pi.user_id = r.user_id)
                        OR lower(pi.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
        RETURNING r.id
    )
    SELECT count(*) INTO v_count FROM released;

    IF v_count > 0 THEN
        RAISE LOG 'Released % abandoned unpaid registration(s)', v_count;
    END IF;

    RETURN v_count;
END;
$function$;


-- ===========================================================================
-- PART 2 -- THE LIST CUTOFF, ENFORCED WHERE IT COUNTS
-- ===========================================================================
--
-- events.presale_registration_closes_at was written by the organizer panel and
-- read by exactly ONE thing: the event page's own JSX, which hides a button.
-- The app, an embedded widget, the public API and a browser tab left open all
-- reach submit_event_request directly, and it had no idea presale existed.
--
-- So "close the list when the presale opens" hid a button and promised
-- exclusivity it did not deliver. That is precisely the
-- subscriber_early_access_hours mistake -- a window enforced in one page and
-- nowhere else, therefore not enforced at all.
--
-- ⚠ ERRCODE IS P0006, NOT P0005. The plan said P0005; reading the live
-- function shows P0005 is already taken by "Required questions not answered".
-- Reusing it would make a closed list look like a validation error.
--
-- ⚠ EXISTING REGISTRANTS MUST STILL RESOLVE. The guard fires only on
-- v_eligibility = 'none' -- nobody with a pending, approved, auto_approved or
-- rejected row is touched, so a pre-registrant returning after the cutoff
-- still reaches their own place. Refusing them would mean the cutoff locks the
-- list out of its own presale.
--
-- Everything else below is the live definition, carried through unchanged.

CREATE OR REPLACE FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid DEFAULT NULL::uuid, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text)
 RETURNS jsonb
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

    -- presale_registration_closes_at added to the select for the cutoff guard
    -- below. Nothing else in this function reads it.
    SELECT id, require_approval, invite_only, status, organizer_id,
           presale_registration_closes_at
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

    -- >>> THE LIST CUTOFF <<<
    --
    -- Placed HERE because this is the earliest point at which the person's
    -- standing is known, and the whole rule turns on it: the door is shut to
    -- NEW people only.
    --
    -- 'none' is what event_registration_eligibility returns when it finds no
    -- non-cancelled row, so this refuses exactly the strangers and nobody who
    -- already holds a place.
    --
    -- Note what this does NOT do: it does not look at presale_starts_at. A
    -- cutoff with no presale date is meaningless, and the organizer action
    -- clears all three columns together when the feature is switched off, so a
    -- stale cutoff cannot outlive its presale.
    IF v_event.presale_registration_closes_at IS NOT NULL
       AND now() > v_event.presale_registration_closes_at
       AND v_eligibility = 'none' THEN
        RAISE EXCEPTION 'Registration for this event has closed'
            USING ERRCODE = 'P0006';
    END IF;

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

-- APPLIED 2026-11-13 via MCP apply_migration, which wrote its own ledger row:
--   version 20261113153607, name presale_cutoff_and_abandon_clock
-- The INSERT that used to sit here is therefore gone. Re-running this file by
-- hand would need a ledger row only if apply_migration were not used.

COMMIT;


-- ===========================================================================
-- VERIFY 1 -- the abandon job is a NO-OP on every event without a presale.
--
-- Re-runs the job's own date test both ways over every live registration it
-- could touch. differs must be 0: without presale_starts_at the new expression
-- collapses to r.created_at, which IS the old one.
-- ===========================================================================
SELECT count(*) AS rows_checked,
       count(*) FILTER (
           WHERE (r.created_at < now() - make_interval(hours => e.abandon_unpaid_after_hours))
              <> (greatest(r.created_at, coalesce(e.presale_starts_at, r.created_at))
                  < now() - make_interval(hours => e.abandon_unpaid_after_hours))
       ) AS differs
  FROM event_registrations r
  JOIN events e ON e.id = r.event_id
 WHERE e.presale_starts_at IS NULL
   AND r.status IN ('auto_approved', 'approved');

-- ===========================================================================
-- VERIFY 2 -- the presale list is now SAFE from the job.
--
-- Expect would_be_cancelled_before = 2 and would_be_cancelled_now = 0 for
-- "test prereg". Those are the two real registrations that were going to be
-- wiped on 14 Nov, two days before their own presale.
-- ===========================================================================
SELECT e.title,
       count(*) AS on_list,
       count(*) FILTER (
           WHERE r.created_at < now() - make_interval(hours => e.abandon_unpaid_after_hours)
       ) AS would_be_cancelled_before,
       count(*) FILTER (
           WHERE greatest(r.created_at, coalesce(e.presale_starts_at, r.created_at))
                 < now() - make_interval(hours => e.abandon_unpaid_after_hours)
       ) AS would_be_cancelled_now
  FROM event_registrations r
  JOIN events e ON e.id = r.event_id
 WHERE e.presale_starts_at IS NOT NULL
   AND r.status IN ('auto_approved', 'approved')
 GROUP BY e.title;

-- ===========================================================================
-- VERIFY 3 -- the cutoff is actually in the function, and P0005 is untouched.
-- Expect cutoff_guard > 0 and questions_code_intact > 0.
-- ===========================================================================
SELECT position('P0006' in pg_get_functiondef(p.oid)) AS cutoff_guard,
       position('Required questions not answered' in pg_get_functiondef(p.oid)) AS questions_code_intact
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'submit_event_request';


-- ===========================================================================
-- PART 1 ROLLBACK -- restores the abandon clock to r.created_at.
-- (Leaves Part 2 in place; they are independent.)
--
--   Re-run the function above with this line in place of the greatest(...):
--       AND r.created_at < now() - make_interval(hours => e.abandon_unpaid_after_hours)
--
-- PART 2 ROLLBACK -- drop the P0006 block and the extra select column. The
-- rest of submit_event_request in this file IS the pre-change definition, so
-- deleting those two edits restores it exactly.
-- ===========================================================================
