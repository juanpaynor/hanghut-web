/**
 * Seat-map live channel naming. Imported by BOTH client and server, so it must
 * never touch ABLY_API_KEY — that key stays server-side, and browsers get a
 * subscribe-only token from /api/seat-map/realtime-token instead. A publishable
 * Ably key in the bundle would let anyone broadcast fake "seat taken" events.
 *
 * ── Channel is PER SECTION, not per event ────────────────────────────────────
 * A per-event channel puts every buyer on one show behind one subscription and
 * fans every seat change out to all of them. For a 2,414-seat map that is tens
 * of thousands of subscribers on a single filter, and it folds long before
 * Postgres does. Buyers only ever look at one section at a time, so subscribing
 * per section keeps fan-out proportional to what is actually on screen.
 *
 * ── Scoped by DATABASE, not by NODE_ENV ──────────────────────────────────────
 * The scope segment is the Supabase project ref, because a hold's reality is
 * decided by the database it lives in. Local dev pointed at prod is taking REAL
 * prod holds, and prod buyers genuinely should see them — keying on NODE_ENV
 * would wrongly split that. Different databases can never cross-talk.
 */

/** Supabase project ref from the public URL — e.g. https://<ref>.supabase.co */
function projectScope(): string {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const m = url.match(/^https?:\/\/([a-z0-9-]+)\./i)
    return m?.[1] ?? 'unknown'
}

/** The channel every client watching one section subscribes to. */
export function sectionChannel(eventId: string, sectionId: string): string {
    return `hh:${projectScope()}:seatmap:${eventId}:${sectionId}`
}

/** Capability pattern granting subscribe on every section of ONE event. */
export function eventChannelPattern(eventId: string): string {
    return `hh:${projectScope()}:seatmap:${eventId}:*`
}

/**
 * Message names. Deliberately tiny and deliberately WITHOUT any owner identity:
 * a hold is claimed by session_id, which is the credential for releasing or
 * extending it, so broadcasting it would hand every listener the ability to
 * interfere with someone else's seat. Listeners only need "this seat changed".
 */
export type SeatEventName = 'held' | 'released' | 'booked'

export interface SeatEvent {
    /** Seat that changed. */
    seatId: string
    /**
     * Opaque per-tab tag identifying who caused the change, so a client can
     * discard its OWN echo.
     *
     * Needed because a publisher is also a subscriber: taking a seat broadcasts
     * "held" to the whole section INCLUDING the taker. Filtering that by "is it
     * in my current selection?" is timing-dependent — deselect quickly and the
     * echo lands after the selection is gone, so the client greys out a seat it
     * just freed and locks itself out of re-picking it. An explicit tag makes
     * the check deterministic.
     *
     * This is a random value minted per tab, NOT the session id. session_id is
     * the credential for releasing or extending a hold and must never be
     * broadcast; this tag confers nothing.
     */
    origin?: string
}

/**
 * Live messages are a LATENCY optimisation, never a source of truth. They may be
 * dropped, duplicated, delivered out of order, or arrive after the fact, and the
 * system stays correct regardless: Postgres elects the winner at UNIQUE(seat_id)
 * on hold, and again under FOR UPDATE SKIP LOCKED at assignment. A missed message
 * costs a buyer one rejected tap, never a double sale — which is exactly why this
 * transport is allowed to be lossy and must never be awaited on a write path.
 */
export const REALTIME_IS_ADVISORY = true
