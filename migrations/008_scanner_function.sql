-- Function to handle ticket scanning in a single DB call
-- Optimizes performance by reducing network round trips and combining checks

CREATE OR REPLACE FUNCTION scan_ticket(
  p_code text,
  p_user_id uuid,
  p_event_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket record;
  v_organizer_id uuid;
  v_is_authorized boolean;
  v_purchase_intent_guest text;
BEGIN
  -- 1. Find Ticket with strict join on Event
  -- We cast ID to text to compare with code safely
  SELECT 
    t.id, t.status, t.checked_in_at, t.guest_name, t.event_id,
    e.organizer_id, e.title as event_title,
    tt.name as tier_name,
    u.display_name as user_name,
    pi.guest_name as pi_guest_name
  INTO v_ticket
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN ticket_tiers tt ON t.tier_id = tt.id
  LEFT JOIN users u ON t.user_id = u.id
  LEFT JOIN purchase_intents pi ON t.purchase_intent_id = pi.id
  WHERE (
    t.id::text = p_code OR 
    t.qr_code = p_code OR 
    t.ticket_number = UPPER(p_code)
  )
  LIMIT 1;

  -- 2. Validation: Existence
  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ticket not found');
  END IF;

  -- 3. Validation: Event Match
  IF p_event_id IS NOT NULL AND v_ticket.event_id != p_event_id THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Wrong Event', 
      'details', 'Ticket is for ' || v_ticket.event_title,
      'ticket', jsonb_build_object('event_title', v_ticket.event_title)
    );
  END IF;

  -- 4. Authorization: User must be Owner or Team Member
  v_organizer_id := v_ticket.organizer_id;
  
  SELECT EXISTS (
    SELECT 1 FROM partners p WHERE p.id = v_organizer_id AND p.user_id = p_user_id
    UNION ALL
    SELECT 1 FROM partner_team_members ptm 
    WHERE ptm.partner_id = v_organizer_id 
    AND ptm.user_id = p_user_id 
    AND ptm.is_active = true
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized', 'details', 'You do not have permission to scan for this event');
  END IF;

  -- 5. Status Check
  -- Cast status to text for comparison to handle Enum types safely
  IF v_ticket.status::text = 'used' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'ALREADY SCANNED', 
      'details', 'Checked in at ' || to_char(v_ticket.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM'),
      'ticket', jsonb_build_object(
        'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
        'tier_name', v_ticket.tier_name
      )
    );
  ELSIF v_ticket.status::text IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Ticket Void', 
      'details', 'Status: ' || v_ticket.status,
      'ticket', jsonb_build_object(
        'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest')
      )
    );
  END IF;

  -- 6. Update Ticket (Check-in)
  -- Use dynamic SQL or direct update if enum allows casting
  UPDATE tickets 
  SET status = 'used', 
      checked_in_at = now(), 
      checked_in_by = p_user_id
  WHERE id = v_ticket.id;

  -- 7. Return Success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Valid Ticket',
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
      'tier_name', v_ticket.tier_name,
      'event_title', v_ticket.event_title,
      'checked_in_at', now()
    )
  );
END;
$$;
