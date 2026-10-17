-- Attendee detail links: let a buyer fill in per-attendee answers after checkout.
--
-- WHY THIS EXISTS
--
-- `event_registrations` collected ONE answer set per order. Buy six tickets and
-- the organizer gets one shirt size, one date of birth, one medical history --
-- for six different people. The DELETE bug fixed in
-- 20261014090000_per_order_registration_submissions made this visible by also
-- destroying earlier sets, but the gap predates it: a group buy was never asked
-- the questions more than once. On one live event 336 of 922 tickets have no
-- answers of their own.
--
-- Checkout should ask per attendee, and will. But 336 tickets are already sold,
-- and the people who can answer are the buyers -- the only contact we hold for
-- a group purchase. So: the buyer opens a link, sees a slot per ticket, and
-- fills in whoever they can.
--
-- NO NEW ORDER TOKEN. `purchase_intents.access_token` already identifies an
-- order and the buyer already received it in their ticket email -- it is what
-- /t/<token> renders. Reusing it means every existing order is reachable today
-- with nothing to mint and no new secret to deliver. It already grants the
-- admission QR, so it is already the buyer's credential for this order; what
-- changes here is that it also permits filling in that order's own answers.
--
-- Four guarantees, in the shape of the code below:
--
-- 1. NOTHING IS DESTROYED. Writes upsert on (registration_id, question_id,
--    ticket_id) -- the index the previous migration added. Pre-existing
--    order-level rows (ticket_id IS NULL) are never updated or deleted here.
-- 2. MISFILED DATA IS NEVER PRE-FILLED. Where one answer set is shared by
--    several tickets we cannot say which attendee it describes, so no slot
--    inherits it. Pre-filling would invite a buyer to confirm a stranger's
--    medical history as their own.
-- 3. EVERY CHANGE IS RECORDED. registration_answer_history is why: when these
--    answers were overwritten there was no audit table, no email body and no
--    log holding them, and nothing could be recovered without a full PITR
--    restore per incident.
-- 4. ONE DEFINITION OF "REQUIRED". The tier-scoping and conditional rules move
--    into event_required_question_ids, which submit_event_request's inline copy
--    becomes a caller of, so a buyer can never be blocked by a question this
--    page did not ask.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. History. Append-only, written by trigger, never by application code.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.registration_answer_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id       uuid        NOT NULL,
    registration_id uuid        NOT NULL,
    question_id     uuid        NOT NULL,
    ticket_id       uuid,
    -- The value as it stood BEFORE this change. An INSERT has no prior value.
    old_answer      text,
    new_answer      text,
    operation       text        NOT NULL CHECK (operation IN ('insert','update','delete')),
    changed_at      timestamptz NOT NULL DEFAULT now(),
    -- Best effort: the DB role and, when there is one, the authenticated user.
    changed_by      uuid,
    changed_by_role text
);

CREATE INDEX IF NOT EXISTS idx_answer_history_registration
    ON public.registration_answer_history (registration_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_history_ticket
    ON public.registration_answer_history (ticket_id) WHERE ticket_id IS NOT NULL;

ALTER TABLE public.registration_answer_history ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: this table is written by a trigger running as the
-- table owner and read only through SECURITY DEFINER functions. An attendee
-- must not be able to read it, and an organizer reads it through a function
-- that checks they own the event.
REVOKE ALL ON public.registration_answer_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_registration_answer_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_uid uuid;
BEGIN
    -- auth.uid() throws outside a request context (a migration, a cron job),
    -- and losing the history row would be worse than losing the attribution.
    BEGIN
        v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_uid := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        INSERT INTO registration_answer_history
            (answer_id, registration_id, question_id, ticket_id,
             old_answer, new_answer, operation, changed_by, changed_by_role)
        VALUES (OLD.id, OLD.registration_id, OLD.question_id, OLD.ticket_id,
                OLD.answer, NULL, 'delete', v_uid, current_user);
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- A no-op write is not history.
        IF OLD.answer IS NOT DISTINCT FROM NEW.answer THEN RETURN NEW; END IF;
        INSERT INTO registration_answer_history
            (answer_id, registration_id, question_id, ticket_id,
             old_answer, new_answer, operation, changed_by, changed_by_role)
        VALUES (NEW.id, NEW.registration_id, NEW.question_id, NEW.ticket_id,
                OLD.answer, NEW.answer, 'update', v_uid, current_user);
        RETURN NEW;
    END IF;

    INSERT INTO registration_answer_history
        (answer_id, registration_id, question_id, ticket_id,
         old_answer, new_answer, operation, changed_by, changed_by_role)
    VALUES (NEW.id, NEW.registration_id, NEW.question_id, NEW.ticket_id,
            NULL, NEW.answer, 'insert', v_uid, current_user);
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_registration_answer_change ON public.registration_answers;
CREATE TRIGGER trg_log_registration_answer_change
    AFTER INSERT OR UPDATE OR DELETE ON public.registration_answers
    FOR EACH ROW EXECUTE FUNCTION public.log_registration_answer_change();

-- ---------------------------------------------------------------------------
-- 2. One definition of "required", lifted out of submit_event_request.
-- ---------------------------------------------------------------------------

-- Mirrors src/lib/events/question-visibility.ts. Three surfaces ask these
-- questions and the server independently decides which it will insist on; when
-- those disagree a buyer is either asked something that is ignored or blocked
-- by something never shown. p_answers is the answer set in scope, as
-- [{"question_id": "...", "answer": "..."}], used to resolve conditionals.
CREATE OR REPLACE FUNCTION public.event_required_question_ids(
    p_event_id uuid,
    p_tier_id  uuid,
    p_answers  jsonb
) RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
    SELECT array_agg(q.id)
      FROM registration_questions q
     WHERE q.event_id = p_event_id
       AND q.is_required = true
       AND q.question_type <> 'section'
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
$fn$;

GRANT EXECUTE ON FUNCTION public.event_required_question_ids(uuid, uuid, jsonb)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Per-ticket coverage.
-- ---------------------------------------------------------------------------

-- Does this ticket have answers of its OWN?
--
-- Ticket-scoped rows win outright. An order-level row (ticket_id IS NULL) is
-- attributed to a ticket only when BOTH hold:
--
--   * it is the only issued ticket on its registration, and
--   * the set was not re-inserted after that ticket existed.
--
-- The second test is the important one, and it is mechanical rather than a
-- heuristic. The normal flow writes answers before the ticket -- register, pay,
-- then the webhook issues -- so answers.created_at < tickets.created_at for
-- 1,661 of 1,681 ticket/answer pairs on this database. An UPDATE does not move
-- created_at, so a set whose created_at is LATER than its ticket was deleted
-- and re-inserted: precisely what the old submit_event_request did to the
-- previous attendee's answers. 19 tickets carry such a set, and on every one
-- checked it describes a different person than the ticket names -- a ticket
-- reading "Matt Collado" holding a 19-year-old woman's 21KM entry.
--
-- So a rewritten set is reported, never attributed. Treating it as covered is
-- how a wrong shirt size reaches a singlet manifest and a real medical
-- condition shows up as "none".
CREATE OR REPLACE FUNCTION public.ticket_detail_status(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_ticket      RECORD;
    v_siblings    integer := 0;
    v_own         jsonb;
    v_shared      jsonb;
    v_shared_at   timestamptz;
    v_rewritten   boolean := false;
    v_answers     jsonb;
    v_source      text;
    v_required    uuid[];
    v_missing     uuid[];
BEGIN
    SELECT t.id, t.event_id, t.tier_id, t.registration_id, t.created_at
      INTO v_ticket
      FROM tickets t
     WHERE t.id = p_ticket_id;

    IF v_ticket.id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- This ticket's own answers.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'question_id', ra.question_id, 'answer', ra.answer)), '[]'::jsonb)
      INTO v_own
      FROM registration_answers ra
     WHERE ra.ticket_id = p_ticket_id;

    IF v_ticket.registration_id IS NOT NULL THEN
        SELECT count(*) INTO v_siblings
          FROM tickets t2
         WHERE t2.registration_id = v_ticket.registration_id
           AND t2.status::text IN ('valid','used');

        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'question_id', ra.question_id, 'answer', ra.answer)), '[]'::jsonb),
               max(ra.created_at)
          INTO v_shared, v_shared_at
          FROM registration_answers ra
         WHERE ra.registration_id = v_ticket.registration_id
           AND ra.ticket_id IS NULL;

        -- Two minutes of grace: the webhook that issues a ticket can land in
        -- the same breath as the registration it came from.
        v_rewritten := v_shared_at IS NOT NULL
                   AND v_shared_at > v_ticket.created_at + interval '2 minutes';
    ELSE
        v_shared := '[]'::jsonb;
    END IF;

    IF jsonb_array_length(v_own) > 0 THEN
        v_answers := v_own;
        v_source  := 'own';
    ELSIF v_siblings = 1 AND jsonb_array_length(v_shared) > 0 AND NOT v_rewritten THEN
        -- Sole ticket on its registration, set never re-inserted: it is theirs.
        v_answers := v_shared;
        v_source  := 'order';
    ELSE
        -- Never pre-filled. Three different states the organizer must be able
        -- to tell apart, and the copy on the page differs for each.
        v_answers := '[]'::jsonb;
        v_source  := CASE
            WHEN v_rewritten                        THEN 'rewritten'
            WHEN jsonb_array_length(v_shared) > 0   THEN 'shared'
            ELSE 'none'
        END;
    END IF;

    v_required := public.event_required_question_ids(
        v_ticket.event_id, v_ticket.tier_id, v_answers);

    SELECT array_agg(q_id) INTO v_missing
      FROM unnest(COALESCE(v_required, ARRAY[]::uuid[])) AS q_id
     WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_answers) AS a
         WHERE (a->>'question_id')::uuid = q_id
           AND a->>'answer' IS NOT NULL
           AND trim(a->>'answer') <> ''
     );

    RETURN jsonb_build_object(
        'found',          true,
        -- own        -- this attendee's own answers
        -- order      -- the order-level set, safely theirs (sole ticket, never rewritten)
        -- rewritten  -- a set exists but was re-inserted after this ticket: likely
        --               another attendee's, so it is shown to the organizer and
        --               never pre-filled or counted
        -- shared     -- several tickets share one set; unattributable
        -- none       -- never collected
        'answer_source',  v_source,
        'answers',        v_answers,
        'required_count', COALESCE(array_length(v_required, 1), 0),
        'missing',        COALESCE(to_jsonb(v_missing), '[]'::jsonb),
        'missing_count',  COALESCE(array_length(v_missing, 1), 0),
        'complete',       COALESCE(array_length(v_missing, 1), 0) = 0
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ticket_detail_status(uuid)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Forwardable per-attendee sublinks.
-- ---------------------------------------------------------------------------

-- A buyer holding the order link can mint a narrow link for ONE ticket and send
-- it to that person. Without this, forwarding a slot means forwarding the whole
-- order -- fine for a family, a privacy leak for a group of friends.
CREATE TABLE IF NOT EXISTS public.attendee_detail_sublinks (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token      text        NOT NULL UNIQUE,
    ticket_id  uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    opened_at  timestamptz,
    saved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_detail_sublinks_ticket
    ON public.attendee_detail_sublinks (ticket_id);

ALTER TABLE public.attendee_detail_sublinks ENABLE ROW LEVEL SECURITY;
-- No policies. Tokens are resolved inside SECURITY DEFINER functions; a client
-- that could SELECT this table could enumerate every live link.
REVOKE ALL ON public.attendee_detail_sublinks FROM anon, authenticated;

COMMIT;
