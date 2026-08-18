-- Seat-hold abuse hardening. Two independent problems, both required — either
-- one alone is trivially bypassed.
--
-- ── 1. The table was directly writable by anon ────────────────────────────────
-- seat_holds granted anon/authenticated full SELECT/INSERT/UPDATE/DELETE, with
-- every RLS policy a literal `true`. The anon key ships in the client bundle and
-- seat ids are public from /api/seat-map/geometry, so any unauthenticated caller
-- could hit PostgREST directly and:
--   * DELETE another buyer's hold mid-checkout and take the seat,
--   * UPDATE expires_at far into the future — permanently locking seats, which
--     the cleanup cron would never reclaim (it only deletes expires_at < now()),
--   * INSERT holds directly, bypassing hold_seat() and therefore ANY check added
--     inside it (which is why the cap in part 2 is worthless without this part).
--
-- Safe to revoke: nothing in the web app touches this table directly — all access
-- is via hold_seat / release_seat_hold / get_seat_hold_expiry / assign_seats_to_intent
-- / book_seats_for_intent / release_seats_for_intent, every one SECURITY DEFINER and
-- owned by postgres, which also owns the table with FORCE ROW LEVEL SECURITY off.
-- Definer functions therefore bypass both these grants and RLS entirely.
--
-- SELECT is revoked along with the writes: hold rows expose session ids and
-- user_ids, and the only legitimate read (the countdown) goes through
-- get_seat_hold_expiry. Seat AVAILABILITY is unaffected — that is served by
-- get_event_seat_status, which is its own definer function.

REVOKE ALL ON TABLE public.seat_holds FROM anon, authenticated;

DROP POLICY IF EXISTS seat_holds_read   ON public.seat_holds;
DROP POLICY IF EXISTS seat_holds_insert ON public.seat_holds;
DROP POLICY IF EXISTS seat_holds_delete ON public.seat_holds;

-- RLS stays enabled with NO policies: default-deny for any client role, while the
-- definer functions (owner, not forced) continue to bypass it. Belt and braces —
-- if a grant is ever restored by accident, this still denies.
ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.seat_holds IS
  'Transient seat reservations. NOT client-accessible: no grants to anon/authenticated and no RLS policies by design. All access goes through SECURITY DEFINER functions (hold_seat, release_seat_hold, get_seat_hold_expiry, assign_seats_to_intent, book_seats_for_intent, release_seats_for_intent). Restoring direct grants re-opens seat theft — see migration 20260818100000.';


-- ── 2. hold_seat() had no per-session limit ───────────────────────────────────
-- maxPerOrder was enforced only in the React picker, so the server would happily
-- hold an entire arena for one session. Now enforced against the SAME value the
-- organizer configured (ticket_tiers.max_per_order), resolved with the same
-- COALESCE precedence assign_seats_to_intent uses, so the picker, the hold, and
-- the checkout assignment all agree on one number.
--
-- This does NOT stop a determined attacker on its own — session_id is a
-- client-generated uuid, so rotating it per seat sidesteps a per-session cap.
-- Closing that needs IP-level rate limiting at the route layer, which is the
-- next step and is deliberately not attempted here.
--
-- Return type stays boolean: this is a shared contract with the Flutter app.

CREATE OR REPLACE FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_held boolean;
  v_event_id uuid;
  v_tier_id uuid;
  v_max_per_order integer;
  v_current integer;
BEGIN
  -- Clean expired holds first
  DELETE FROM seat_holds WHERE expires_at < now();

  -- Check seat is available, and resolve its event + effective tier in one pass.
  -- Tier precedence matches assign_seats_to_intent: seat override, then the
  -- section's per-row override, then the section default.
  SELECT s.event_id,
         COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id)
    INTO v_event_id, v_tier_id
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = p_seat_id AND s.status = 'available';

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  -- Per-session cap for this event. Counting by EVENT rather than by tier stops
  -- a session from holding max_per_order seats in every tier at once.
  SELECT COALESCE(max_per_order, 10) INTO v_max_per_order
  FROM ticket_tiers WHERE id = v_tier_id;
  v_max_per_order := COALESCE(v_max_per_order, 10);

  SELECT count(*) INTO v_current
  FROM seat_holds h
  JOIN seats s2 ON s2.id = h.seat_id
  WHERE h.session_id = p_session_id
    AND h.expires_at > now()
    AND s2.event_id = v_event_id
    AND h.seat_id <> p_seat_id;

  IF v_current >= v_max_per_order THEN
    RETURN false;
  END IF;

  -- Try to insert hold (UNIQUE constraint prevents doubles)
  INSERT INTO seat_holds (seat_id, session_id, user_id)
  VALUES (p_seat_id, p_session_id, p_user_id)
  ON CONFLICT (seat_id) DO NOTHING;

  -- Check if WE got the hold
  SELECT EXISTS (
    SELECT 1 FROM seat_holds
    WHERE seat_id = p_seat_id AND session_id = p_session_id
  ) INTO v_held;

  RETURN v_held;
END;
$function$;

COMMENT ON FUNCTION public.hold_seat(uuid, text, uuid) IS
  'Takes a transient hold on an available seat. Returns false when the seat is gone OR when the session already holds max_per_order seats for that event. Per-session only — session_id is client-supplied, so this is not by itself an anti-abuse control.';
