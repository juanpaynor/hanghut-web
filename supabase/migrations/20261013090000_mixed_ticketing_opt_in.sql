-- Mixed ticketing: the event-level opt-in.
--
-- A festival needs General Admission and Early Bird GA sold by quantity
-- ALONGSIDE VIP A/B/C sold through the seat map, in ONE event. The data model
-- already expresses that (event_sections.tier_id, seats.tier_id,
-- row_tier_overrides) and the money path already resolves ticketing mode PER
-- TIER -- assign_seats_to_intent returns NULL for a tier no seat maps to, which
-- is exactly "this tier is general admission". Nothing about reservations,
-- pricing, issuance, refunds or payouts changes here.
--
-- What was missing was a way for an organizer to DECLARE the event as mixed, so
-- the buyer surfaces can render both at once without guessing. seating_type is
-- that declaration: it is already the organizer's statement of the event's
-- shape, and it is read by exactly two frontend components and NO edge
-- function, RPC or trigger. Widening it is therefore inert for every existing
-- code path.
--
-- SAFETY
--   * Additive only: this widens a CHECK, it does not narrow one, so every one
--     of today's rows satisfies the new constraint by construction.
--   * No row is written. No event changes shape until an organizer opts in.
--   * Default is unchanged ('general_admission'), so new events behave as now.
--   * Rollback: set any mixed event back to 'assigned_seating', then restore
--     the two-value CHECK. The buyer surfaces fall back to today's rendering
--     immediately because they branch on this value alone.
--
-- The drop-and-recreate takes a brief ACCESS EXCLUSIVE lock while Postgres
-- validates the new CHECK against existing rows. events is a small table
-- (hundreds of rows), so this is milliseconds -- but it is still a lock on a
-- live sales table, so run it off-peak rather than during an on-sale.

ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_seating_type_check;

ALTER TABLE public.events
    ADD CONSTRAINT events_seating_type_check
    CHECK (seating_type = ANY (ARRAY[
        'general_admission'::text,
        'assigned_seating'::text,
        'mixed'::text
    ]));

COMMENT ON COLUMN public.events.seating_type IS
    'Organizer declaration of the event shape: general_admission (quantity only), '
    'assigned_seating (seat map only), or mixed (standalone GA tiers sold by '
    'quantity alongside seat-mapped tiers). Read by buyer/organizer UI only -- '
    'the money path derives a tier''s mode from whether any seat resolves to it, '
    'never from this column.';
