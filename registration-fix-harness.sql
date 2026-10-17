-- ===========================================================================
-- REGRESSION HARNESS v2 — SAFE TO RUN, DESTROYS ITSELF.
--
-- v1 FAILED, and that failure was the point: it hit
--   23505  event_registrations_unique_guest
-- proving the database could not hold two registrations for one email. That
-- would have been a 500 at checkout for every second attendee. v2 drops the
-- two one-per-person indexes and adds an advisory lock in their place.
--
-- The editor will warn this is destructive. It reads statements, not structure.
-- Everything runs inside the BEGIN below and the script ends in RAISE
-- EXCEPTION, which aborts it. A red ERROR with test results IS the pass.
-- A green "Success" means something went wrong — tell me.
-- ===========================================================================
BEGIN;



ALTER TABLE public.event_registrations
    ADD COLUMN IF NOT EXISTS purchase_intent_id uuid
        REFERENCES public.purchase_intents(id) ON DELETE SET NULL;

ALTER TABLE public.registration_answers
    ADD COLUMN IF NOT EXISTS ticket_id uuid
        REFERENCES public.tickets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_event_registrations_purchase_intent
    ON public.event_registrations(purchase_intent_id)
    WHERE purchase_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_answers_ticket
    ON public.registration_answers(ticket_id)
    WHERE ticket_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_registration_answer_per_attendee
    ON public.registration_answers(registration_id, question_id, ticket_id)
    NULLS NOT DISTINCT;

DROP INDEX IF EXISTS public.event_registrations_unique_guest;
DROP INDEX IF EXISTS public.event_registrations_unique_user;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_registration_per_order
    ON public.event_registrations(purchase_intent_id)
    WHERE purchase_intent_id IS NOT NULL;

COMMENT ON COLUMN public.event_registrations.purchase_intent_id IS
    'The order this submission accompanied. NULL for legacy rows and for a submission that has not reached checkout yet.';
COMMENT ON COLUMN public.registration_answers.ticket_id IS
    'NULL = answer applies to the whole order (current behaviour). Non-NULL = per-attendee answer, for per-attendee forms.';

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

    PERFORM pg_advisory_xact_lock(
        hashtext(p_event_id::text),
        hashtext(COALESCE(v_user_id::text, lower(p_guest_email)))
    );

    v_eligibility := event_registration_eligibility(p_event_id, v_user_id, p_guest_email);

    IF (v_event.require_approval OR v_event.invite_only)
       AND person_holds_event_ticket(p_event_id, v_user_id, p_guest_email) THEN
        RAISE EXCEPTION 'You have already registered for this event'
            USING ERRCODE = 'P0004';
    END IF;

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

    IF v_eligibility = 'rejected' THEN
        RAISE EXCEPTION 'You have already registered for this event'
            USING ERRCODE = 'P0004';
    END IF;

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

        DELETE FROM registration_answers
         WHERE registration_id = v_registration_id
           AND ticket_id IS NULL;
    ELSE
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

ALTER TABLE event_registrations DISABLE TRIGGER trg_notify_organizer_on_registration;
ALTER TABLE purchase_intents    DISABLE TRIGGER on_ticket_confirmed;
ALTER TABLE tickets             DISABLE TRIGGER trg_notify_organizer_on_paid_ticket;

DO $harness$
DECLARE
    EV       uuid := '87894ac7-a0ad-4b64-a516-2efe1ebff0b4';
    TIER     uuid := '466d418e-2b64-4e46-9165-70846714f659';
    SHARED   text := 'harness.shared@example.test';
    log text := ''; pass_n int := 0; fail_n int := 0; bleed int;
    ans jsonb; res jsonb;
    reg_a uuid; reg_b uuid; reg_x uuid; intent_a uuid;
    n int; txt text; nyqeil int; n_ans int;
BEGIN
    SELECT count(*) INTO nyqeil FROM registration_answers
     WHERE registration_id = 'a063dcbf-8be4-433a-81c0-84f0e7571551';

    SELECT jsonb_agg(jsonb_build_object('question_id', q.id, 'answer', 'ATTENDEE-A'))
      INTO ans FROM registration_questions q
     WHERE q.event_id = EV AND q.is_required
       AND (q.tier_ids IS NULL OR jsonb_array_length(q.tier_ids)=0 OR q.tier_ids ? TIER::text);
    n_ans := jsonb_array_length(ans);

    -- T1 retry of an unconsummated submission must REUSE it
    res := submit_event_request(EV, ans, TIER, SHARED, 'Attendee A');
    reg_a := (res->>'registration_id')::uuid;
    res := submit_event_request(EV, ans, TIER, SHARED, 'Attendee A');
    reg_x := (res->>'registration_id')::uuid;
    IF reg_x = reg_a THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T1  checkout retry reused the open submission (no duplicate)';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T1  retry forked a second row'; END IF;

    -- consummate A
    INSERT INTO purchase_intents (event_id, tier_id, quantity, unit_price, subtotal,
                                  platform_fee, total_amount, expires_at, status,
                                  guest_email, guest_name, metadata)
    VALUES (EV, TIER, 1, 914, 914, 0, 914, now()+interval '1 hour', 'completed',
            SHARED, 'Attendee A', jsonb_build_object('registration_id', reg_a::text))
    RETURNING id INTO intent_a;

    -- T2 second attendee gets an independent row
    SELECT jsonb_agg(jsonb_build_object('question_id', q.id, 'answer', 'ATTENDEE-B'))
      INTO ans FROM registration_questions q
     WHERE q.event_id = EV AND q.is_required
       AND (q.tier_ids IS NULL OR jsonb_array_length(q.tier_ids)=0 OR q.tier_ids ? TIER::text);

    res := submit_event_request(EV, ans, TIER, SHARED, 'Attendee B');
    reg_b := (res->>'registration_id')::uuid;
    IF reg_b <> reg_a THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T2  attendee B received an INDEPENDENT registration';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T2  attendee B reused attendee A''s registration'; END IF;

    -- T3 ACCEPTANCE 1: A's answers survive untouched
    SELECT count(*) INTO n     FROM registration_answers WHERE registration_id=reg_a AND answer='ATTENDEE-A';
    SELECT count(*) INTO bleed FROM registration_answers WHERE registration_id=reg_a AND answer='ATTENDEE-B';
    IF n = n_ans AND bleed = 0 THEN
        pass_n:=pass_n+1; log:=log||E'\n  PASS  T3  attendee A kept all '||n||' answers; 0 overwritten by B';
    ELSE
        fail_n:=fail_n+1; log:=log||E'\n  FAIL  T3  A has '||n||' own + '||bleed||' of B''s';
    END IF;

    -- T4 B holds B's answers
    SELECT count(*) INTO n FROM registration_answers WHERE registration_id=reg_b AND answer='ATTENDEE-B';
    IF n = n_ans THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T4  attendee B holds their own '||n||' answers';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T4  B has '||n||' answers, expected '||n_ans; END IF;

    -- T5 export separates them
    SELECT count(DISTINCT id) INTO n FROM event_registrations
     WHERE event_id=EV AND lower(guest_email)=SHARED;
    IF n = 2 THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T5  export sees 2 separate attendees on one email';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T5  export sees '||n||' registrations'; END IF;

    -- T6 repeat buyer keeps eligibility
    SELECT status::text INTO txt FROM event_registrations WHERE id=reg_b;
    IF txt IN ('approved','auto_approved') THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T6  repeat buyer stayed eligible ('||txt||')';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T6  repeat buyer landed in '||txt; END IF;

    -- T7 approval ration survives
    INSERT INTO tickets (event_id, purchase_intent_id, registration_id, tier_id,
                         guest_email, guest_name, status, ticket_number)
    VALUES (EV, intent_a, reg_a, TIER, SHARED, 'Attendee A', 'valid', 'TK-HARNESS1');
    UPDATE events SET require_approval = true WHERE id = EV;
    BEGIN
        res := submit_event_request(EV, ans, TIER, SHARED, 'Attendee C');
        fail_n:=fail_n+1; log:=log||E'\n  FAIL  T7  approval-gated event allowed a SECOND ticket';
    EXCEPTION WHEN sqlstate 'P0004' THEN
        pass_n:=pass_n+1; log:=log||E'\n  PASS  T7  approval-gated event still rations one per person';
    END;
    UPDATE events SET require_approval = false WHERE id = EV;

    -- T8 ticket bound to its own attendee
    SELECT registration_id INTO reg_x FROM tickets WHERE ticket_number='TK-HARNESS1';
    IF reg_x = reg_a THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T8  ticket bound to its own attendee''s registration';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T8  ticket bound to '||coalesce(reg_x::text,'NULL'); END IF;

    -- T9 duplicate answers impossible
    BEGIN
        INSERT INTO registration_answers (registration_id, question_id, answer)
        SELECT reg_b, (a->>'question_id')::uuid, 'DUPLICATE'
          FROM jsonb_array_elements(ans) a LIMIT 1;
        fail_n:=fail_n+1; log:=log||E'\n  FAIL  T9  duplicate answer row accepted';
    EXCEPTION WHEN unique_violation THEN
        pass_n:=pass_n+1; log:=log||E'\n  PASS  T9  duplicate answer rejected by the new unique index';
    END;

    -- T10 live data untouched
    SELECT count(*) INTO n FROM registration_answers
     WHERE registration_id='a063dcbf-8be4-433a-81c0-84f0e7571551';
    IF n = nyqeil THEN pass_n:=pass_n+1; log:=log||E'\n  PASS  T10 Nyqeil''s surviving '||n||' answers untouched by the migration';
    ELSE fail_n:=fail_n+1; log:=log||E'\n  FAIL  T10 Nyqeil '||nyqeil||' -> '||n; END IF;

    RAISE EXCEPTION E'\n=== HARNESS: % passed, % failed (of % required answers each) ===%\n--- transaction aborted: nothing above persists ---',
        pass_n, fail_n, n_ans, log;
END
$harness$;


-- Unreachable: the RAISE already aborted. Belt and braces.
ROLLBACK;
