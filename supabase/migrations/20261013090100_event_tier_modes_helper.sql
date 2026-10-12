-- One authoritative answer to "is this tier general admission or assigned
-- seating?", so that no buyer surface has to guess.
--
-- WHY THIS HAS TO EXIST
-- The money path already decides mode per tier, inside
-- assign_seats_to_intent:
--
--     IF NOT EXISTS (
--       SELECT 1 FROM seats s JOIN event_sections sec ON sec.id = s.section_id
--       WHERE s.event_id = v_event_id
--         AND COALESCE(s.tier_id,
--                      NULLIF(sec.row_tier_overrides->>s.row_label,'')::uuid,
--                      sec.tier_id) = p_tier_id
--     ) THEN RETURN NULL;   -- no seat maps to this tier => general admission
--
-- Any UI that renders a tier as quantity-selectable must agree with that
-- predicate EXACTLY. If the UI thinks a tier is GA and the money path thinks it
-- is seated, the buyer picks a quantity and the RPC silently auto-assigns seats
-- they never saw. If the UI thinks seated and the money path thinks GA, the
-- buyer is sent to a seat map with nothing selectable.
--
-- So the predicate below is a verbatim copy, with NO extra filters -- notably
-- NOT `s.status <> 'disabled'` and NOT `sec.is_active`. Both are tempting and
-- both would be wrong: assign_seats_to_intent does not apply them when
-- deciding mode, so applying them here would make the two disagree on exactly
-- the awkward cases (a zone switched off, a row of seats disabled) where
-- getting it wrong is most expensive. seat_count is returned unfiltered for the
-- same reason; it is advisory for the UI, not an availability figure.
--
-- SAFETY
--   * Read-only. STABLE. Touches no money table and writes nothing.
--   * NOT exposed publicly. EXECUTE is granted to service_role only, so it is
--     reachable from Next.js server code and edge functions and NOT from the
--     anon or authenticated keys. This deliberately adds no new public surface.
--   * Rollback: DROP FUNCTION. Nothing else references it in the database.
--
-- THREE MODES, NOT TWO
-- 'seated'  : a seat resolves to it -> the seat picker owns it.
-- 'ga_zone' : no seats, but a seatless SECTION carries it -> the picker
--             already sells it by quantity inside the map, so the event
--             page must not list it again.
-- 'ga'      : no seats, no section -> a standalone ticket type, sold by
--             quantity on the event page. This is the shape we want for a
--             festival's GA and Early Bird: no fake seat-map geometry.

CREATE OR REPLACE FUNCTION public.get_event_tier_modes(p_event_id uuid)
RETURNS TABLE (tier_id uuid, mode text, seat_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
    WITH resolved AS (
        -- Verbatim from assign_seats_to_intent. Do not add filters here.
        SELECT COALESCE(
                   s.tier_id,
                   NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid,
                   sec.tier_id
               ) AS tier_id
        FROM seats s
        JOIN event_sections sec ON sec.id = s.section_id
        WHERE s.event_id = p_event_id
    ),
    counts AS (
        SELECT r.tier_id, count(*)::integer AS n
        FROM resolved r
        WHERE r.tier_id IS NOT NULL
        GROUP BY r.tier_id
    ),
    -- A GA ZONE is a section carrying a tier but holding no seats: already a
    -- supported shape, already sold by quantity from inside the seat picker
    -- (sales_mode 'ga' in get_event_seat_geometry). Such a tier must NOT also
    -- appear in the page's quantity list, or one tier gets two buy surfaces.
    zoned AS (
        SELECT DISTINCT sec.tier_id
        FROM event_sections sec
        WHERE sec.event_id = p_event_id
          AND sec.tier_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.section_id = sec.id)
    )
    SELECT t.id,
           CASE
               WHEN COALESCE(c.n, 0) > 0                     THEN 'seated'
               WHEN z.tier_id IS NOT NULL                    THEN 'ga_zone'
               ELSE                                               'ga'
           END,
           COALESCE(c.n, 0)
    FROM ticket_tiers t
    LEFT JOIN counts c ON c.tier_id = t.id
    LEFT JOIN zoned  z ON z.tier_id = t.id
    WHERE t.event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_tier_modes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_tier_modes(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_event_tier_modes(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_tier_modes(uuid) TO service_role;

COMMENT ON FUNCTION public.get_event_tier_modes(uuid) IS
    'Per-tier ticketing mode for an event. seated = at least one seat resolves '
    'to it (mirrors assign_seats_to_intent verbatim). ga_zone = a seatless '
    'section carries it, so the seat picker already sells it by quantity. '
    'ga = standalone, sold by quantity on the event page. service_role only.';
