-- The definition of public.scan_ticket as it stands on PRODUCTION, captured
-- 2026-11-05 before phase0-table-admission-DEPLOY.sql.
--
-- Run this file to undo Phase 0's behaviour change. The `admits` / `admitted`
-- columns can stay: this version never reads them.

CREATE OR REPLACE FUNCTION public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ticket record; v_organizer_id uuid; v_is_authorized boolean; v_who jsonb;
  -- A real session always wins; p_user_id is honoured only for service-role
  -- callers, which is the scanner backend and web's box office.
  v_actor uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  SELECT
    t.id, t.status, t.checked_in_at, t.guest_name, t.event_id, t.seat_info,
    e.organizer_id, e.title as event_title, tt.name as tier_name,
    u.display_name as user_name, pi.guest_name as pi_guest_name
  INTO v_ticket
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN ticket_tiers tt ON t.tier_id = tt.id
  LEFT JOIN users u ON t.user_id = u.id
  LEFT JOIN purchase_intents pi ON t.purchase_intent_id = pi.id
  WHERE (t.id::text = p_code OR t.qr_code = p_code OR t.ticket_number = UPPER(p_code))
  LIMIT 1;

  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'TICKET_NOT_FOUND',
      'message', 'Ticket not found');
  END IF;

  IF p_event_id IS NOT NULL AND v_ticket.event_id != p_event_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'WRONG_EVENT',
      'message', 'Wrong Event',
      'details', 'Ticket is for ' || v_ticket.event_title,
      'ticket', jsonb_build_object('event_title', v_ticket.event_title));
  END IF;

  v_organizer_id := v_ticket.organizer_id;
  SELECT EXISTS (
    SELECT 1 FROM partners p WHERE p.id = v_organizer_id AND p.user_id = v_actor
    UNION ALL
    SELECT 1 FROM partner_team_members ptm
    WHERE ptm.partner_id = v_organizer_id AND ptm.user_id = v_actor
      AND ptm.is_active = true
      AND ptm.role IN ('owner', 'manager', 'scanner', 'cashier')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED',
      'message', 'Unauthorized',
      'details', 'You do not have permission to scan for this event');
  END IF;

  v_who := jsonb_build_object(
    'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
    'tier_name', v_ticket.tier_name,
    'seat', v_ticket.seat_info);

  IF v_ticket.status::text = 'used' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN',
      'message', 'ALREADY SCANNED',
      'details', 'Checked in at ' || to_char(v_ticket.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM'),
      'checked_in_at', v_ticket.checked_in_at,
      'ticket', v_who);

  ELSIF v_ticket.status::text IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'code', 'TICKET_VOID',
      'message', 'Ticket Void',
      'details', 'Status: ' || v_ticket.status,
      'ticket', v_who);

  ELSIF v_ticket.status::text NOT IN ('valid', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_SOLD',
      'message', 'Not a valid ticket',
      'details', CASE v_ticket.status::text
          WHEN 'available'        THEN 'This ticket has not been sold'
          WHEN 'reserved'         THEN 'Held but not paid for'
          WHEN 'pending_approval' THEN 'Registration has not been approved'
          ELSE 'Status: ' || v_ticket.status END,
      'ticket', v_who);
  END IF;

  UPDATE tickets
  SET status = 'used', checked_in_at = now(), checked_in_by = v_actor
  WHERE id = v_ticket.id;

  RETURN jsonb_build_object('success', true, 'code', 'OK',
    'message', 'Valid Ticket',
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
      'tier_name', v_ticket.tier_name,
      'event_title', v_ticket.event_title,
      'seat', v_ticket.seat_info,
      'checked_in_at', now()));
END;
$function$;
