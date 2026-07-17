import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/seat-map/geometry?eventId=<uuid>&v=<version>
 *
 * The IMMUTABLE half of a seat map — sections, seat coordinates, tier prices,
 * decor. It only changes when the organizer saves the map or edits a tier, and
 * every such change bumps the `version` token (see get_event_seat_geometry).
 *
 * Because the response is keyed by ?v, it's safe to cache FOREVER: a new version
 * is a new URL. The first buyer warms the CDN; everyone after is served from the
 * edge and never touches the database. This is the core of the geometry/status
 * split — the heavy payload stops scaling with traffic.
 *
 * No cookies / no user context on purpose — the response must be identical for
 * every viewer so the CDN can share one cached copy.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const eventId = searchParams.get('eventId')
    if (!eventId) {
        return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )

    const { data, error } = await supabase.rpc('get_event_seat_geometry', { p_event_id: eventId })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
        // No map for this event — don't cache a miss for a year.
        return NextResponse.json(null, {
            headers: { 'Cache-Control': 'public, max-age=30' },
        })
    }

    return NextResponse.json(data, {
        headers: {
            // Immutable per ?v. Long-lived on both the browser and the CDN; a new
            // version = new URL, so we never serve stale geometry.
            'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        },
    })
}
