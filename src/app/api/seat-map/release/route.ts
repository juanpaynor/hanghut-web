import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishSeatEvent } from '@/lib/seat-map/realtime-server'

/**
 * POST /api/seat-map/release   body: { sessionId: string, seatIds: string[] }
 *
 * Releases a browsing session's seat holds. Called via navigator.sendBeacon when
 * the picker closes/unmounts, so an abandoned selection frees up immediately for
 * other buyers instead of sitting held until the 12-min TTL. sendBeacon is used
 * (not a supabase-js call) because it reliably fires during page teardown, where
 * a normal fetch/rpc can be cancelled.
 */
export async function POST(req: Request) {
    let body: { sessionId?: string; seatIds?: string[]; origin?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad body' }, { status: 400 })
    }
    const { sessionId, seatIds, origin } = body
    if (!sessionId || !Array.isArray(seatIds) || seatIds.length === 0) {
        return NextResponse.json({ ok: true, released: 0 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )

    // A session can only release its OWN holds (release_seat_hold matches on
    // session_id), so this is safe to expose without auth.
    const ids = seatIds.slice(0, 50)
    const [outcomes, routing] = await Promise.all([
        Promise.all(ids.map((id) =>
            supabase.rpc('release_seat_hold', { p_seat_id: id, p_session_id: sessionId })
        )),
        supabase.from('seats').select('id, section_id, event_id').in('id', ids),
    ])

    // release_seat_hold matches on session_id and returns FOUND, so this is the
    // set of seats this session ACTUALLY held and just gave up -- not the set it
    // asked about.
    const freed = new Set(ids.filter((_, i) => outcomes[i]?.data === true))

    // Freed seats are announced too. A release that nobody hears is the worse
    // half of the pair: the seat is genuinely available again but every other
    // buyer's map keeps it greyed out until their next poll, so a released seat
    // looks taken for longer than it actually is.
    //
    // Announced ONLY for seats that were really freed. This route takes an
    // unauthenticated, client-generated session_id, so announcing on REQUEST
    // rather than on OUTCOME let anyone broadcast "released" for a seat someone
    // else is holding: every listener flips it to available, buyers tap it, and
    // assignment then rejects them. The hold itself was never at risk (the
    // DELETE matches on session_id) -- but the map lied until the next poll.
    for (const row of routing.data ?? []) {
        if (!freed.has(row.id)) continue
        publishSeatEvent(row.event_id, row.section_id, 'released', row.id, origin)
    }

    // Holds actually dropped. This used to return seatIds.length -- the number
    // ASKED for -- which also over-reported whenever the 50-id cap truncated
    // the request.
    return NextResponse.json({ ok: true, released: freed.size })
}
