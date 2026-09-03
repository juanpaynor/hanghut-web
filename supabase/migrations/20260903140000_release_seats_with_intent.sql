-- Free the SEAT when the intent dies, not three minutes later on its own clock.
--
-- WHY. assign_seats_to_intent parks a seat_holds row keyed by the intent id and
-- gives it an 18-minute TTL (long on purpose: it must outlive the 15-minute
-- payment window so a seat is never freed while its buyer can still legitimately
-- pay). expire_stale_purchase_intents then released the intent's TICKETS but
-- never its SEAT — the two ran on unconnected clocks:
--
--     15-25 min   ticket back on sale   (15m expiry + a */10 sweep)
--     18 min      seat hold lapses, unrelated
--
-- So an abandoned checkout put the ticket back in inventory while the seat stayed
-- dark, and on a map where a section is one couch that reads as a whole section
-- sold out for a quarter of an hour. Coupling them here means the 18 minutes only
-- ever applies to a checkout that is still ALIVE — which is the case it was
-- chosen for — and an abandoned one frees its seat the moment it is declared dead.
--
-- The hold is matched on session_id = the intent id, which is what
-- assign_seats_to_intent writes when it hands the picker's hold over to checkout.
--
-- seats.status is deliberately NOT touched: it stays 'available' throughout and
-- only flips to 'booked' on payment. Availability is `status='available' AND NOT
-- EXISTS (unexpired hold)`, so deleting the hold IS the release, and it takes
-- effect immediately rather than waiting for the seat-hold GC cron.

CREATE OR REPLACE FUNCTION public.expire_stale_purchase_intents()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_expired RECORD;
    v_seats   INTEGER;
BEGIN
    FOR v_expired IN
        SELECT id, event_id, quantity
        FROM purchase_intents
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < now()
    LOOP
        UPDATE purchase_intents
           SET status = 'expired'
         WHERE id = v_expired.id;

        -- Releasing these fires trg_sync_event_tickets_sold, which decrements
        -- events.tickets_sold once per ticket. Do NOT decrement again here —
        -- the old explicit `tickets_sold - quantity` made every abandoned cart
        -- push the counter permanently below truth (team_comms #229).
        UPDATE tickets
           SET status = 'available',
               user_id = NULL,
               purchase_intent_id = NULL,
               updated_at = now()
         WHERE purchase_intent_id = v_expired.id
           AND status = 'reserved';

        -- THE SEAT, in the same breath as the ticket.
        DELETE FROM seat_holds
         WHERE session_id = v_expired.id::text;
        GET DIAGNOSTICS v_seats = ROW_COUNT;

        RAISE LOG 'Expired stale intent % for event %, released % tickets and % seat hold(s)',
            v_expired.id, v_expired.event_id, v_expired.quantity, v_seats;
    END LOOP;
END;
$function$;
