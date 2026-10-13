-- Open get_event_tier_modes to the app and the browser.
--
-- WHY
-- This is the only RPC that expresses a MIXED event: which tiers are sold on
-- the seat map and which are standalone general admission. It was created
-- service_role-only because the web app reads it server-side. The Flutter
-- client reads Postgres directly with the anon/authenticated key, so mixed
-- events are currently unrepresentable there -- the app can see that a tier has
-- no sections, but cannot tell "GA tier, sell by quantity" apart from
-- "misconfigured tier, hide it". Hex Fest 2026 made that concrete: its three
-- GA tiers hold 1,200 of its units and the app has no way to know they are
-- sellable.
--
-- WHY IT IS SAFE
-- STABLE SECURITY INVOKER. It takes one event id and returns only
-- (tier_id, mode, seat_count). Every one of those facts is already visible to
-- anon through get_event_seat_map and ticket_tiers. Running as INVOKER means
-- RLS still applies to the caller -- this grants no read the caller did not
-- already have, it only packages one we own the logic for, so clients do not
-- each reimplement the tier-resolution expression and drift from the money path.
--
-- Verified on prod inside a rolled-back transaction with SET LOCAL ROLE anon:
--   called_as=anon rows_returned=8 modes="ga:0, ga:0, ga:0, seated:8, seated:10,
--   seated:6, seated:14, seated:10"
--
-- ROLLBACK (single statement, instant)
--   REVOKE EXECUTE ON FUNCTION public.get_event_tier_modes(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_event_tier_modes(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_event_tier_modes(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_event_tier_modes(uuid) IS
    'Per-tier ticketing mode for one event: seated (a seat resolves to the tier), '
    'ga_zone (a seatless section carries it, sold by quantity inside the map), or '
    'ga (standalone, no seat-map geometry). The tier predicate is copied verbatim '
    'from assign_seats_to_intent so UI and money path cannot disagree. Readable by '
    'anon/authenticated/service_role; SECURITY INVOKER, so RLS still applies.';
