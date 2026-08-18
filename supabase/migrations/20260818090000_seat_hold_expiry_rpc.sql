-- Seat-hold countdown support.
--
-- The buyer-facing timer must count down to the SERVER's expiry, not to a
-- client-side `now() + 12min` guess: the client clock can be skewed, and the
-- guess is lost on reload, so a reloaded page would silently restart the timer
-- and promise time the buyer does not have.
--
-- hold_seat() returns boolean and is a shared contract with the Flutter app
-- (see team_comms), so its signature is deliberately left alone. This is a
-- separate, additive, read-only function.
--
-- Returns the EARLIEST expiry across the session's holds — that is the moment
-- the buyer starts losing seats, which is what the countdown must show. NULL
-- when the session holds nothing (or everything already expired), which the UI
-- renders as "no active hold" rather than as zero.
--
-- server_now ships alongside so the client can subtract its own clock offset.
-- Without it the countdown is computed against Date.now(), and a device clock
-- running slow would show time the buyer does not actually have — the precise
-- failure this timer exists to prevent.

CREATE OR REPLACE FUNCTION public.get_seat_hold_expiry(p_session_id text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT json_build_object(
    'expires_at', (
      SELECT min(expires_at) FROM seat_holds
      WHERE session_id = p_session_id AND expires_at > now()
    ),
    'server_now', now(),
    'seats_held', (
      SELECT count(*) FROM seat_holds
      WHERE session_id = p_session_id AND expires_at > now()
    )
  );
$function$;

COMMENT ON FUNCTION public.get_seat_hold_expiry(text) IS
  'Earliest unexpired seat-hold expiry for a picker session id, for the buyer-facing countdown. Returns server_now alongside so the client can correct for device-clock skew rather than trusting Date.now(). expires_at is NULL when the session holds no live seats.';

REVOKE ALL ON FUNCTION public.get_seat_hold_expiry(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_seat_hold_expiry(text) TO anon, authenticated;
