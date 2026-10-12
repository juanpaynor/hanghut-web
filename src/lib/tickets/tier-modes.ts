/**
 * Per-tier ticketing mode, for mixed GA + assigned-seating events.
 *
 * A tier is `seated` when at least one seat resolves to it and `ga` otherwise.
 * That is not our opinion -- it is the rule assign_seats_to_intent already
 * applies on every purchase, so these labels and the money path are the same
 * decision read twice. The SQL side lives in get_event_tier_modes, which copies
 * the predicate verbatim; see that migration for why no extra filters are safe.
 *
 * Deliberately server-only. The RPC is granted to service_role alone, so this
 * adds no public database surface -- it must never be imported into a client
 * component.
 */
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * `seated`  - a seat resolves to this tier; the seat picker owns it.
 * `ga_zone` - no seats, but a seatless section carries it, so the picker
 *             already sells it by quantity INSIDE the map. The event page must
 *             not list it again or one tier gets two buy surfaces.
 * `ga`      - standalone: no seats, no section. Sold by quantity on the event
 *             page. This is the shape a festival's GA and Early Bird take, and
 *             it needs no seat-map geometry at all.
 */
export type TierMode = 'ga' | 'ga_zone' | 'seated'

interface TierModeRow {
    tier_id: string
    mode: TierMode
    seat_count: number
}

/**
 * Modes for every tier on an event, or `null` when the answer can't be
 * established.
 *
 * Null is the important case. Callers must read it as "fall back to the
 * existing single-mode rendering", never as "everything is GA": guessing GA
 * would put a seated tier behind a quantity picker, which is precisely the
 * oversell the old either/or ternary existed to prevent. A missing service-role
 * key, a dropped connection or an un-migrated database all land here, and all
 * of them should leave today's behaviour untouched.
 */
export async function getEventTierModes(
    eventId: string,
): Promise<Map<string, TierMode> | null> {
    try {
        const { data, error } = await createAdminClient()
            .rpc('get_event_tier_modes', { p_event_id: eventId })

        if (error || !Array.isArray(data)) {
            if (error) console.error('get_event_tier_modes failed:', error.message)
            return null
        }

        return new Map((data as TierModeRow[]).map(r => [r.tier_id, r.mode]))
    } catch (e) {
        console.error('get_event_tier_modes threw:', e)
        return null
    }
}

/** Everything the seat picker is responsible for selling. */
export function isMapOwned(mode: TierMode | undefined): boolean {
    return mode === 'seated' || mode === 'ga_zone'
}

/** The organizer's explicit opt-in. Nothing renders as mixed without it. */
export function isMixedSeating(event: { seating_type?: string | null }): boolean {
    return event.seating_type === 'mixed'
}
