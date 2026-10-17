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

BEGIN;

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

COMMIT;
