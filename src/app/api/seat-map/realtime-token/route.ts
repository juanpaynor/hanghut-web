import { NextResponse } from 'next/server'
import Ably from 'ably'
import { eventChannelPattern } from '@/lib/seat-map/realtime'

/**
 * GET /api/seat-map/realtime-token?eventId=<uuid>
 *
 * Issues a short-lived Ably token granting SUBSCRIBE ONLY, and only on the
 * sections of the one event asked for.
 *
 * Why a token and not the key: seat availability is what a buyer trusts when
 * deciding to act. A publishable key in the browser bundle would let anyone
 * broadcast "held" for every seat in a venue and make a show look sold out, or
 * broadcast "released" for seats that are gone and send buyers into checkouts
 * that must then reject them. Read access to a public seating chart is
 * unremarkable; write access to it is a denial-of-sale tool.
 *
 * `subscribe` is the entire capability. No publish, no presence, no history.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const eventId = searchParams.get('eventId')
    if (!eventId) {
        return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    }

    const key = process.env.ABLY_API_KEY
    if (!key) {
        // Live updates are advisory. Say so plainly and let the picker fall back
        // to polling rather than failing the page.
        return NextResponse.json({ error: 'realtime unavailable' }, { status: 503 })
    }

    try {
        // A real token, not a tokenRequest: the browser subscribes over Ably's
        // SSE endpoint using native EventSource rather than the SDK, and SSE takes
        // a token directly. EventSource also cannot publish at all, which makes
        // "subscribe only" a property of the transport and not just of the grant.
        const rest = new Ably.Rest({ key })
        const token = await rest.auth.requestToken({
            capability: { [eventChannelPattern(eventId)]: ['subscribe'] },
            ttl: 60 * 60 * 1000, // 1 hour — comfortably longer than any checkout
        })
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
