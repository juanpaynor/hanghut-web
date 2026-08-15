-- Fix ticket tier attribution (team_comms #231)
--
-- tickets.tier_id was NEVER set by issue_tickets, so update_tier_quantity_sold
-- short-circuited on NULL and ticket_tiers.quantity_sold stayed 0 forever.
-- That made the sell-out gate in create-purchase-intent
-- (quantity_sold + qty > quantity_total) impossible to trip: EVERY TIER WAS
-- INFINITELY SELLABLE. A tier capped at 1 could sell unlimited.
--
-- The tier trigger itself is fine — it does an absolute recompute, so it cannot
-- drift the way events.tickets_sold did. It just never ran.

CREATE OR REPLACE FUNCTION public.issue_tickets(p_intent_id uuid, p_registration_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tickets JSON;
BEGIN
  IF p_registration_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tickets
    WHERE registration_id = p_registration_id
      AND status::text IN ('valid', 'used')
  ) THEN
    -- Already ticketed for this registration — release these reserved rows and
    -- issue nothing (caller treats empty result as "no new tickets, no email").
    UPDATE tickets
    SET status = 'available', purchase_intent_id = NULL, held_until = NULL, updated_at = NOW()
    WHERE purchase_intent_id = p_intent_id AND status = 'reserved';
    RETURN '[]'::json;
  END IF;

  UPDATE tickets
  SET
    status = 'valid',
    user_id = (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
    -- Carry the tier from the intent onto the issued ticket. Without this the
    -- tier trigger never fires and tier inventory can never sell out.
    tier_id = COALESCE(tier_id, (SELECT tier_id FROM purchase_intents WHERE id = p_intent_id)),
    qr_code = generate_qr_code(id, event_id, (SELECT user_id FROM purchase_intents WHERE id = p_intent_id)),
    registration_id = COALESCE(p_registration_id, registration_id),
    created_at = NOW(),
    updated_at = NOW()
  WHERE purchase_intent_id = p_intent_id AND status = 'reserved';

  SELECT json_agg(json_build_object(
    'ticket_number', ticket_number,
    'qr_code', qr_code,
    'seat_info', seat_info
  ))
  INTO v_tickets
  FROM tickets
  WHERE purchase_intent_id = p_intent_id;

  RETURN v_tickets;
END;
$function$;

-- Recover historical attribution from the intent (100 of 104 sold tickets).
UPDATE tickets t
   SET tier_id = pi.tier_id
  FROM purchase_intents pi
 WHERE pi.id = t.purchase_intent_id
   AND t.tier_id IS NULL
   AND pi.tier_id IS NOT NULL;

-- One-time recompute. The trigger maintains it from here.
UPDATE ticket_tiers tt
   SET quantity_sold = (
        SELECT count(*) FROM tickets t
         WHERE t.tier_id = tt.id
           AND t.status NOT IN ('available', 'cancelled', 'refunded'))
 WHERE tt.quantity_sold IS DISTINCT FROM (
        SELECT count(*) FROM tickets t
         WHERE t.tier_id = tt.id
           AND t.status NOT IN ('available', 'cancelled', 'refunded'));
