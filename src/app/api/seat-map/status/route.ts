import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/seat-map/status?eventId=<uuid>
 *
 * The VOLATILE half — which seats are taken (booked/disabled/held) + per-section
 * remaining counts + the current geometry `version`. Tiny compared to the map.
 *
 * Micro-cached at the edge (a few seconds): during a flash on-sale thousands of
 * buyers poll this, and s-maxage collapses them into ~one origin query every few
 * seconds instead of thousands. `stale-while-revalidate` keeps it feeling live.
 * A 2–3s-stale availability view is fine — holds + assign_seats_to_intent are the
 * real authority at checkout.
 *
 * No cookies / no user context so the CDN can share one copy.
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

    const { data, error } = await supabase.rpc('get_event_seat_status', { p_event_id: eventId })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, {
        headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=3, stale-while-revalidate=7',
        },
    })
}
