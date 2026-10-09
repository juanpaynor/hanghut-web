-- Release abandoned unpaid registrations.
--
-- WHY (Anti Club Running Club, 2026-10-08): a registration row is written BEFORE
-- payment, and nothing ever clears it. expire_stale_purchase_intents expires the
-- intent and releases the tickets, but never touches event_registrations, so an
-- abandoned checkout sits in the organizer's roster forever, indistinguishable
-- from a real attendee — 14 of 37 on SINADYA RUN 2026.
--
-- WHAT THIS DOES NOT CLAIM. The same organizer reports that non-payers "can't go
-- back and pay". That is NOT diagnosed and this is not a fix for it:
-- submit_event_request REUSES an existing auto_approved row rather than
-- inserting, so the unique indexes are never reached on a return visit and
-- cannot be the cause. Do not cite this migration as having fixed that.
--
-- Released rows are set to the EXISTING 'cancelled' status, so this migration is
-- purely additive — no constraint or index is rebuilt, and the unique indexes
-- already exclude 'cancelled', so a released customer is free to register again.
-- An earlier draft added a distinct 'abandoned' status to separate "backed out"
-- from "system released"; it was dropped because the index rebuild it required
-- existed only to serve the mistaken diagnosis above. Revisit if organizers need
-- to tell the two apart.
--
-- OPT-IN, PER EVENT, AND DELIBERATELY SO. Applying this globally would have
-- released 159 unpaid registrations on Upper Room Worship's "Back to the Garden",
-- an upcoming event whose organizer never asked for it and who may be working
-- those leads. Nothing happens until an event sets abandon_unpaid_after_hours.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS abandon_unpaid_after_hours integer;

COMMENT ON COLUMN public.events.abandon_unpaid_after_hours IS
    'Hours of no payment after which an unpaid registration is released to cancelled, dropping it out of the organizer''s roster. NULL = disabled (the default; opt-in per event).';

ALTER TABLE public.events
    ADD CONSTRAINT events_abandon_window_sane
    CHECK (abandon_unpaid_after_hours IS NULL OR abandon_unpaid_after_hours BETWEEN 1 AND 720);

CREATE OR REPLACE FUNCTION public.expire_stale_registrations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH released AS (
        UPDATE event_registrations r
           SET status = 'cancelled',
               updated_at = now()
          FROM events e
         WHERE e.id = r.event_id
           AND e.abandon_unpaid_after_hours IS NOT NULL
           AND r.status IN ('auto_approved', 'approved')
           AND r.created_at < now() - make_interval(hours => e.abandon_unpaid_after_hours)
           -- Upcoming only. Releasing a slot is pointless once the event has run,
           -- and rewriting a finished event's roster destroys the organizer's record.
           AND coalesce(e.end_datetime, e.start_datetime) > now()
           -- PAID registrations only. A free RSVP never produces a payment, so
           -- without this the job would wipe legitimate attendees — 521 of them on
           -- one worship night alone. The tier they chose decides it, falling back
           -- to the event price, so a free tier on a mixed event stays safe.
           AND (CASE
                    WHEN r.tier_id IS NOT NULL
                        THEN coalesce((SELECT t.price FROM ticket_tiers t WHERE t.id = r.tier_id), 0) > 0
                    ELSE coalesce(e.ticket_price, 0) > 0
                END)
           -- Never paid, by any route.
           AND NOT EXISTS (
                SELECT 1 FROM purchase_intents pi
                 WHERE pi.event_id = r.event_id
                   AND pi.status = 'completed'
                   AND ((r.user_id IS NOT NULL AND pi.user_id = r.user_id)
                        OR lower(pi.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
           -- Holds no live ticket by any route (box office, offline, comp).
           AND NOT EXISTS (
                SELECT 1 FROM tickets tk
                 WHERE tk.event_id = r.event_id
                   AND tk.status NOT IN ('cancelled', 'refunded', 'available')
                   AND ((r.user_id IS NOT NULL AND tk.user_id = r.user_id)
                        OR lower(tk.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
           -- Mid-checkout right now: a pending intent that has not expired yet.
           -- Releasing the registration under someone on the GCash screen would
           -- break the payment they are in the middle of making.
           AND NOT EXISTS (
                SELECT 1 FROM purchase_intents pi
                 WHERE pi.event_id = r.event_id
                   AND pi.status = 'pending'
                   AND (pi.expires_at IS NULL OR pi.expires_at > now())
                   AND ((r.user_id IS NOT NULL AND pi.user_id = r.user_id)
                        OR lower(pi.guest_email) = lower(coalesce(
                             (SELECT u.email FROM users u WHERE u.id = r.user_id), r.guest_email)))
           )
        RETURNING r.id
    )
    SELECT count(*) INTO v_count FROM released;

    IF v_count > 0 THEN
        RAISE LOG 'Released % abandoned unpaid registration(s)', v_count;
    END IF;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_registrations() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.expire_stale_registrations() IS
    'Releases unpaid registrations to cancelled on events that opted in via events.abandon_unpaid_after_hours, so abandoned checkouts stop appearing as attendees. Free, past, mid-checkout and already-paid registrations are all excluded. Does NOT address the separate, undiagnosed report that non-payers cannot return to pay.';

-- Scheduled every 15 minutes (pg_cron jobid 37), matching the cadence of the
-- sibling expire-stale-* jobs. Applied to prod 2026-10-08; SINADYA RUN 2026
-- opted in at 3 hours and released 14 abandoned registrations on the first run,
-- leaving its 23 paid attendees untouched.
SELECT cron.schedule(
  'expire-stale-registrations',
  '*/15 * * * *',
  $cron$SELECT public.expire_stale_registrations()$cron$
);
