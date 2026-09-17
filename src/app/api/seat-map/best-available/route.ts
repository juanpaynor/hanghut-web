import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishSeatEvent } from '@/lib/seat-map/realtime-server'

/**
 * POST /api/seat-map/best-available
 * body: { eventId, sectionId, tierId, quantity, sessionId, allowSplit?, exclude?, origin? }
 *
 * "Buy by section": the server picks the best N seats in the section and HOLDS
 * them under the buyer's browsing session — after this, checkout is exactly
 * the hand-picked path (seat_ids + seat_session_id → assign_seats_to_intent).
 *
 * Same reasons this is a route and not a direct RPC as /api/seat-map/hold: one
 * causal answer (seats + hold expiry in the same response), a place to publish
 * the per-section 'held' broadcast from, and a seam for rate limiting.
 *
 * Concurrency is decided in Postgres (FOR UPDATE SKIP LOCKED + UNIQUE(seat_id)
 * on seat_holds); this only reports what the buyer actually got.
 */
export async function POST(req: Request) {
    let body: {
        eventId?: string; sectionId?: string; tierId?: string; quantity?: number
        sessionId?: string; allowSplit?: boolean; exclude?: string[]; origin?: string
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad body' }, { status: 400 })
    }

    const { eventId, sectionId, tierId, quantity, sessionId, allowSplit, exclude, origin } = body
    if (!eventId || !sectionId || !tierId || !sessionId || !Number.isInteger(quantity) || (quantity as number) < 1) {
        return NextResponse.json({ error: 'eventId, sectionId, tierId, quantity and sessionId are required' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )

    const { data, error } = await supabase.rpc('hold_best_available', {
        p_event_id: eventId,
        p_section_id: sectionId,
        p_tier_id: tierId,
        p_quantity: quantity,
        p_session_id: sessionId,
        p_allow_split: allowSplit === true,
        p_exclude: Array.isArray(exclude) && exclude.length > 0 ? exclude : null,
    })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = (data ?? { ok: false, code: 'SERVER_ERROR' }) as {
        ok: boolean; code?: string; seats?: { seat_id: string }[]; together?: string; split?: number[]
        expires_at?: string; proposal?: unknown; max?: number
    }

    // Announce only what Postgres has committed. Seats this session previously
    // auto-held were released inside the RPC; other buyers pick that up from
    // the status poll (≤12s) — a release announcement would need the old ids,
    // which the RPC does not return, and a stale "held" is the safe direction.
    if (result.ok && Array.isArray(result.seats)) {
        for (const s of result.seats) publishSeatEvent(eventId, sectionId, 'held', s.seat_id, origin)
    }

    // Session state after the write, so the countdown starts from one causal read.
    const { data: state } = await supabase.rpc('get_seat_hold_expiry', { p_session_id: sessionId })

    return NextResponse.json(
        {
            ...result,
            expiresAt: (state as any)?.expires_at ?? result.expires_at ?? null,
            serverNow: (state as any)?.server_now ?? null,
            seatsHeld: Number((state as any)?.seats_held ?? 0),
        },
        { headers: { 'Cache-Control': 'no-store' } }
    )
}
