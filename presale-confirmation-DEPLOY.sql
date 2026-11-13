-- DEPLOY: pre-registration confirmation + conversion stats  -- IMPROVEMENTS 1, 4, 5
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- ORDER:
--   1. this file
--   2. supabase functions deploy process-payment-queue      <-- NO --no-verify-jwt
--      (verify_jwt is TRUE on that one; cron passes a service role key)
--   3. push the frontend
-- Running 1 before 2 is safe: the queue message sits there until the consumer
-- knows the type, and pgmq keeps it rather than dropping it.
--
-- WHAT PROBLEM 1 IS.
--
-- event_registrations has exactly two triggers today: one stamps updated_at,
-- the other emails the ORGANIZER. The buyer's own confirmation
-- (send-registration-email) fires ONLY from the manual approve/reject paths.
-- So on a presale with no approval step, a person hands over their name, phone
-- and answers, presses submit, and receives nothing at all -- then silence
-- until an on-sale email they have no reason to expect or trust.
--
-- Rollback:
--   DROP TRIGGER trg_presale_confirmation ON public.event_registrations;
--   DROP FUNCTION public.send_presale_confirmation();
--   DROP FUNCTION public.presale_conversion(uuid);

BEGIN;

-- ===========================================================================
-- 1. THE CONFIRMATION
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.send_presale_confirmation()
RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_event   record;
    v_to      text;
    v_name    text;
    v_token   uuid;
    v_opens   text;
    v_html    text;
BEGIN
    -- ⚠ SCOPED TO PRESALE EVENTS ONLY. Firing on every registration would start
    -- mailing 482 events' worth of people who have never had a confirmation and
    -- whose organizers have not asked for one. A presale is different: the whole
    -- arrangement is "give us your details now, buy later", and that promise
    -- needs something in writing.
    SELECT e.id, e.title, e.presale_starts_at, e.slug, p.business_name
      INTO v_event
      FROM events e
      LEFT JOIN partners p ON p.id = e.organizer_id
     WHERE e.id = NEW.event_id
       AND e.presale_starts_at IS NOT NULL;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Only people who can actually use it. A 'pending' registrant on an
    -- approval event must not be told they are on the list.
    IF NEW.status::text NOT IN ('approved', 'auto_approved') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(NEW.guest_email, u.email),
           COALESCE(NULLIF(btrim(NEW.guest_name), ''), u.display_name)
      INTO v_to, v_name
      FROM (SELECT 1) dummy
      LEFT JOIN users u ON u.id = NEW.user_id;

    IF v_to IS NULL OR position('@' in v_to) = 0 THEN
        RETURN NEW;
    END IF;

    -- Mint their link now, so the confirmation and the later announcement carry
    -- the SAME one. ON CONFLICT keeps it stable if they register twice.
    INSERT INTO event_presale_access (event_id, registration_id, email)
    VALUES (NEW.event_id, NEW.id, lower(v_to))
    ON CONFLICT (registration_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING token INTO v_token;

    v_opens := to_char(v_event.presale_starts_at AT TIME ZONE 'Asia/Manila',
                       'FMDay FMDD FMMonth, FMHH12:MI AM');

    v_html :=
        '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;'
        || 'max-width:520px;margin:0 auto;color:#17152f;line-height:1.55">'
        || '<p style="font-size:16px">Hi ' || COALESCE(split_part(btrim(v_name), ' ', 1), 'there') || ',</p>'
        || '<p style="font-size:16px">You are on the list for <strong>'
        ||     replace(replace(v_event.title, '&', '&amp;'), '<', '&lt;') || '</strong>.</p>'
        || '<p style="font-size:16px">Tickets open to you on <strong>' || v_opens
        || '</strong> (Manila time). We will email you when they do — you do not need to do anything until then.</p>'
        || '<p style="margin:24px 0"><a href="https://hanghut.com/events/'
        ||     COALESCE(v_event.slug, v_event.id::text) || '?pt=' || v_token::text
        || '" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;'
        || 'text-decoration:none;font-weight:600;display:inline-block">View the event</a></p>'
        || '<p style="font-size:14px;color:#666">This link is yours and is how we know you are on the list, '
        || 'so please keep it to yourself. Being on the list does not reserve a ticket — '
        || 'it means you can buy before everyone else.</p></div>';

    -- Enqueued, not sent. send-registration-email runs with verify_jwt = true,
    -- so calling it from here would mean keeping a service-role key in a
    -- database setting. process-payment-queue already holds one, already
    -- retries, and already dead-letters.
    PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
        'type', 'send_simple_email',
        'data', jsonb_build_object(
            'to', v_to,
            'subject', 'You''re on the list for ' || v_event.title,
            'html', v_html,
            'sender_name', COALESCE(v_event.business_name, 'HangHut')
        )
    ));

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- NEVER block the registration on a mail failure. Losing the confirmation
    -- is a nuisance; losing the registration is the attendee.
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_presale_confirmation ON public.event_registrations;
CREATE TRIGGER trg_presale_confirmation
    AFTER INSERT ON public.event_registrations
    FOR EACH ROW EXECUTE FUNCTION public.send_presale_confirmation();


-- ===========================================================================
-- 2. DID IT WORK?  (improvements 4 and 5)
-- ===========================================================================
--
-- One row: how many are on the list, how many of them actually bought, and how
-- many tickets are left to sell them. Without this an organizer has no way to
-- tell whether a presale earned its complexity, and no warning that 412 people
-- are chasing 300 tickets until the angry messages start.

CREATE OR REPLACE FUNCTION public.presale_conversion(p_event_id uuid)
RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
    WITH people AS (
        -- One row per PERSON, matching presale_announcement_list. Counting
        -- registrations instead would inflate the denominator and make every
        -- presale look worse than it was.
        SELECT DISTINCT lower(COALESCE(r.guest_email, u.email)) AS addr
          FROM event_registrations r
          LEFT JOIN users u ON u.id = r.user_id
         WHERE r.event_id = p_event_id
           AND r.status::text IN ('approved', 'auto_approved')
           AND COALESCE(r.guest_email, u.email) IS NOT NULL
    ),
    buyers AS (
        SELECT DISTINCT lower(COALESCE(t.guest_email, u.email)) AS addr
          FROM tickets t
          LEFT JOIN users u ON u.id = t.user_id
         WHERE t.event_id = p_event_id
           AND t.status::text IN ('valid', 'used')
           AND COALESCE(t.guest_email, u.email) IS NOT NULL
    ),
    tiers AS (
        SELECT COALESCE(sum(quantity_total), 0) AS total,
               COALESCE(sum(quantity_sold), 0)  AS sold
          FROM ticket_tiers WHERE event_id = p_event_id
    )
    SELECT jsonb_build_object(
        'on_list',      (SELECT count(*) FROM people),
        'bought',       (SELECT count(*) FROM people p WHERE EXISTS (SELECT 1 FROM buyers b WHERE b.addr = p.addr)),
        'tickets_left', GREATEST((SELECT total - sold FROM tiers), 0),
        -- NULL rather than 0 when there are no capped tiers: "0 left" and "no
        -- cap set" are different facts and the UI must not warn on the second.
        'capped',       (SELECT total > 0 FROM tiers)
    );
$fn$;

REVOKE ALL ON FUNCTION public.presale_conversion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.presale_conversion(uuid) TO service_role;

COMMENT ON FUNCTION public.presale_conversion(uuid) IS
    'Presale outcome for the organizer: {on_list, bought, tickets_left, capped}. Counts PEOPLE (distinct lowercased email), matching presale_announcement_list. service_role only.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113120000', 'presale_confirmation_and_stats')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1 (read-only): the trigger exists, and it is the THIRD on the table.
-- ===========================================================================
SELECT t.tgname, p.proname AS fires
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'public.event_registrations'::regclass AND NOT t.tgisinternal
 ORDER BY t.tgname;

-- ===========================================================================
-- VERIFY 2 (read-only): grants on the stats function. service_role only.
-- ===========================================================================
SELECT p.oid::regprocedure AS signature,
       COALESCE((SELECT string_agg(DISTINCT ae.grantee::regrole::text, ',' ORDER BY ae.grantee::regrole::text)
                   FROM aclexplode(p.proacl) ae WHERE ae.privilege_type = 'EXECUTE'),
                'default (= PUBLIC)') AS execute_grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('presale_conversion', 'send_presale_confirmation');

-- ===========================================================================
-- VERIFY 3 (read-only): the trigger CANNOT fire on anything live today,
-- because it returns early unless the event has a presale date. Expect 0.
-- ===========================================================================
SELECT count(*) AS events_the_trigger_can_fire_on
  FROM public.events
 WHERE presale_starts_at IS NOT NULL;

-- ===========================================================================
-- The behavioural test (does it actually enqueue? does it stay silent on a
-- normal event?) is deliberately NOT here. It has to INSERT a registration and
-- UPDATE an event to prove anything, and on a live event a rollback that did
-- not take would leave a real presale running against a live purchase gate.
-- That test is run separately against a DRAFT event instead.
-- ===========================================================================
