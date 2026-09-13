import 'server-only'
import Ably from 'ably'
import { supportChannel, supportQueueChannel, SUPPORT_EVENT } from './realtime'

/**
 * Server-side Ably publishing for support threads.
 *
 * ABLY_API_KEY never leaves the server. Browsers authenticate with a
 * subscribe-only token from /api/support/realtime-token.
 *
 * BOTH SIDES PUBLISH, and that is the point. The Flutter app writes to
 * support_messages directly through RLS, so our Next server never executes for
 * an app-user's message; we write for the organizer widget and the agent
 * console, so their server never executes for ours. Whoever writes the row also
 * publishes the signal for it (team_comms #308 → #309). The alternative —
 * publishing from a pg_net trigger so the writer would not matter — was
 * rejected because pg_net failures are silent by design, which would have
 * traded a visible client error for an invisible server one.
 */

let rest: Ably.Rest | null = null

function client(): Ably.Rest | null {
    if (rest) return rest
    const key = process.env.ABLY_API_KEY
    // Absent key is not an error. Live updates are advisory, so the correct
    // behaviour without one is a support inbox that still delivers every
    // message and simply refreshes on open instead of instantly.
    if (!key) return null
    rest = new Ably.Rest({ key })
    return rest
}

/**
 * Signal that a support thread changed. FIRE AND FORGET, BY DESIGN — never
 * await this on a write path and never let it fail a request.
 *
 * A message committed to Postgres is a fact. If announcing that fact fails, the
 * message is still there, still visible on the next open, and the email
 * notification still goes out. Awaiting this would put an external network hop
 * inside the send path and let an Ably outage stop people reporting problems —
 * which, for a support system, is the one outage that must not compound.
 *
 * The payload is the ticket id and nothing else. See realtime.ts for why.
 */
export function publishSupportSignal(ticketId: string): void {
    const c = client()
    if (!c) return
    try {
        void c.channels
            .get(supportChannel(ticketId))
            .publish(SUPPORT_EVENT, { ticketId })
            .catch(() => { /* advisory: a dropped signal costs a slower refresh */ })
    } catch {
        /* never surfaces to the caller */
    }
}

/**
 * Ring the agent-queue doorbell. Same fire-and-forget rules as above.
 *
 * Sent for REQUESTER-originated events only — a new thread, or a reply on one
 * that may not be in any console's current list. Agent actions do not need it:
 * the agent is the person who just acted, and their own console already knows.
 */
export function publishSupportQueueSignal(ticketId: string): void {
    const c = client()
    if (!c) return
    try {
        void c.channels
            .get(supportQueueChannel())
            .publish(SUPPORT_EVENT, { ticketId })
            .catch(() => { /* advisory */ })
    } catch {
        /* never surfaces to the caller */
    }
}
