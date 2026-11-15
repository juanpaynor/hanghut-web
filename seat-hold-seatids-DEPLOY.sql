-- DEPLOY: get_seat_hold_expiry also returns WHICH seats the session holds.
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- Answers team_comms #377 ask 2 ("held_by_me"), agreed in #388 — but NOT the
-- way either side proposed it.
--
-- ===========================================================================
-- WHY THIS IS NOT THE NEW get_my_seat_holds() WE OFFERED
-- ===========================================================================
-- We offered to build a new RPC. While writing it we found that
-- get_seat_hold_expiry(p_session_id) already exists, is ALREADY granted to
-- anon, and already returns:
--
--     { expires_at, server_now, seats_held }
--
-- `server_now` is the important one: the app's stated problem in #377 ask 2 is
-- that _ownsLiveHold compares a locally-remembered expiry against the DEVICE
-- CLOCK, which is wrong whenever the clock is off. That problem is already
-- solvable today with a function nobody told them about.
--
-- So this is the FOURTH instance of the #385 section 5 pattern in one week: we
-- built something, never mentioned it, and the other team planned work around
-- its absence. The first three were the five section fields, per-section
-- seat_shape and canvas_background. This one is worse, because here they had
-- offered to wait while WE built a replacement for a thing that already shipped.
--
-- Adding `seats` to the existing function rather than creating a near-duplicate:
--   * no new grant and no new security surface — seat_holds is RLS-on with ZERO
--     policies and no anon grant, so every read must be SECURITY DEFINER, and
--     this one already is
--   * no fourth RPC answering a question a third one nearly answers, which is
--     the exact drift that produced get_event_seat_geometry vs get_event_seat_map
--   * purely additive to the JSON, so the existing callers are unaffected
--
-- ===========================================================================
-- WHAT IT RETURNS NOW
-- ===========================================================================
--   { expires_at, server_now, seats_held,
--     seats: [ { seat_id, expires_at }, ... ] }
--
-- `seats` answers held_by_me directly: a seat the status snapshot reports as
-- 'held' is YOURS if its id is in this array, and somebody else's if it is not.
-- No device clock involved — pair it with server_now and the client never has
-- to trust its own time.
--
-- ⚠ SCOPE AND SIGNATURE DELIBERATELY UNCHANGED. Still keyed on session_id
-- alone, still no event filter. Adding p_event_id would be a signature change
-- on a live anon-callable function used by the web picker's countdown, and it
-- buys little: a session is minted per picker, so it only ever holds seats for
-- one event in practice.
--
-- ⚠ WHY THIS LEAKS NOTHING EXTRA. session_id is a bearer secret the client
-- generates and already sends to hold_seat and release_seat_hold, both of which
-- are anon-executable and both of which ACT on holds. Reading the seat ids that
-- the same secret could already release is strictly less powerful than what the
-- caller can do today. And the ids themselves are not sensitive — the map
-- already reports every one of those seats as 'held' to everybody.
--
-- The empty-string guard is new and is a tightening: session_id is NOT NULL
-- text, so '' is storable, and without the guard a caller passing '' would be
-- handed every hold belonging to any row that also has ''.
--
-- ROLLBACK: re-run without the 'seats' key and without the guard.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_seat_hold_expiry(p_session_id text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'expires_at', (
      SELECT min(expires_at) FROM seat_holds
      WHERE session_id = p_session_id AND p_session_id <> '' AND expires_at > now()
    ),
    'server_now', now(),
    'seats_held', (
      SELECT count(*) FROM seat_holds
      WHERE session_id = p_session_id AND p_session_id <> '' AND expires_at > now()
    ),
    -- WHICH seats, so the client can tell its own 'held' from everyone else's
    -- without comparing a remembered expiry to the device clock. Ordered so two
    -- polls of an unchanged set compare equal.
    'seats', (
      SELECT COALESCE(json_agg(json_build_object(
        'seat_id', h.seat_id,
        'expires_at', h.expires_at
      ) ORDER BY h.expires_at, h.seat_id), '[]'::json)
      FROM seat_holds h
      WHERE h.session_id = p_session_id AND p_session_id <> '' AND h.expires_at > now()
    )
  );
$function$;

-- Restated rather than assumed: a CREATE OR REPLACE keeps existing grants, but
-- this function is useless to a logged-out buyer without anon, and that is
-- exactly the kind of thing worth being explicit about on the seat path.
GRANT EXECUTE ON FUNCTION public.get_seat_hold_expiry(text) TO anon, authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115120000', 'seat_hold_expiry_returns_seat_ids')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===========================================================================
-- VERIFY 1 — shape and grants. Expect all four keys true, anon present.
-- ===========================================================================
SELECT (get_seat_hold_expiry('nobody')::jsonb) ? 'expires_at' AS k_expires_at,
       (get_seat_hold_expiry('nobody')::jsonb) ? 'server_now' AS k_server_now,
       (get_seat_hold_expiry('nobody')::jsonb) ? 'seats_held' AS k_seats_held,
       (get_seat_hold_expiry('nobody')::jsonb) ? 'seats'      AS k_seats,
       get_seat_hold_expiry('nobody')->>'seats'               AS empty_case,
       has_function_privilege('anon', 'public.get_seat_hold_expiry(text)', 'execute') AS anon_can_call;

-- ===========================================================================
-- VERIFY 2 — the empty-string guard. Both must come back 0 / [] even if a row
-- with session_id = '' exists.
-- ===========================================================================
SELECT get_seat_hold_expiry('')->>'seats_held' AS blank_seats_held,
       get_seat_hold_expiry('')->>'seats'      AS blank_seats;

-- ===========================================================================
-- VERIFY 3 — against a REAL live hold if one exists right now. Returns no rows
-- when nobody is mid-checkout, which is normal and not a failure.
-- ===========================================================================
SELECT h.session_id,
       (get_seat_hold_expiry(h.session_id)->>'seats_held')::int AS seats_held,
       json_array_length((get_seat_hold_expiry(h.session_id)->'seats')::json) AS seats_listed
  FROM seat_holds h
 WHERE h.expires_at > now()
 GROUP BY h.session_id
 LIMIT 3;
