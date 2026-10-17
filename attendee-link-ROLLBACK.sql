-- ROLLBACK for the attendee detail link (20261017120000 + 20261017120100).
--
-- Order matters: drop what depends on a thing before the thing. Safe to run
-- more than once.
--
-- WHAT THIS KEEPS. The answers attendees entered through the link are real
-- customer data and are NOT removed -- they are ordinary registration_answers
-- rows with ticket_id set, readable by every existing organizer surface. Same
-- for the event_registrations rows created for tickets that had none: deleting
-- those would re-break the 56 paid tickets that had no registration. Rolling
-- back removes the FEATURE, not the data it collected.
--
-- registration_answer_history is also kept. If something went wrong, that table
-- is the only record of what changed.

BEGIN;

-- 1. The write surface first, so nothing can be saved mid-rollback.
DROP FUNCTION IF EXISTS public.save_attendee_details(uuid, jsonb, uuid, text, text);
DROP FUNCTION IF EXISTS public.mint_attendee_sublink(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_attendee_details(uuid, text);
DROP FUNCTION IF EXISTS public.resolve_attendee_detail_token(uuid, text);

-- 2. Sublinks. Dropping the table kills every live forwarded link.
DROP TABLE IF EXISTS public.attendee_detail_sublinks;

-- 3. Coverage. ticket_detail_status goes before the function it calls.
DROP FUNCTION IF EXISTS public.ticket_detail_status(uuid);
DROP FUNCTION IF EXISTS public.event_required_question_ids(uuid, uuid, jsonb);

-- 4. Restore notify_organizer_on_registration to its pre-migration body,
--    i.e. without the hanghut.backfill_registration guard. Everything else is
--    identical.
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

-- 5. History. Commented out ON PURPOSE.
--
-- Uncomment only to remove the audit trail as well, and only if you are certain
-- you will not want it. Stopping the writes is the reversible half; dropping the
-- table is not.
--
-- DROP TRIGGER IF EXISTS trg_log_registration_answer_change ON public.registration_answers;
-- DROP FUNCTION IF EXISTS public.log_registration_answer_change();
-- DROP TABLE IF EXISTS public.registration_answer_history;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN ('20261017120000', '20261017120100');

COMMIT;
