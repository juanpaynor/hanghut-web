import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    let body: { sessionId?: string; seatIds?: string[] }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad body' }, { status: 400 })
    }
    const { sessionId, seatIds } = body
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
    await Promise.all(
        seatIds.slice(0, 50).map((id) =>
            supabase.rpc('release_seat_hold', { p_seat_id: id, p_session_id: sessionId })
        )
    )

    return NextResponse.json({ ok: true, released: seatIds.length })
}
