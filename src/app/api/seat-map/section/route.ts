import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/seat-map/section?sectionId=<uuid>&v=<version>
 *
 * One section's seat GEOMETRY (coords + tier, no status), loaded lazily when a
 * buyer zooms into that section. Like /geometry it's immutable per map version,
 * so it's keyed by ?v and cached hard: the first buyer to open a section warms
 * the edge; everyone after is served from the CDN.
 *
 * This is the Phase-2 payoff — the overview never ships seat arrays, so opening
 * a huge arena costs KBs, and only the sections a buyer actually looks at get
 * their (cached) seat lists.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const sectionId = searchParams.get('sectionId')
    if (!sectionId) {
        return NextResponse.json({ error: 'sectionId required' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )

    const { data, error } = await supabase.rpc('get_event_section_seats', { p_section_id: sectionId })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [], {
        headers: {
            'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        },
    })
}
