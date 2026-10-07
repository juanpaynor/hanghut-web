-- Organizers were emailed the moment someone STARTED checkout.
--
-- trg_notify_organizer_on_registration fired AFTER INSERT ON event_registrations,
-- and an abandoned checkout still writes that row (it is where the answers live),
-- so every open cart emailed the organizer. Upper Room Worship was taking ~23
-- notifications a day with 210 of 1,320 registrations abandoned (16%); Anti Club
-- Running Club reported the same thing from the other end -- 12 of 28 rows on
-- SINADYA RUN 2026 were people who never paid.
--
-- Moving it wholesale to "on payment" would have broken the 5 events that use
-- require_approval: there the organizer MUST hear about a pending registration,
-- because nothing proceeds until they approve it. So the rule is conditional,
-- and between the two triggers each registration notifies exactly once.
--
--   require_approval (or invite_only) -> notify at registration, as before
--   everything else                   -> notify when a ticket is issued

-- ── 1. Registration-time notification, now only where approval is needed ───
CREATE OR REPLACE FUNCTION public.notify_organizer_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_secret text;
  v_needs_review boolean;
BEGIN
  SELECT (e.require_approval OR e.invite_only) INTO v_needs_review
  FROM events e WHERE e.id = NEW.event_id;

  -- On an ordinary event the registration means only "started checkout".
  -- trg_notify_organizer_on_paid_ticket below carries those instead.
  IF COALESCE(v_needs_review, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_secret := current_setting('app.settings.organizer_notify_secret', true);

  -- pg_net executes AFTER the current transaction commits, so registration_answers
  -- will be fully committed and fetchable by the edge function.
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
  -- Never block the registration insert on email failure
  RETURN NEW;
END;
$fn$;

-- ── 2. Payment-time notification ───────────────────────────────────────────
-- Hooked to TICKETS, not to purchase_intents going 'completed'. xendit-webhook
-- sets the intent to completed and only issues tickets afterwards, so an intent
-- trigger would fire while the tickets -- and the registration_id link -- do not
-- yet exist. A ticket row is also the honest definition of "they are in".
--
-- STATEMENT-level with a transition table: issue_tickets inserts a whole order
-- in one statement, so FOR EACH ROW would send one notification per ticket. A
-- 5-ticket order must notify once.
CREATE OR REPLACE FUNCTION public.notify_organizer_on_paid_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_secret text;
  r        record;
BEGIN
  v_secret := current_setting('app.settings.organizer_notify_secret', true);

  FOR r IN
    SELECT DISTINCT nt.registration_id, nt.event_id
    FROM new_tickets nt
    JOIN events e ON e.id = nt.event_id
    WHERE nt.registration_id IS NOT NULL
      -- Approval events already notified at registration; notifying again here
      -- would mean two emails for one person.
      AND COALESCE(e.require_approval, false) IS NOT TRUE
      AND COALESCE(e.invite_only, false) IS NOT TRUE
  LOOP
    PERFORM net.http_post(
      url     := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/notify-organizer-on-registration',
      body    := jsonb_build_object(
                   'registration_id', r.registration_id,
                   'event_id',        r.event_id
                 ),
      headers := jsonb_build_object(
                   'Content-Type',     'application/json',
                   'x-webhook-secret', COALESCE(v_secret, '')
                 )
    );
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- issue_tickets is the money path. A notification must never be able to fail
  -- it: the buyer's ticket matters more than the organizer's email.
  RAISE WARNING 'notify_organizer_on_paid_ticket failed: %', SQLERRM;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notify_organizer_on_paid_ticket ON public.tickets;
CREATE TRIGGER trg_notify_organizer_on_paid_ticket
AFTER INSERT ON public.tickets
REFERENCING NEW TABLE AS new_tickets
FOR EACH STATEMENT
EXECUTE FUNCTION public.notify_organizer_on_paid_ticket();
