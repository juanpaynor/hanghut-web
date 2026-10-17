/**
 * Which kind of token is in a /d/<token> URL.
 *
 * Deliberately NOT in attendee-detail-actions.ts. That file carries
 * `'use server'`, and a server-action module may only export async functions —
 * a sync export there fails the production build (`Server Actions must be async
 * functions`) while passing `tsc --noEmit`, which does not police the rule.
 *
 * It is pure string matching used on both sides, so it belongs in its own
 * module rather than being made pointlessly async.
 */

/** purchase_intents.access_token — the buyer's order link. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** attendee_detail_sublinks.token — two concatenated UUIDs, hyphens stripped. */
const SUBLINK_RE = /^[0-9a-f]{64}$/i

/**
 * One route serves both kinds, so the shape decides: an order token is the
 * access_token UUID the buyer already has from their ticket email, a sublink is
 * 64 hex characters. Anything else is not a token and the page 404s without a
 * round trip to the database.
 */
export function classifyToken(token: string): 'order' | 'sublink' | null {
    if (UUID_RE.test(token)) return 'order'
    if (SUBLINK_RE.test(token)) return 'sublink'
    return null
}
