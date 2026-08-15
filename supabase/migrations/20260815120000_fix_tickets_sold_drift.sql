-- Fix events.tickets_sold under-counting (team_comms #229)
--
-- ROOT CAUSE (not "the trigger is missing" — trg_sync_event_tickets_sold exists
-- and is correct). expire_stale_purchase_intents decremented the counter TWICE
-- for every abandoned checkout:
--   1. it flips tickets 'reserved' -> 'available', which fires
--      sync_event_tickets_sold and correctly decrements once; then
--   2. it ALSO ran `UPDATE events SET tickets_sold = tickets_sold - quantity`.
-- Net effect: each expired cart pushed the column one quantity BELOW truth,
-- permanently. That is exactly the always-negative drift the app team measured.
--
-- FIX: the trigger is the single writer. Remove the redundant explicit decrement,
-- then backfill every event from the tickets table.
--
-- CANONICAL DEFINITION (answers the app's semantics question):
--   events.tickets_sold == count(tickets where status <> 'available')
--                       == get_event_sold_count(event_id)
-- i.e. "not available for sale" — the AVAILABILITY metric. Refunded/cancelled
-- tickets are NOT returned to inventory (their rows stay 'refunded'), so they
-- correctly keep counting against capacity.
-- For revenue/"really sold", use the new get_event_paid_count (valid + used).

-- ---------------------------------------------------------------------------
-- 1. Remove the double-decrement. Body is byte-identical to the deployed
--    version except the `UPDATE events SET tickets_sold ...` block is gone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_purchase_intents()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_expired RECORD;
BEGIN
    FOR v_expired IN
        SELECT id, event_id, quantity
        FROM purchase_intents
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < now()
    LOOP
        -- Mark as expired
        UPDATE purchase_intents
           SET status = 'expired'
         WHERE id = v_expired.id;

        -- Release reserved tickets back to available.
        -- NOTE: this UPDATE fires trg_sync_event_tickets_sold, which decrements
        -- events.tickets_sold once per released ticket. Do NOT decrement the
        -- counter again here — that was the bug (see header).
        UPDATE tickets
           SET status = 'available',
               user_id = NULL,
               purchase_intent_id = NULL,
               updated_at = now()
         WHERE purchase_intent_id = v_expired.id
           AND status = 'reserved';

        RAISE LOG 'Expired stale intent % for event %, released % tickets',
            v_expired.id, v_expired.event_id, v_expired.quantity;
    END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. One-time backfill: recompute from the source of truth.
-- ---------------------------------------------------------------------------
UPDATE events e
   SET tickets_sold = c.cnt
  FROM (
        SELECT ev.id AS event_id,
               (SELECT count(*)
                  FROM tickets t
                 WHERE t.event_id = ev.id
                   AND t.status <> 'available')::int AS cnt
          FROM events ev
       ) c
 WHERE c.event_id = e.id
   AND e.tickets_sold IS DISTINCT FROM c.cnt;

-- ---------------------------------------------------------------------------
-- 3. Batch sold-counts RPC (app team's option 2) — lets list screens fetch real
--    counts for many events in ONE call instead of an N+1 storm. Kept even
--    though the column is now correct, so list screens have a trustworthy read
--    that never depends on denormalisation staying healthy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_events_sold_counts(p_event_ids uuid[])
 RETURNS TABLE(event_id uuid, sold_count int)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT e.id,
           (SELECT count(*)
              FROM tickets t
             WHERE t.event_id = e.id
               AND t.status <> 'available')::int
      FROM events e
     WHERE e.id = ANY(p_event_ids);
$function$;

-- ---------------------------------------------------------------------------
-- 4. Paid-count RPC — the "tickets actually SOLD" number for revenue displays.
--    Excludes reserved/pending_approval/approved (not paid yet) and
--    refunded/cancelled (money returned).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_paid_count(p_event_id uuid)
 RETURNS int
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT count(*)::int
      FROM tickets t
     WHERE t.event_id = p_event_id
       AND t.status IN ('valid', 'used');
$function$;

CREATE OR REPLACE FUNCTION public.get_events_paid_counts(p_event_ids uuid[])
 RETURNS TABLE(event_id uuid, paid_count int)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT e.id,
           (SELECT count(*)
              FROM tickets t
             WHERE t.event_id = e.id
               AND t.status IN ('valid', 'used'))::int
      FROM events e
     WHERE e.id = ANY(p_event_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_events_sold_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_paid_count(uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_events_paid_counts(uuid[])  TO anon, authenticated;
