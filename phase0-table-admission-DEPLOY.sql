-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 0 — the door can admit a whole table
--
-- NOT YET APPLIED. For review. See "Recurring Event Nights" for the full plan;
-- this is its first phase and it stands alone: nothing here knows about
-- recurring nights.
--
-- Run it in the Supabase SQL editor (MCP apply_migration is blocked by the
-- auto-mode classifier), then record the ledger row at the bottom. Do NOT use
-- `supabase db push` -- the prod ledger is squashed to one baseline.
--
-- ── The problem ─────────────────────────────────────────────────────────────
--
-- A table that admits 8 is ONE ticket. scan_ticket sets status='used' on the
-- first scan, so the second person through the door is told ALREADY SCANNED.
-- Eight people arrive, one gets in. Nothing on the ticket or scanner side
-- reads event_sections.unit_capacity today -- only the map renderer does.
--
-- ── Blast radius: provably nothing ──────────────────────────────────────────
--
-- Verified on prod before writing this: 0 live tickets sit on a seat whose
-- section has unit_capacity set. Every existing ticket resolves to admits = 1
-- and takes the SAME code path it takes today, byte for byte. The new
-- behaviour can only engage for a table ticket, and none exist yet.
--
-- ── Why admits is derived, not stamped (for now) ────────────────────────────
--
-- Stamping the number onto the ticket at point of sale is better long-term --
-- it is the same principle that already snapshots the seat label and the price
-- paid, so a later edit cannot rewrite history. But stamping means changing
-- assign_seats_to_intent, which is on the money path AND is the function that
-- caused the Hex Fest duplicate. Mixing a feature into that fix is how one
-- careful change becomes two risky ones.
--
-- So: `admits` is nullable and NULL means "work it out from the section at
-- scan time". When assign_seats_to_intent is repaired later, it stamps the
-- column, and this falls back to the stored value automatically -- no further
-- change here. The trade-off while it is derived: an organiser who edits
-- unit_capacity after selling changes what the door admits. Acceptable while
-- zero tables have been sold; not acceptable once they have, which is why the
-- stamp follows.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Two columns on tickets ───────────────────────────────────────────────

alter table public.tickets
  add column if not exists admits integer,
  add column if not exists admitted integer not null default 0;

comment on column public.tickets.admits is
  'How many people this one ticket is good for. NULL = derive from the seat''s section unit_capacity at scan time, falling back to 1. Stamped at point of sale once assign_seats_to_intent is repaired.';
comment on column public.tickets.admitted is
  'How many of them have come through the door. Lets a party of 8 arrive in three groups.';

alter table public.tickets
  add constraint tickets_admits_positive
    check (admits is null or admits > 0) not valid;
alter table public.tickets
  add constraint tickets_admitted_sane
    check (admitted >= 0 and (admits is null or admitted <= admits)) not valid;

-- NOT VALID on purpose: both are true of every existing row (admits is NULL
-- everywhere, admitted defaults to 0), but NOT VALID skips the full-table
-- scan and the ACCESS EXCLUSIVE lock that comes with it on a live tickets
-- table. New and updated rows are checked from the moment it is added.

commit;

-- ── 2. scan_ticket counts people through, not scans ─────────────────────────
--
-- Everything a single-admission ticket does is unchanged: the same lookup, the
-- same WRONG_EVENT / UNAUTHORIZED / ALREADY_CHECKED_IN / TICKET_VOID /
-- NOT_SOLD gates in the same order, with the same codes and messages, and the
-- same final UPDATE to status='used'. The ONLY new behaviour sits behind
-- v_admits > 1, which no ticket on prod reaches today.
--
-- The ticket row is locked FOR UPDATE before counting. Without it two door
-- staff scanning the same table at once both read admitted=3 and both write 4,
-- and the ninth guest walks in.

begin;

create or replace function public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_ticket record; v_organizer_id uuid; v_is_authorized boolean; v_who jsonb;
  v_admits integer; v_admitted integer; v_remaining integer; v_full boolean;
  -- A real session always wins; p_user_id is honoured only for service-role
  -- callers, which is the scanner backend and web's box office.
  v_actor uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  SELECT
    t.id, t.status, t.checked_in_at, t.guest_name, t.event_id, t.seat_info,
    e.organizer_id, e.title as event_title, tt.name as tier_name,
    u.display_name as user_name, pi.guest_name as pi_guest_name,
    -- NEW: how many this ticket is good for, and how many are already in.
    COALESCE(t.admits, sec.unit_capacity, 1) as admits,
    COALESCE(t.admitted, 0) as admitted
  INTO v_ticket
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN ticket_tiers tt ON t.tier_id = tt.id
  LEFT JOIN users u ON t.user_id = u.id
  LEFT JOIN purchase_intents pi ON t.purchase_intent_id = pi.id
  LEFT JOIN seats s ON s.id = t.seat_id
  LEFT JOIN event_sections sec ON sec.id = s.section_id
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

  v_admits := GREATEST(1, v_ticket.admits);

  v_who := jsonb_build_object(
    'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
    'tier_name', v_ticket.tier_name,
    'seat', v_ticket.seat_info,
    'admits', v_admits,
    'admitted', v_ticket.admitted);

  IF v_ticket.status::text = 'used' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN',
      'message', 'ALREADY SCANNED',
      'details', CASE WHEN v_admits > 1
          THEN 'All ' || v_admits || ' already checked in at '
               || to_char(v_ticket.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM')
          ELSE 'Checked in at '
               || to_char(v_ticket.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM') END,
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

  -- Admit one person. Locked so two doors cannot both read the same count.
  SELECT COALESCE(admitted, 0) INTO v_admitted
  FROM tickets WHERE id = v_ticket.id FOR UPDATE;

  IF v_admitted >= v_admits THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN',
      'message', 'ALREADY SCANNED',
      'details', 'All ' || v_admits || ' already checked in',
      'ticket', v_who);
  END IF;

  v_admitted := v_admitted + 1;
  v_full     := v_admitted >= v_admits;
  v_remaining := v_admits - v_admitted;

  -- status flips to 'used' only when the LAST person is in, so a half-arrived
  -- table stays valid for the rest of the party. For an ordinary ticket
  -- (admits = 1) the first scan is the last, and this is exactly today's
  -- single UPDATE.
  UPDATE tickets
  SET admitted      = v_admitted,
      status        = CASE WHEN v_full THEN 'used' ELSE status END,
      checked_in_at = COALESCE(checked_in_at, now()),
      checked_in_by = COALESCE(checked_in_by, v_actor)
  WHERE id = v_ticket.id;

  RETURN jsonb_build_object('success', true, 'code', 'OK',
    'message', CASE WHEN v_admits > 1
        THEN v_admitted || ' of ' || v_admits || ' checked in'
        ELSE 'Valid Ticket' END,
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
      'tier_name', v_ticket.tier_name,
      'event_title', v_ticket.event_title,
      'seat', v_ticket.seat_info,
      'admits', v_admits,
      'admitted', v_admitted,
      'remaining', v_remaining,
      'checked_in_at', now()));
END;
$function$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- LEDGER ROW -- run only AFTER both transactions above have committed.
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261105120000', 'phase0_table_admission');
--
-- Left commented so pasting the file cannot record it as applied before it is.
--
-- ROLLBACK
--   1. Restore the previous scan_ticket from
--      rollback/scan_ticket_before_phase0.sql (captured from prod 2026-11-05).
--   2. The two columns are additive and can be left in place; nothing else
--      reads them. To remove them as well:
--        alter table public.tickets drop constraint tickets_admitted_sane;
--        alter table public.tickets drop constraint tickets_admits_positive;
--        alter table public.tickets drop column admitted;
--        alter table public.tickets drop column admits;
-- ════════════════════════════════════════════════════════════════════════════
