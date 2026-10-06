-- ============================================================================
-- Show a buyer their badges on the ticket page.
--
-- THE PROBLEM THIS SOLVES. Badges are keyed on lowercased email, and 91% of
-- holders checked out as guests with no HangHut account -- KOOLPALS' biggest
-- badge is visible to 12 of its 306 holders (4%). Every reward we might attach
-- to a badge is worth 4% of its value while that holds.
--
-- The ticket page is the one surface that reaches 100% of them: every buyer gets
-- this link whether or not they ever make an account, and the token they already
-- hold is the credential. No app, no signup, no email.
--
-- SCOPED TO THIS EVENT'S ORGANIZER. A buyer's badges from OTHER partners are
-- deliberately not returned: this page is reachable by anyone the buyer forwards
-- it to, and "which other organizers do you buy from" is not this organizer's
-- business, nor something a forwarded link should disclose.
--
-- Everything above the badges block is unchanged from the live definition.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ticket_order(p_token uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT CASE WHEN pi.id IS NULL THEN NULL ELSE json_build_object(
    'order_id', pi.id,
    'buyer_name', COALESCE(pi.guest_name, u.display_name),
    'event', json_build_object(
      'id', e.id,
      'title', e.title,
      'venue_name', e.venue_name,
      'start_datetime', e.start_datetime,
      'end_datetime', e.end_datetime,
      'cover_image_url', e.cover_image_url,
      'is_online', e.is_online,
      -- Reaching this function means holding the order's access token, the same
      -- proof of purchase the tickets rest on. Refunded and cancelled orders get
      -- NULL, so a refunded buyer cannot keep walking into the room.
      'online_url', CASE
        WHEN e.is_online AND pi.status = 'completed' THEN oa.join_url
        ELSE NULL
      END
    ),
    'organizer', json_build_object(
      'name', p.business_name,
      'logo_url', p.profile_photo_url,
      'branding', p.branding
    ),
    'tickets', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'ticket_number', t.ticket_number,
        'qr_code', t.qr_code,
        'status', t.status,
        'tier', COALESCE(tt.name, t.tier),
        'tier_sort', tt.sort_order,
        'seat_info', t.seat_info
      ) ORDER BY t.created_at, t.id), '[]'::json)
      FROM tickets t
      LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
      WHERE t.purchase_intent_id = pi.id
        AND t.status::text IN ('valid','used','confirmed','approved')
    ),
    -- Badges this buyer holds FROM THIS ORGANIZER.
    --
    -- Matched on lowercased email, the canonical customer key (team_comms #239),
    -- so it works identically for a guest and for a signed-in buyer. Served off
    -- idx_user_creator_badges_email.
    --
    -- art_suppressed means the art was pulled by moderation; the badge still
    -- exists and is still held, it just falls back to the tier treatment -- the
    -- same rule the storefront already applies. holder_count rides along so the
    -- page can say how rare it is.
    'badges', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', b.id,
        'name', b.name,
        'description', b.description,
        'tier', b.tier,
        'art_url', CASE WHEN b.art_suppressed THEN NULL ELSE b.art_url END,
        'holder_count', b.holder_count,
        'earned_at', ucb.earned_at
      ) ORDER BY ucb.earned_at DESC), '[]'::json)
      FROM user_creator_badges ucb
      JOIN creator_badges b ON b.id = ucb.badge_id
      WHERE ucb.buyer_email = lower(COALESCE(u.email, pi.guest_email))
        AND b.organizer_id = e.organizer_id
        AND b.is_active
    )
  ) END
  FROM purchase_intents pi
  JOIN events e ON e.id = pi.event_id
  LEFT JOIN event_online_access oa ON oa.event_id = e.id
  LEFT JOIN partners p ON p.id = e.organizer_id
  LEFT JOIN users u ON u.id = pi.user_id
  WHERE pi.access_token = p_token;
$function$;
