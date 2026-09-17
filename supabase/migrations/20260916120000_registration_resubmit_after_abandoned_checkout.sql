-- submit_event_request: let a buyer come back after an abandoned checkout.
--
-- The registration row is written BEFORE payment (auto_approved for events that
-- only ask questions). If the buyer then closes the tab, the next attempt hits the
-- duplicate check and is told "You have already registered for this event" —
-- with no way forward, because nothing ever issued a ticket against that row.
-- Guests (no auth.uid) and logged-in buyers on non-approval events both land here;
-- the event page's server-side pre-resolution only covers logged-in buyers on
-- gated events.
--
-- New behaviour when a live registration already exists for this identity:
--   * has a real ticket (valid/used/approved)  → still raise P0004 (they're going)
--   * status = pending                         → return it as pending (UI shows the
--                                                 "awaiting approval" state, not an error)
--   * rejected                                 → still raise (organizer said no)
--   * approved / auto_approved, no ticket      → REUSE it: replace the answers with
--                                                 the ones just submitted, refresh
--                                                 guest_name / tier, return the same
--                                                 registration_id so checkout continues
CREATE OR REPLACE FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid DEFAULT NULL::uuid, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_event RECORD;
    v_registration_id UUID;
    v_status TEXT;
    v_required_questions UUID[];
    v_answered_questions UUID[];
    v_missing UUID[];
    v_existing RECORD;
    v_has_ticket BOOLEAN;
    v_effective_email TEXT;
    v_invite_status TEXT;
BEGIN
    -- 1. Determine identity (auth.uid for logged-in, guest_email for guests)
    v_user_id := auth.uid();

    IF v_user_id IS NULL AND (p_guest_email IS NULL OR trim(p_guest_email) = '') THEN
        RAISE EXCEPTION 'Must provide guest_email if not authenticated'
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Load event + validate it's accepting registrations
    SELECT id, require_approval, invite_only, status, organizer_id
    INTO v_event
    FROM events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- Accept unlisted (hidden) events too — shareable by direct link, and the public
    -- event page renders them, so RSVPs/registrations must succeed.
    IF v_event.status NOT IN ('active', 'hidden') THEN
        RAISE EXCEPTION 'Event is not accepting registrations (status: %)', v_event.status
            USING ERRCODE = 'P0003';
    END IF;

    -- 3. Existing non-cancelled registration for this identity?
    IF v_user_id IS NOT NULL THEN
        SELECT id, status INTO v_existing
        FROM event_registrations
        WHERE event_id = p_event_id
          AND user_id = v_user_id
          AND status != 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1;
    ELSE
        SELECT id, status INTO v_existing
        FROM event_registrations
        WHERE event_id = p_event_id
          AND user_id IS NULL
          AND lower(guest_email) = lower(p_guest_email)
          AND status != 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_existing.id IS NOT NULL THEN
        -- A ticket actually issued against it means they're going; nothing to redo.
        -- `reserved` is an abandoned cart, not a ticket — see ticket-sold semantics.
        SELECT EXISTS (
            SELECT 1 FROM tickets
            WHERE registration_id = v_existing.id
              AND status IN ('valid', 'used', 'approved')
        ) INTO v_has_ticket;

        IF v_has_ticket THEN
            RAISE EXCEPTION 'You have already registered for this event'
                USING ERRCODE = 'P0004';
        END IF;

        IF v_existing.status = 'pending' THEN
            -- Still in the organizer's queue. Hand the caller the same "pending"
            -- shape a fresh submission would get so the UI shows the waiting state.
            RETURN jsonb_build_object(
                'registration_id', v_existing.id,
                'status', 'pending',
                'require_approval', (v_event.require_approval OR v_event.invite_only),
                'resubmitted', true
            );
        END IF;

        IF v_existing.status NOT IN ('approved', 'auto_approved') THEN
            -- rejected (or anything else terminal): the organizer decided.
            RAISE EXCEPTION 'You have already registered for this event'
                USING ERRCODE = 'P0004';
        END IF;

        -- approved / auto_approved with no ticket = abandoned checkout. Reuse the
        -- row so the buyer can carry on; their latest answers win.
        v_registration_id := v_existing.id;
        v_status := v_existing.status;
    END IF;

    -- 4. Validate all required questions are answered
    SELECT array_agg(id) INTO v_required_questions
    FROM registration_questions
    WHERE event_id = p_event_id AND is_required = true;

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

    IF v_registration_id IS NULL THEN
        -- 5. Determine status based on the event's access model.
        IF v_event.invite_only THEN
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

        -- 6. Insert registration
        INSERT INTO event_registrations (
            event_id, user_id, guest_email, guest_name, tier_id, status
        )
        VALUES (
            p_event_id, v_user_id, p_guest_email, p_guest_name, p_tier_id, v_status
        )
        RETURNING id INTO v_registration_id;
    ELSE
        -- Reused row: refresh what the buyer just told us and drop the old answers.
        UPDATE event_registrations
        SET guest_name = COALESCE(p_guest_name, guest_name),
            tier_id    = COALESCE(p_tier_id, tier_id),
            updated_at = now()
        WHERE id = v_registration_id;

        DELETE FROM registration_answers WHERE registration_id = v_registration_id;
    END IF;

    -- 7. Bulk insert answers
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
        WHERE a->>'question_id' IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'status', v_status,
        'require_approval', (v_event.require_approval OR v_event.invite_only),
        'resubmitted', (v_existing.id IS NOT NULL)
    );
END;
$function$;
