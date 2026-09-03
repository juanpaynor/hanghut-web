import 'server-only'
import Ably from 'ably'
import { sectionChannel, type SeatEventName } from './realtime'

/**
 * Server-side Ably publishing for seat-map changes.
 *
 * ABLY_API_KEY never leaves the server. Browsers authenticate with a
 * subscribe-only token from /api/seat-map/realtime-token.
 */

let rest: Ably.Rest | null = null

function client(): Ably.Rest | null {
    if (rest) return rest
    const key = process.env.ABLY_API_KEY
    // Absent key is not an error. Live updates are advisory, so the correct
    // behaviour without one is a system that still sells seats correctly and
    // simply refreshes a little slower — not a broken checkout.
    if (!key) return null
    rest = new Ably.Rest({ key })
    return rest
}

/**
 * Announce that a seat changed. FIRE AND FORGET, BY DESIGN — never await this on
 * a write path and never let it fail a request.
 *
 * A hold that succeeded in Postgres is a fact. If the announcement of that fact
 * fails, the hold is still real and still enforced; other buyers just learn about
 * it on their next poll instead of instantly. Awaiting this would put an external
 * network hop inside the seat-holding path and let an Ably outage take checkout
 * down with it — trading a correctness-neutral delay for a real one.
 */
export function publishSeatEvent(
    eventId: string,
    sectionId: string | null,
    name: SeatEventName,
    seatId: string,
    origin?: string,
): void {
    if (!sectionId) return
    const c = client()
    if (!c) return
    try {
        void c.channels
            .get(sectionChannel(eventId, sectionId))
            .publish(name, origin ? { seatId, origin } : { seatId })
            .catch(() => { /* advisory: a dropped message costs one stale tap */ })
    } catch {
        /* never surfaces to the caller */
    }
}
