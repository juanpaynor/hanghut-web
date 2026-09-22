-- Make the registration RPCs aware of questions that are legitimately absent.
--
-- Before this, submit_event_request required EVERY question with
-- is_required = true. The moment a question can be hidden — because it belongs
-- to another tier, or because its controlling answer wasn't given — that rule
-- blocks the buyer on a question they were never shown. Nothing in the UI can
-- work around it; the gate is in the RPC.
--
-- Also adds upsert_registration_answers, because a tier-scoped question is
-- asked AFTER the registration already exists (the buyer registers, then picks
-- a tier) and submit_event_request's resubmit branch deletes every existing
-- answer before rewriting — which would throw away what the register step
-- collected.

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
        RAISE EXCEPTION 'Event not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_event.status NOT IN ('active', 'hidden') THEN
        RAISE EXCEPTION 'Event is not accepting registrations (status: %)', v_event.status
            USING ERRCODE = 'P0003';
    END IF;

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
            RETURN jsonb_build_object(
                'registration_id', v_existing.id,
                'status', 'pending',
                'require_approval', (v_event.require_approval OR v_event.invite_only),
                'resubmitted', true
            );
        END IF;

        IF v_existing.status NOT IN ('approved', 'auto_approved') THEN
            RAISE EXCEPTION 'You have already registered for this event'
                USING ERRCODE = 'P0004';
        END IF;

        v_registration_id := v_existing.id;
        v_status := v_existing.status;
    END IF;

    -- Which required questions actually APPLY to this submission.
    --
    -- Two kinds of question are legitimately absent and must not be treated as
    -- missing, or the buyer is blocked by a question they were never shown:
    --
    --   * TIER-SCOPED — pinned to specific tiers. With no tier yet (the
    --     pre-checkout register step passes none) it is not asked here at all;
    --     checkout asks it once the tier is known.
    --   * CONDITIONAL — only shown when its controlling question holds one of
    --     the triggering answers, judged against THIS submission's answers.
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
                        -- Plain answer, or one entry of a multi_choice answer,
                        -- which is stored as a JSON array inside a text column.
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

    IF v_registration_id IS NULL THEN
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

        INSERT INTO event_registrations (
            event_id, user_id, guest_email, guest_name, tier_id, status
        )
        VALUES (
            p_event_id, v_user_id, p_guest_email, p_guest_name, p_tier_id, v_status
        )
        RETURNING id INTO v_registration_id;
    ELSE
        UPDATE event_registrations
        SET guest_name = COALESCE(p_guest_name, guest_name),
            tier_id    = COALESCE(p_tier_id, tier_id),
            updated_at = now()
        WHERE id = v_registration_id;

        DELETE FROM registration_answers WHERE registration_id = v_registration_id;
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


CREATE OR REPLACE FUNCTION public.upsert_registration_answers(
    p_registration_id uuid,
    p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_event_id UUID;
    v_saved INT := 0;
BEGIN
    -- Attach answers to a registration that already exists.
    --
    -- Needed because tier-scoped questions cannot be asked at the same moment
    -- as the rest: the buyer registers first, picks a tier second. Checkout
    -- collects the tier's own questions and lands them here rather than
    -- re-running submit_event_request, which wipes and rewrites every answer
    -- and would therefore destroy the ones given at the register step.
    SELECT event_id INTO v_event_id
    FROM event_registrations
    WHERE id = p_registration_id;

    IF v_event_id IS NULL THEN
        RAISE EXCEPTION 'Registration not found' USING ERRCODE = 'P0002';
    END IF;

    -- Answering again replaces, never duplicates.
    DELETE FROM registration_answers ra
    WHERE ra.registration_id = p_registration_id
      AND ra.question_id IN (
          SELECT (a->>'question_id')::UUID
          FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
          WHERE a->>'question_id' IS NOT NULL
      );

    -- The join to registration_questions is the guard: a caller can only answer
    -- questions that belong to THIS registration's event.
    INSERT INTO registration_answers (registration_id, question_id, answer)
    SELECT
        p_registration_id,
        q.id,
        CASE
            WHEN jsonb_typeof(a->'answer') = 'string' THEN a->>'answer'
            ELSE (a->'answer')::TEXT
        END
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
    JOIN registration_questions q
      ON q.id = (a->>'question_id')::UUID
     AND q.event_id = v_event_id
    WHERE a->>'answer' IS NOT NULL
      AND trim(a->>'answer') <> '';

    GET DIAGNOSTICS v_saved = ROW_COUNT;

    RETURN jsonb_build_object('saved', v_saved);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_registration_answers(uuid, jsonb) TO anon, authenticated;
