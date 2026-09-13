/**
 * Support-thread live channel naming and wire format.
 *
 * Imported by BOTH client and server, so it must never touch ABLY_API_KEY.
 * Browsers get a subscribe-only token from /api/support/realtime-token, which —
 * unlike the seat-map token endpoint — authenticates the caller, because a
 * support thread is not public information the way a seating chart is.
 *
 * ── The payload carries NO message body. This is not an oversight ────────────
 * The Flutter app bundles a hardcoded publish-capable Ably root key (team_comms
 * #285 → #287; Rich's decision is that it stays). Anyone who unpacks the APK can
 * publish to any channel in that Ably app, support channels included.
 *
 * For a seat map the worst case is a forged "seat taken". For support chat, the
 * same person could publish a message that renders in a user's app as though it
 * came from HangHut Support — branded impersonation inside our own UI, on the
 * one surface a user trusts *because* it says HangHut.
 *
 * So the wire format is a SIGNAL, not content: a ticket id and nothing else. On
 * receipt a client refetches the thread from Postgres, which is the source of
 * truth anyway. The worst a forged publish can then do is make a client refetch
 * rows it is already allowed to read. There is no version of this where a
 * spoofed message puts words in our mouth.
 *
 * NEVER render anything out of this payload. If a field here would be
 * convenient, add a database read instead.
 *
 * ── Scoped by DATABASE, not by NODE_ENV ──────────────────────────────────────
 * Same convention as the seat map (#284): the scope segment is the Supabase
 * project ref, because a thread's reality is decided by the database it lives
 * in. Local dev pointed at prod is looking at real prod threads. Different
 * databases can never cross-talk.
 */

/**
 * The Supabase project ref — the real one.
 *
 * Read from the anon key's `ref` claim, NOT from the URL. The obvious version
 * of this takes the first DNS label of NEXT_PUBLIC_SUPABASE_URL, which is
 * correct only while that URL looks like https://<ref>.supabase.co. Ours does
 * not: it is a custom domain, so the label is "api" and every channel was
 * named `hh:api:support:...`.
 *
 * That still worked, because our publisher and our subscriber derive it the
 * same way and agree with each other. It would NOT have worked with the app:
 * the contract we published to them says the project ref, and a client that
 * computes the ref honestly would have subscribed to a channel nobody
 * publishes to — silently, with no error on either side, which is the worst
 * possible failure for a transport whose whole failure mode is "nothing
 * arrives".
 *
 * The anon key is a JWT carrying `ref`, so it is the project's own statement of
 * its identity rather than an inference from a hostname someone can change. The
 * URL label remains the fallback for a non-JWT publishable key.
 */
function projectScope(): string {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const parts = key.split('.')
    if (parts.length === 3) {
        try {
            const payload = JSON.parse(
                atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            )
            if (typeof payload?.ref === 'string' && payload.ref) return payload.ref
        } catch {
            /* fall through to the URL */
        }
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const m = url.match(/^https?:\/\/([a-z0-9-]+)\./i)
    return m?.[1] ?? 'unknown'
}

/** The channel everyone watching ONE support thread subscribes to. */
export function supportChannel(ticketId: string): string {
    return `hh:${projectScope()}:support:${ticketId}`
}

/**
 * The one channel that says "a conversation now exists, or moved somewhere you
 * are not watching".
 *
 * Per-ticket channels carry a conversation; this one is the doorbell. The agent
 * console can only subscribe to threads it already knows about, so a brand-new
 * ticket — and a reply landing on a thread outside the current filter, such as a
 * resolved one reopening — would otherwise be invisible until something else
 * made the console look.
 *
 * Published by whoever writes, same rule as the per-ticket channels: our server
 * for organizer actions, the app for app-user actions. If only one side
 * published it, the other side's tickets would never ring the bell — the exact
 * web-works-mobile-doesn't asymmetry this whole design keeps avoiding.
 *
 * Agents only. Their token already covers the namespace, and the payload is the
 * same body-free ticket id as everywhere else.
 */
export function supportQueueChannel(): string {
    return `hh:${projectScope()}:support:queue`
}

/**
 * Capability pattern covering every support thread.
 *
 * Issued only to support agents, who can already read every ticket through
 * is_support_agent(). The agent console watches many threads at once and cannot
 * know which ids it will need before it has loaded the queue, so a per-ticket
 * token would mean one round trip per row.
 */
export function supportChannelPattern(): string {
    return `hh:${projectScope()}:support:*`
}

/**
 * The only message name on these channels.
 *
 * One name, deliberately. "A message arrived, refetch" is the entire vocabulary
 * — distinguishing a reply from a status change would push the client toward
 * acting on the payload rather than on the database.
 */
export const SUPPORT_EVENT = 'message'

/** The entire wire format. A ticket id, nothing renderable. */
export interface SupportSignal {
    ticketId: string
}

/**
 * Live messages are a LATENCY optimisation, never a source of truth. They may
 * be dropped, duplicated, delivered out of order or arrive late, and the system
 * stays correct regardless: the thread refetches on open, and the email
 * notification is what actually reaches someone who has closed the tab. A
 * missed signal costs a slower refresh, never a lost message — which is why
 * this transport is allowed to be lossy and must never be awaited on a write
 * path.
 */
export const REALTIME_IS_ADVISORY = true
