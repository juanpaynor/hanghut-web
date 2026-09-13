import { NextResponse } from 'next/server'
import Ably from 'ably'
import type { TokenDetails } from 'ably'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { supportChannel, supportChannelPattern } from '@/lib/support/realtime'

/**
 * GET /api/support/realtime-token?ticketId=<uuid>
 *
 * Issues a short-lived Ably token granting SUBSCRIBE ONLY on support channels
 * the caller is already allowed to read.
 *
 * THIS ENDPOINT AUTHENTICATES. /api/seat-map/realtime-token deliberately does
 * not, because a seating chart is public and the token it hands out grants
 * subscribe on a public event. A support thread is not public: the channel name
 * contains a ticket id, and anyone holding a token for it learns every time
 * that conversation moves. So the caller is verified, and then asked of the
 * database — never of the request — whether they may see this ticket.
 *
 * Two accepted credentials:
 *   - the Supabase session cookie, which is how our own browser clients call it
 *   - `Authorization: Bearer <supabase access token>`, the shape promised to the
 *     app team in team_comms #306. They have since said they will not call it
 *     (#310), but the contract was published, so it is honoured rather than
 *     quietly dropped.
 *
 * `subscribe` is the entire capability. No publish, no presence, no history.
 * The browser then subscribes over Ably's SSE endpoint with native EventSource,
 * which cannot publish even in principle — so subscribe-only is a property of
 * the transport as well as of the grant.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    // Repeatable, because a client watching several threads needs ONE token
    // covering all of them. Asking for a token per thread would be a round trip
    // per row; asking for one token and then attaching to channels it does not
    // cover is worse still — Ably refuses the connection outright, so a single
    // uncovered channel silently kills every subscription on that stream.
    const ticketIds = searchParams.getAll('ticketId').slice(0, 40)
    const ticketId = ticketIds[0] ?? null

    // Bearer wins when present; otherwise fall back to the cookie session.
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const supabase = bearer
        ? createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
        )
        : await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Authorisation is the database's answer, not ours. Both predicates run as
    // the caller, so this cannot drift from what RLS lets them actually read.
    const { data: isAgent } = await supabase.rpc('is_support_agent')

    let capability: Record<string, ['subscribe']>
    if (isAgent === true && !ticketId) {
        // The agent console watches every thread in its queue at once and cannot
        // know the ids before it has loaded them. Agents can already read every
        // ticket, so a namespace grant adds no reach.
        capability = { [supportChannelPattern()]: ['subscribe'] }
    } else {
        if (!ticketId) {
            return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
        }

        // Every id is checked, one by one, against the same predicate RLS uses.
        // No short-cut for "they asked for several so they probably own them".
        const allowed = await Promise.all(
            ticketIds.map(async (id) => {
                const { data, error } = await supabase.rpc('can_view_support_ticket', { p_ticket_id: id })
                return !error && data === true ? id : null
            }),
        )
        const visible = allowed.filter((id): id is string => id !== null)

        if (visible.length === 0) {
            // 404, not 403: a distinguishable "forbidden" would confirm that a
            // given ticket id exists to anyone who guesses one.
            return NextResponse.json({ error: 'not found' }, { status: 404 })
        }

        // Threads they cannot see are dropped rather than failing the request —
        // one stale id in a client's list must not cost them live updates on
        // the rest.
        capability = Object.fromEntries(
            visible.map((id) => [supportChannel(id), ['subscribe'] as ['subscribe']]),
        )
    }

    const key = process.env.ABLY_API_KEY
    if (!key) {
        // Live updates are advisory. Say so plainly and let the client fall back
        // to refetching on open rather than failing the page.
        return NextResponse.json({ error: 'realtime unavailable' }, { status: 503 })
    }

    try {
        const rest = new Ably.Rest({ key })
        const token = (await rest.auth.requestToken({
            capability,
            ttl: 60 * 60 * 1000, // 1 hour
        })) as TokenDetails
        return NextResponse.json({ token: token.token }, {
            headers: { 'Cache-Control': 'no-store' },
        })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'token failed' },
            { status: 500 }
        )
    }
}
