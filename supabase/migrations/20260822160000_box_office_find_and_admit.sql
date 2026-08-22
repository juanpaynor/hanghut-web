-- Find a buyer at the door, and let them in.
--
-- The most common door problem is not selling — it is someone who already bought
-- and cannot produce the ticket (dead phone, wrong inbox, bought under a
-- partner's email). /scan takes an exact code or nothing, so today that person
-- stops the queue. These two functions are that missing path.
--
-- Both are SECURITY DEFINER on purpose. A 'cashier' can SELECT tickets under RLS
-- but the tickets UPDATE policy covers only owner/manager/scanner, so a plain
-- client-side update would silently refuse exactly the person working the door.
--
-- Note both casts of t.status: tickets.status is the `ticket_status` ENUM, not
-- text. (partner_team_members.role is likewise the `partner_role` enum —
-- {owner,manager,scanner,finance,marketing,cashier} — not free text.)

CREATE OR REPLACE FUNCTION public.find_attendees_at_door(
    p_event_id uuid, p_query text, p_limit integer DEFAULT 25
)
RETURNS TABLE (
    ticket_id uuid, ticket_number text, attendee_name text, attendee_email text,
    tier_name text, status text, checked_in_at timestamptz, seat_info jsonb,
    source text, order_quantity integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_org uuid; v_q text;
BEGIN
    SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to look up attendees for this event';
    END IF;

    v_q := btrim(COALESCE(p_query, ''));
    -- Two characters is the floor: a single letter would return the whole room and
    -- read as "the search is broken" rather than "be more specific".
    IF length(v_q) < 2 THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.ticket_number,
        -- Registered buyer first, then the guest name the intent carried. Before
        -- the populate_ticket_guest_info fix this second branch was always NULL.
        COALESCE(u.display_name, t.guest_name, pi.guest_name),
        COALESCE(u.email, t.guest_email, pi.guest_email),
        tt.name,
        t.status::text,
        t.checked_in_at,
        t.seat_info,
        pi.source,
        pi.quantity
    FROM tickets t
    LEFT JOIN users u          ON u.id  = t.user_id
    LEFT JOIN ticket_tiers tt  ON tt.id = t.tier_id
    LEFT JOIN purchase_intents pi ON pi.id = t.purchase_intent_id
    WHERE t.event_id = p_event_id
      -- 'available' is unsold inventory, not a person. Everything else — valid,
      -- used, cancelled — is someone staff may legitimately be looking for, and
      -- seeing "this was refunded" beats seeing nothing.
      AND t.status::text <> 'available'
      AND (
            t.ticket_number ILIKE '%' || v_q || '%'
         OR t.guest_name    ILIKE '%' || v_q || '%'
         OR t.guest_email   ILIKE '%' || v_q || '%'
         OR pi.guest_name   ILIKE '%' || v_q || '%'
         OR pi.guest_email  ILIKE '%' || v_q || '%'
         OR u.display_name  ILIKE '%' || v_q || '%'
         OR u.email         ILIKE '%' || v_q || '%'
      )
    -- Not-yet-arrived first: that is who is standing at the door.
    ORDER BY (t.checked_in_at IS NOT NULL), COALESCE(u.display_name, t.guest_name)
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admit_ticket_at_door(p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t record; v_org uuid; v_by text;
BEGIN
    SELECT t.id, t.event_id, t.status::text AS status, t.checked_in_at, t.checked_in_by,
           COALESCE(u.display_name, t.guest_name) AS who
    INTO v_t
    FROM tickets t LEFT JOIN users u ON u.id = t.user_id
    WHERE t.id = p_ticket_id;

    IF v_t.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND',
                                  'message', 'That ticket does not exist.');
    END IF;

    SELECT organizer_id INTO v_org FROM events WHERE id = v_t.event_id;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to admit for this event';
    END IF;

    IF v_t.checked_in_at IS NOT NULL THEN
        SELECT display_name INTO v_by FROM users WHERE id = v_t.checked_in_by;
        RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_IN',
            'message', 'Already checked in.', 'who', v_t.who,
            'checked_in_at', v_t.checked_in_at,
            'checked_in_by_name', COALESCE(v_by, 'someone on the team'));
    END IF;

    -- A refunded or cancelled ticket must never open the door.
    IF v_t.status NOT IN ('valid', 'paid', 'sold', 'reserved') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_STATUS',
            'message', 'This ticket is ' || v_t.status || '.', 'who', v_t.who);
    END IF;

    UPDATE tickets
    SET status = 'used', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object('ok', true, 'who', v_t.who);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_attendees_at_door(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admit_ticket_at_door(uuid) TO authenticated;
