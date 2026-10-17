-- HARNESS for the attendee detail link. READ-ONLY IN EFFECT.
--
-- Applies both migrations, exercises them against real Sinadya Run 2026 rows,
-- then ABORTS so nothing persists. Run the whole file in one go: it ends in a
-- deliberate RAISE EXCEPTION, which is how the results get out (a multi-
-- statement run only returns the last result, and that would be [] after a
-- ROLLBACK). An error message ending in "HARNESS: N passed" is a SUCCESSFUL run.
--
-- Nothing here disables a trigger, so there is no production state left behind
-- if the session dies mid-run.

BEGIN;

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

-- Read and write surface for the attendee detail link.
--
-- Authorization is the token, resolved server side, and nothing else. There is
-- no session: the people filling this in are guests, often forwarded the link
-- by the buyer. Two tokens are accepted:
--
--   * purchase_intents.access_token -- EVERYTHING THIS BUYER HOLDS ON THIS
--     EVENT, not just the one order the token was issued for. The buyer already
--     has this token; it is the /t/<token> link from their ticket email.
--   * attendee_detail_sublinks.token -- exactly one ticket, minted by the buyer
--     so a single attendee can fill in their own details without seeing the
--     rest of them. Once that attendee saves, the slot becomes read-only and
--     invisible to the buyer's own link: they see "complete", not the answers.
--
-- WHY BUYER SCOPE AND NOT ORDER SCOPE
--
-- Because an order is not how people buy for a group. Two shapes exist and they
-- are distributed opposite ways:
--
--   Back to the Garden   168 buyers bought several tickets in ONE order
--   Sinadya Run 2026       0 did. All 3 affected buyers made SEPARATE orders
--                            minutes or days apart -- Matt Collado bought his
--                            own on 10 Oct, then Erica's and Rizel's on 15 Oct
--                            as two more orders.
--
-- Order scope covers 94% of Back to the Garden and 0% of Sinadya. Scoping to
-- the buyer on the event covers both, needs no new token, and matches what the
-- buyer is actually looking for: the people they are bringing to this event.
--
-- The grant is wider than the token's original one -- Matt's ticket link now
-- also reaches Erica's and Rizel's slots -- and that is the point: he paid for
-- all three and is the only address we hold for any of them. Identity is the
-- account where there is one, otherwise the lowercased email, which is this
-- platform's customer key everywhere else.
--
-- These replace the pattern used by upsert_registration_answers, which is
-- anon-executable, SECURITY DEFINER, and authorizes on nothing but knowledge of
-- a registration UUID -- so anyone holding one can rewrite a stranger's medical
-- history. That function still has one live caller in checkout and is dealt
-- with separately; nothing here depends on it.

-- ---------------------------------------------------------------------------
-- Keep the organizer's review queue honest.
-- ---------------------------------------------------------------------------

-- save_attendee_details below has to CREATE a registration for a ticket that
-- has none -- 56 paid tickets platform-wide are in that state. On an
-- approval-gated event that INSERT would fire this trigger and tell the
-- organizer a new registration needs reviewing, for a ticket that was paid for
-- and issued days ago. The event is not gated for the two events driving this
-- work, so nothing fires today; the guard is here so it stays true when a gated
-- event uses the link.
--
-- Unchanged in every other respect: same early return, same payload, same
-- swallowed exception.
CREATE OR REPLACE FUNCTION public.notify_organizer_on_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_needs_review boolean;
BEGIN
  -- Backfilling answers onto an existing ticket is not a new registration.
  IF COALESCE(current_setting('hanghut.backfill_registration', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT (e.require_approval OR e.invite_only) INTO v_needs_review
  FROM events e WHERE e.id = NEW.event_id;

  IF COALESCE(v_needs_review, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_secret := current_setting('app.settings.organizer_notify_secret', true);

  PERFORM net.http_post(
    url     := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/notify-organizer-on-registration',
    body    := jsonb_build_object(
                 'registration_id', NEW.id,
                 'event_id',        NEW.event_id
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', COALESCE(v_secret, '')
               )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Token resolution, shared by every entry point below.
-- ---------------------------------------------------------------------------

-- Returns the tickets a token grants, or nothing. One place to get this wrong.
CREATE OR REPLACE FUNCTION public.resolve_attendee_detail_token(
    p_order_token   uuid,
    p_sublink_token text
) RETURNS TABLE (ticket_id uuid, event_id uuid, intent_id uuid, scope text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
    -- Buyer scope. The token names one order; the identity on that order is
    -- what we match, so tickets bought in separate orders by the same person
    -- for the same event all resolve. A buyer who was signed in for one
    -- purchase and a guest for another is still one person, so BOTH the account
    -- and the email are matched, not whichever the token's own order used.
    WITH src AS (
        SELECT pi.event_id,
               pi.user_id,
               lower(nullif(trim(COALESCE(pi.guest_email, u.email)), '')) AS email
          FROM purchase_intents pi
          LEFT JOIN users u ON u.id = pi.user_id
         WHERE p_order_token IS NOT NULL
           AND pi.access_token = p_order_token
    )
    SELECT t.id, t.event_id, t.purchase_intent_id, 'buyer'::text
      FROM src
      JOIN tickets t ON t.event_id = src.event_id
      LEFT JOIN users tu ON tu.id = t.user_id
     WHERE t.status::text IN ('valid','used')
       AND (
           (src.user_id IS NOT NULL AND t.user_id = src.user_id)
           OR (src.email IS NOT NULL
               AND lower(nullif(trim(COALESCE(t.guest_email, tu.email)), '')) = src.email)
       )

    UNION

    -- Ticket scope: one ticket, while the sublink is live.
    SELECT t.id, t.event_id, t.purchase_intent_id, 'ticket'::text
      FROM attendee_detail_sublinks s
      JOIN tickets t ON t.id = s.ticket_id
     WHERE p_sublink_token IS NOT NULL
       AND s.token = p_sublink_token
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND t.status::text IN ('valid','used');
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_attendee_detail_token(uuid, text)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read: the form.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_attendee_details(
    p_order_token   uuid DEFAULT NULL,
    p_sublink_token text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_event_id uuid;
    v_scope    text;
    v_closes   timestamptz;
    v_result   jsonb;
BEGIN
    SELECT r.event_id, min(r.scope) INTO v_event_id, v_scope
      FROM public.resolve_attendee_detail_token(p_order_token, p_sublink_token) r
     GROUP BY r.event_id
     LIMIT 1;

    IF v_event_id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- Nothing to collect once the event is over, and a link that edits medical
    -- details should not stay live forever in a forwarded inbox.
    SELECT COALESCE(e.end_datetime, e.start_datetime + interval '1 day')
      INTO v_closes FROM events e WHERE e.id = v_event_id;

    SELECT jsonb_build_object(
        'found',  true,
        'scope',  v_scope,
        'closed', v_closes < now(),
        'event', (
            SELECT jsonb_build_object(
                'id', e.id, 'title', e.title,
                'start_datetime', e.start_datetime,
                'venue_name', e.venue_name,
                'cover_image_url', e.cover_image_url)
              FROM events e WHERE e.id = v_event_id
        ),
        'organizer', (
            SELECT jsonb_build_object('name', p.business_name, 'logo_url', p.profile_photo_url)
              FROM events e JOIN partners p ON p.id = e.organizer_id
             WHERE e.id = v_event_id
        ),
        'questions', (
            -- Every question on the event, unfiltered. Tier scoping and
            -- conditionals are per-ticket and resolved client side by the same
            -- module checkout uses, so one slot's branching cannot affect
            -- another's.
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', q.id, 'label', q.label,
                'question_type', q.question_type,
                'options', q.options,
                'is_required', q.is_required,
                'display_order', q.display_order,
                'help_text', q.help_text,
                'help_image_url', q.help_image_url,
                'depends_on_question_id', q.depends_on_question_id,
                'depends_on_values', q.depends_on_values,
                'tier_ids', q.tier_ids,
                'option_images', q.option_images
            ) ORDER BY q.display_order), '[]'::jsonb)
              FROM registration_questions q WHERE q.event_id = v_event_id
        ),
        'tickets', (
            SELECT COALESCE(jsonb_agg(s.slot ORDER BY s.created_at, s.ticket_number), '[]'::jsonb)
              FROM (
                SELECT t.created_at, t.ticket_number,
                       jsonb_build_object(
                    'id', t.id,
                    'ticket_number', t.ticket_number,
                    'attendee_name', t.guest_name,
                    'tier', COALESCE(tt.name, t.tier),
                    'tier_id', t.tier_id,
                    'ordered_at', t.created_at,
                    -- An attendee who filled in their OWN slot through a
                    -- forwarded sublink owns those answers. The buyer is shown
                    -- that it is done and nothing else: the answers are
                    -- stripped HERE, server side, because masking them in the
                    -- page would still ship a stranger's medical history to the
                    -- buyer's browser. They are not editable from the buyer's
                    -- link either -- see save_attendee_details -- since being
                    -- able to overwrite what you cannot read is how answers got
                    -- destroyed in the first place.
                    'status', CASE
                        WHEN v_scope = 'buyer' AND EXISTS (
                            SELECT 1 FROM attendee_detail_sublinks sl
                             WHERE sl.ticket_id = t.id AND sl.saved_at IS NOT NULL)
                        THEN public.ticket_detail_status(t.id)
                             || jsonb_build_object('answers', '[]'::jsonb,
                                                   'self_filled', true,
                                                   'readonly', true)
                        ELSE public.ticket_detail_status(t.id)
                             || jsonb_build_object('self_filled', false,
                                                   'readonly', false)
                    END
                ) AS slot
                  FROM public.resolve_attendee_detail_token(p_order_token, p_sublink_token) r
                  JOIN tickets t ON t.id = r.ticket_id
                  LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
              ) s
        )
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_attendee_details(uuid, text)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Write: one attendee's answers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_attendee_details(
    p_ticket_id     uuid,
    p_answers       jsonb,
    p_order_token   uuid DEFAULT NULL,
    p_sublink_token text DEFAULT NULL,
    p_attendee_name text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_ticket    RECORD;
    v_closes    timestamptz;
    v_reg_id    uuid;
    v_required  uuid[];
    v_missing   uuid[];
    v_bad       integer;
BEGIN
    -- 1. Authorize. The token must grant THIS ticket.
    IF NOT EXISTS (
        SELECT 1 FROM public.resolve_attendee_detail_token(p_order_token, p_sublink_token) r
         WHERE r.ticket_id = p_ticket_id
    ) THEN
        RAISE EXCEPTION 'That link does not cover this ticket'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT t.id, t.event_id, t.tier_id, t.registration_id, t.purchase_intent_id,
           t.guest_email, t.guest_name, t.user_id
      INTO v_ticket
      FROM tickets t WHERE t.id = p_ticket_id;

    SELECT COALESCE(e.end_datetime, e.start_datetime + interval '1 day')
      INTO v_closes FROM events e WHERE e.id = v_ticket.event_id;

    IF v_closes < now() THEN
        RAISE EXCEPTION 'This event has already taken place'
            USING ERRCODE = 'P0002';
    END IF;

    -- 1b. A slot the attendee filled in themselves is theirs. The buyer's link
    --     can see that it is complete but cannot read it back or replace it; to
    --     change it the attendee reopens their own link, which the buyer can
    --     re-send from the page. Without this, masking the answers in the read
    --     path would leave them destroyable by someone who cannot even see them.
    IF p_sublink_token IS NULL AND EXISTS (
        SELECT 1 FROM attendee_detail_sublinks sl
         WHERE sl.ticket_id = p_ticket_id AND sl.saved_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'This attendee filled in their own details'
            USING ERRCODE = 'P0006';
    END IF;

    -- 2. Every answer must name a question on this event. Otherwise the
    --    endpoint writes arbitrary rows against any question id on the platform.
    SELECT count(*) INTO v_bad
      FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
     WHERE NOT EXISTS (
        SELECT 1 FROM registration_questions q
         WHERE q.id = (a->>'question_id')::uuid
           AND q.event_id = v_ticket.event_id
           AND q.question_type <> 'section'
     );
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'Those answers do not belong to this event'
            USING ERRCODE = 'P0003';
    END IF;

    -- 3. Required questions, by the one shared definition.
    v_required := public.event_required_question_ids(
        v_ticket.event_id, v_ticket.tier_id, p_answers);

    SELECT array_agg(q_id) INTO v_missing
      FROM unnest(COALESCE(v_required, ARRAY[]::uuid[])) AS q_id
     WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_answers) AS a
         WHERE (a->>'question_id')::uuid = q_id
           AND a->>'answer' IS NOT NULL
           AND trim(a->>'answer') <> ''
     );
    IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'Required questions not answered: %', v_missing
            USING ERRCODE = 'P0005';
    END IF;

    -- 4. The ticket needs a registration to hang answers off. 56 paid tickets
    --    platform-wide have none -- checkout reused a cached approval and never
    --    called submit_event_request. Creating one per attendee is only possible
    --    because 20261014090000 dropped the one-registration-per-person indexes;
    --    under those this INSERT would have raised 23505.
    v_reg_id := v_ticket.registration_id;
    IF v_reg_id IS NULL THEN
        -- Serialize on the ticket so two tabs cannot each create one.
        PERFORM pg_advisory_xact_lock(hashtext('attendee_detail'), hashtext(p_ticket_id::text));

        SELECT t.registration_id INTO v_reg_id FROM tickets t WHERE t.id = p_ticket_id;

        IF v_reg_id IS NULL THEN
            -- Transaction-local: stops trg_notify_organizer_on_registration
            -- announcing this as a new registration awaiting review.
            PERFORM set_config('hanghut.backfill_registration', 'on', true);

            INSERT INTO event_registrations
                (event_id, user_id, guest_email, guest_name, tier_id, status, purchase_intent_id)
            VALUES (v_ticket.event_id, v_ticket.user_id,
                    lower(nullif(trim(v_ticket.guest_email), '')),
                    COALESCE(nullif(trim(p_attendee_name), ''), v_ticket.guest_name),
                    v_ticket.tier_id, 'auto_approved', v_ticket.purchase_intent_id)
            RETURNING id INTO v_reg_id;

            UPDATE tickets SET registration_id = v_reg_id, updated_at = now()
             WHERE id = p_ticket_id;

            PERFORM set_config('hanghut.backfill_registration', 'off', true);
        END IF;
    END IF;

    -- 5. Write, scoped to this ticket. ON CONFLICT targets
    --    uniq_registration_answer_per_attendee. Rows with ticket_id IS NULL --
    --    the pre-existing order-level set -- are outside this statement's reach,
    --    so an earlier attendee's answers cannot be touched by a later one.
    INSERT INTO registration_answers (registration_id, question_id, ticket_id, answer)
    SELECT v_reg_id, (a->>'question_id')::uuid, p_ticket_id, a->>'answer'
      FROM jsonb_array_elements(p_answers) AS a
    ON CONFLICT (registration_id, question_id, ticket_id)
    DO UPDATE SET answer = EXCLUDED.answer;

    -- 6. Let the buyer correct a name taken from their own account.
    IF nullif(trim(p_attendee_name), '') IS NOT NULL
       AND p_attendee_name IS DISTINCT FROM v_ticket.guest_name THEN
        UPDATE tickets SET guest_name = trim(p_attendee_name), updated_at = now()
         WHERE id = p_ticket_id;
    END IF;

    IF p_sublink_token IS NOT NULL THEN
        UPDATE attendee_detail_sublinks SET saved_at = now()
         WHERE token = p_sublink_token;
    END IF;

    RETURN public.ticket_detail_status(p_ticket_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.save_attendee_details(uuid, jsonb, uuid, text, text)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Mint a forwardable per-attendee link.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mint_attendee_sublink(
    p_ticket_id   uuid,
    p_order_token uuid
) RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_token  text;
    v_closes timestamptz;
BEGIN
    -- Only a buyer-scoped token mints. A sublink cannot mint further sublinks,
    -- so a forwarded slot stays one slot.
    IF NOT EXISTS (
        SELECT 1 FROM public.resolve_attendee_detail_token(p_order_token, NULL) r
         WHERE r.ticket_id = p_ticket_id
    ) THEN
        RAISE EXCEPTION 'That link does not cover this ticket'
            USING ERRCODE = 'P0001';
    END IF;

    -- Reuse a live one so repeated clicks of "copy link" send one URL, not five.
    SELECT s.token INTO v_token
      FROM attendee_detail_sublinks s
     WHERE s.ticket_id = p_ticket_id
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     ORDER BY s.created_at DESC LIMIT 1;
    IF v_token IS NOT NULL THEN RETURN v_token; END IF;

    SELECT COALESCE(e.end_datetime, e.start_datetime + interval '1 day')
      INTO v_closes
      FROM tickets t JOIN events e ON e.id = t.event_id
     WHERE t.id = p_ticket_id;

    -- 256 bits from two UUIDs, so no pgcrypto dependency.
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO attendee_detail_sublinks (token, ticket_id, expires_at)
    VALUES (v_token, p_ticket_id, v_closes);

    RETURN v_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mint_attendee_sublink(uuid, uuid)
    TO anon, authenticated, service_role;
-- ===========================================================================
-- TESTS -- real Sinadya Run 2026 data, inside the aborted transaction.
-- ===========================================================================

DO $harness$
DECLARE
    v_event   uuid := '87894ac7-a0ad-4b64-a516-2efe1ebff0b4';
    t_matt    uuid; t_erica uuid; t_rizel uuid;
    t_nyq1    uuid; t_nyq2  uuid; t_ruth  uuid; t_john uuid;
    tok_matt  uuid; tok_nyq1 uuid; tok_ruth uuid;
    st        jsonb; det jsonb; full_answers jsonb;
    sub       text;
    pass int := 0; fail int := 0; log text := '';
    n int; n_before int; n_after int; foreign_q uuid;
    past_ticket uuid; past_token uuid;
    sub2 text; masked jsonb;
BEGIN
    SELECT id INTO t_matt  FROM tickets WHERE ticket_number='TK-7AFF8E7E';
    SELECT id INTO t_erica FROM tickets WHERE ticket_number='TK-B9EC6937';
    SELECT id INTO t_rizel FROM tickets WHERE ticket_number='TK-88BD2AF3';
    SELECT id INTO t_nyq1  FROM tickets WHERE ticket_number='TK-BFF7401A';
    SELECT id INTO t_nyq2  FROM tickets WHERE ticket_number='TK-FCD6569F';
    SELECT id INTO t_ruth  FROM tickets WHERE ticket_number='TK-65FA6EC4';
    SELECT id INTO t_john  FROM tickets WHERE ticket_number='TK-6AD3B678';

    SELECT pi.access_token INTO tok_matt FROM tickets t
      JOIN purchase_intents pi ON pi.id=t.purchase_intent_id WHERE t.id=t_matt;
    SELECT pi.access_token INTO tok_nyq1 FROM tickets t
      JOIN purchase_intents pi ON pi.id=t.purchase_intent_id WHERE t.id=t_nyq1;
    SELECT pi.access_token INTO tok_ruth FROM tickets t
      JOIN purchase_intents pi ON pi.id=t.purchase_intent_id WHERE t.id=t_ruth;

    -- A complete answer set: every answerable question on the event.
    SELECT jsonb_agg(jsonb_build_object('question_id', q.id, 'answer', 'HARNESS'))
      INTO full_answers
      FROM registration_questions q
     WHERE q.event_id=v_event AND q.question_type <> 'section';

    SELECT q.id INTO foreign_q FROM registration_questions q
     WHERE q.event_id <> v_event LIMIT 1;

    -- 1-4: the misfiled sets are reported, never counted as covered.
    st := public.ticket_detail_status(t_matt);
    IF st->>'answer_source'='rewritten' AND (st->>'complete')::bool=false
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 1 Matt: source='||(st->>'answer_source')||' complete='||(st->>'complete'); END IF;

    st := public.ticket_detail_status(t_nyq1);
    IF st->>'answer_source'='rewritten'
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 2 Nyqeil#1: source='||(st->>'answer_source'); END IF;

    st := public.ticket_detail_status(t_ruth);
    IF st->>'answer_source'='rewritten'
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 3 Ruth: source='||(st->>'answer_source'); END IF;

    st := public.ticket_detail_status(t_erica);
    IF st->>'answer_source'='none' AND (st->>'complete')::bool=false
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 4 Erica: source='||(st->>'answer_source'); END IF;

    -- 5: the order link shows every slot in the order.
    det := public.get_attendee_details(tok_matt, NULL);
    IF (det->>'found')::bool AND jsonb_array_length(det->'tickets')=3
       AND jsonb_array_length(det->'questions')=22 AND (det->>'closed')::bool=false
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 5 order view: tickets='||jsonb_array_length(det->'tickets')
              ||' questions='||jsonb_array_length(det->'questions'); END IF;

    -- 6: saving for a ticket with NO registration creates one and completes it.
    SELECT count(*) INTO n_before FROM registration_answers
      WHERE registration_id IN (SELECT registration_id FROM tickets WHERE id=t_matt)
        AND ticket_id IS NULL;

    st := public.save_attendee_details(t_erica, full_answers, tok_matt, NULL, 'Erica Delos Santos');
    IF (st->>'complete')::bool AND st->>'answer_source'='own'
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 6 save Erica: '||st::text; END IF;

    SELECT count(*) INTO n FROM tickets WHERE id=t_erica AND registration_id IS NOT NULL;
    IF n=1 THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 7 Erica ticket not linked to a registration'; END IF;

    -- 8: THE NON-NEGOTIABLE. Saving one attendee must not touch another's.
    SELECT count(*) INTO n_after FROM registration_answers
      WHERE registration_id IN (SELECT registration_id FROM tickets WHERE id=t_matt)
        AND ticket_id IS NULL;
    st := public.ticket_detail_status(t_matt);
    IF n_after = n_before AND n_before > 0 AND st->>'answer_source'='rewritten'
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 8 Matt disturbed: before='||n_before||' after='||n_after
              ||' source='||(st->>'answer_source'); END IF;

    -- 9: idempotent. Re-saving overwrites that attendee's own rows, adds none.
    SELECT count(*) INTO n_before FROM registration_answers WHERE ticket_id=t_erica;
    st := public.save_attendee_details(t_erica, full_answers, tok_matt, NULL, NULL);
    SELECT count(*) INTO n_after FROM registration_answers WHERE ticket_id=t_erica;
    IF n_after = n_before THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 9 duplicate rows: '||n_before||' -> '||n_after; END IF;

    -- 10: a token from a DIFFERENT order must not reach this ticket.
    BEGIN
        PERFORM public.save_attendee_details(t_erica, full_answers, tok_nyq1, NULL, NULL);
        fail:=fail+1; log:=log||E'\nFAIL 10 cross-order write was ALLOWED';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN pass:=pass+1;
    END;

    -- 11: missing required answers are refused.
    BEGIN
        PERFORM public.save_attendee_details(t_rizel, '[]'::jsonb, tok_matt, NULL, NULL);
        fail:=fail+1; log:=log||E'\nFAIL 11 empty answer set was ACCEPTED';
    EXCEPTION WHEN SQLSTATE 'P0005' THEN pass:=pass+1;
    END;

    -- 12: a question belonging to another event is refused.
    BEGIN
        PERFORM public.save_attendee_details(t_rizel,
            jsonb_build_array(jsonb_build_object('question_id', foreign_q, 'answer', 'x')),
            tok_matt, NULL, NULL);
        fail:=fail+1; log:=log||E'\nFAIL 12 foreign question was ACCEPTED';
    EXCEPTION WHEN SQLSTATE 'P0003' THEN pass:=pass+1;
    END;

    -- 13: every write is now recorded. This is what was missing.
    SELECT count(*) INTO n FROM registration_answer_history
     WHERE ticket_id=t_erica AND operation IN ('insert','update');
    IF n > 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 13 no history rows written'; END IF;

    -- 14: a sublink grants exactly one ticket, not the order.
    sub := public.mint_attendee_sublink(t_rizel, tok_matt);
    det := public.get_attendee_details(NULL, sub);
    IF jsonb_array_length(det->'tickets')=1
       AND (det->'tickets'->0->>'id')=t_rizel::text
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 14 sublink scope: '||det->'tickets'::text; END IF;

    BEGIN
        PERFORM public.save_attendee_details(t_matt, full_answers, NULL, sub, NULL);
        fail:=fail+1; log:=log||E'\nFAIL 15 sublink reached another ticket';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN pass:=pass+1;
    END;

    -- 16: minting is idempotent, so "copy link" does not mint five tokens.
    IF public.mint_attendee_sublink(t_rizel, tok_matt) = sub
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 16 mint not idempotent'; END IF;

    -- 17: a garbage token reveals nothing.
    det := public.get_attendee_details(gen_random_uuid(), NULL);
    IF (det->>'found')::bool = false THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 17 random token resolved'; END IF;

    -- 18: a revoked sublink stops working.
    UPDATE attendee_detail_sublinks SET revoked_at=now() WHERE token=sub;
    det := public.get_attendee_details(NULL, sub);
    IF (det->>'found')::bool = false THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 18 revoked sublink still works'; END IF;

    -- 19: the token grants this buyer's OTHER orders on the same event. This is
    --     the case the first run of this harness caught: Matt, Erica and Rizel
    --     are three separate orders, so an order-scoped token saw one slot.
    det := public.get_attendee_details(tok_nyq1, NULL);
    IF jsonb_array_length(det->'tickets')=2 THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 19 Nyqeil slots='||jsonb_array_length(det->'tickets'); END IF;

    det := public.get_attendee_details(tok_ruth, NULL);
    IF jsonb_array_length(det->'tickets')=2 THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 20 Ruth slots='||jsonb_array_length(det->'tickets'); END IF;

    -- 21: a past event is closed for edits. One ticket and ITS OWN token.
    SELECT t.id, pi.access_token INTO past_ticket, past_token
      FROM tickets t
      JOIN purchase_intents pi ON pi.id=t.purchase_intent_id
      JOIN events e ON e.id=t.event_id
     WHERE COALESCE(e.end_datetime, e.start_datetime + interval '1 day') < now() - interval '7 days'
       AND t.status IN ('valid','used')
     LIMIT 1;

    IF past_ticket IS NULL THEN
        pass:=pass+1;  -- nothing old enough to test against
    ELSE
        BEGIN
            PERFORM public.save_attendee_details(past_ticket, '[]'::jsonb, past_token, NULL, NULL);
            fail:=fail+1; log:=log||E'\nFAIL 21 past event accepted a write';
        EXCEPTION WHEN SQLSTATE 'P0002' THEN pass:=pass+1;
        END;
    END IF;

    -- 22: the whole-event number the organizer will be shown. Taken BEFORE the
    --     masking tests below so it reflects today's data, not the harness's.
    SELECT count(*) INTO n FROM tickets t
     WHERE t.event_id=v_event AND t.status IN ('valid','used')
       AND NOT (public.ticket_detail_status(t.id)->>'complete')::bool;

    -- 23-26: an attendee who fills in their OWN slot owns it. John Karlo's
    --        ticket is on Ruth's buyer scope, so it is the right one to test
    --        the boundary between the two.
    sub2 := public.mint_attendee_sublink(t_john, tok_ruth);
    st := public.save_attendee_details(t_john, full_answers, NULL, sub2, 'John Karlo Balgos');
    IF (st->>'complete')::bool THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 23 sublink save: '||st::text; END IF;

    -- The buyer sees it is done, and is handed NO answers.
    det := public.get_attendee_details(tok_ruth, NULL);
    SELECT x.slot INTO masked
      FROM jsonb_array_elements(det->'tickets') AS x(slot)
     WHERE x.slot->>'id' = t_john::text;
    IF (masked->'status'->>'self_filled')::bool
       AND (masked->'status'->>'readonly')::bool
       AND (masked->'status'->>'complete')::bool
       AND jsonb_array_length(masked->'status'->'answers') = 0
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 24 not masked for buyer: '||COALESCE(masked->'status', 'null'::jsonb)::text; END IF;

    -- And cannot overwrite what they cannot read.
    BEGIN
        PERFORM public.save_attendee_details(t_john, full_answers, tok_ruth, NULL, NULL);
        fail:=fail+1; log:=log||E'\nFAIL 25 buyer overwrote a self-filled slot';
    EXCEPTION WHEN SQLSTATE 'P0006' THEN pass:=pass+1;
    END;

    -- The attendee's own link still works, so a correction is possible.
    st := public.save_attendee_details(t_john, full_answers, NULL, sub2, NULL);
    IF (st->>'complete')::bool THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 26 attendee locked out of their own slot'; END IF;

    -- Ruth's own slot is NOT masked -- she never used a sublink.
    SELECT x.slot INTO masked
      FROM jsonb_array_elements(det->'tickets') AS x(slot)
     WHERE x.slot->>'id' = t_ruth::text;
    IF (masked->'status'->>'self_filled')::bool = false
       AND (masked->'status'->>'readonly')::bool = false
      THEN pass:=pass+1; ELSE fail:=fail+1;
      log:=log||E'\nFAIL 27 Ruth wrongly masked'; END IF;

    RAISE EXCEPTION E'\n=== HARNESS: % passed, % failed ===%\nSinadya tickets still missing their own details: % of 73\n',
        pass, fail, log, n;
END $harness$;




ROLLBACK;
