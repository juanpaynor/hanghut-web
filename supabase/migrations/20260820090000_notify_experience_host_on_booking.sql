-- Notify the HOST when an experience booking is paid.
--
-- Gap this closes (confirmed with the app team, team_comms #257): nothing told a
-- host they had a sale. send-experience-confirmation emails the BUYER only, and the
-- app only pushes to the host when the buyer actually SENDS a DM — there is no
-- "new participant joined" ping. So an organiser could sell a ₱2,000 workshop and
-- not find out until they happened to open the dashboard.
--
-- Mirrors the existing events pattern (notify_ticket_confirmed on purchase_intents):
-- inserting into public.notifications is enough, because trigger_notifications_webhook
-- fans it out to push via pgmq.send('push_notifications', ...). That is a durable
-- queue, NOT pg_net, so this adds no polling/HTTP load.
--
-- ONE DELIBERATE DIFFERENCE from notify_ticket_confirmed: the whole body is wrapped
-- in an exception handler. This trigger fires inside the same transaction as
-- confirm_experience_booking, i.e. on the money path — a failed notification insert
-- would otherwise roll back a PAID booking (no ledger row, no participant). A missed
-- push is recoverable; a lost payment is not. notify_ticket_confirmed has no such
-- guard and carries the same latent risk on the events side.

CREATE OR REPLACE FUNCTION public.notify_experience_host_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_host_id uuid;
  v_title   text;
  v_buyer   text;
BEGIN
  -- Only on the transition into 'completed'
  IF OLD.status = NEW.status OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT t.host_id, t.title INTO v_host_id, v_title
    FROM public.tables t
    WHERE t.id = NEW.table_id;

    IF v_host_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Don't ping a host who booked their own experience (test bookings, comps).
    IF v_host_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- guest_name is the buyer's primary contact name (experiences are account-only;
    -- the app pre-fills it from the profile), so prefer it, then display_name.
    v_buyer := COALESCE(
      NULLIF(btrim(NEW.guest_name), ''),
      (SELECT u.display_name FROM public.users u WHERE u.id = NEW.user_id),
      'Someone'
    );

    -- type MUST satisfy notifications_type_check. There is no experience-specific
    -- type allowed, and adding one is not free: that constraint exists to keep types
    -- in lockstep with client rendering, so a brand-new value would arrive unrendered
    -- and unrouted until the app ships a NATIVE release (per team_comms #258, their
    -- intent-filter work already rides a full release, not a patch).
    --
    -- 'member_joined' is used instead: already allowed, already rendered, already
    -- routed by entity_id — and semantically correct, since an experience IS a
    -- `tables` row and a paid booking really is a member joining it. The sale detail
    -- lives in title/body, which clients render regardless of type.
    --
    -- NOTE: the first version of this migration used 'experience_booking' and was
    -- applied to prod. It violated the CHECK on every booking and was swallowed by the
    -- handler below — which is exactly why that handler exists: without it, a rejected
    -- NOTIFICATION would have rolled back a PAID booking.
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      v_host_id,
      NEW.user_id,
      'member_joined',
      'New booking! 🎉',
      v_buyer || ' booked ' || NEW.quantity || ' spot' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' for ' || COALESCE(v_title, 'your experience') || '.',
      -- entity_id = the experience (tables row) so a generic "open entity" tap route
      -- works even before the app adds explicit handling for this type.
      NEW.table_id,
      jsonb_build_object(
        'table_id',    NEW.table_id::text,
        'intent_id',   NEW.id::text,
        'schedule_id', NEW.schedule_id::text,
        'quantity',    NEW.quantity,
        'total_amount', NEW.total_amount,
        -- lets a client tell a paid experience booking apart from a generic join,
        -- without needing a new (constraint- and release-gated) notification type
        'kind',        'experience_booking'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_experience_host_booked failed for intent %: % (booking NOT rolled back)',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_experience_booking_confirmed ON public.experience_purchase_intents;

CREATE TRIGGER on_experience_booking_confirmed
AFTER UPDATE ON public.experience_purchase_intents
FOR EACH ROW EXECUTE FUNCTION public.notify_experience_host_booked();

COMMENT ON FUNCTION public.notify_experience_host_booked() IS
  'Notifies the experience host when a booking is paid. Exception-safe on purpose: runs in the same transaction as confirm_experience_booking, so a notification failure must never roll back a paid booking. Emits notifications.type = ''member_joined'' because notifications_type_check allows no experience-specific type and a new one would be unrendered until the app ships a native release; the sale detail is carried in title/body.';
