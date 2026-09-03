import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishSeatEvent } from '@/lib/seat-map/realtime-server'

/**
 * POST /api/seat-map/hold   body: { seatId: string, sessionId: string }
 *
 * Takes a browsing hold on ONE seat and returns the caller's resulting session
 * state in the SAME response.
 *
 * Why this route exists at all, when the browser could call hold_seat directly
 * (and used to):
 *
 *  1. ONE ANSWER, NOT TWO. The picker used to select optimistically and then let
 *     the countdown re-sync separately — so `get_seat_hold_expiry` raced the
 *     `hold_seat` insert, read back "no hold", and could not tell "not created
 *     yet" from "expired". That produced the phantom *"your seats were released"*
 *     on a buyer's very first tap. Both answers now come from one round trip, in
 *     causal order, so there is nothing to reconcile and no race to lose.
 *
 *  2. SOMEWHERE TO PUBLISH FROM. Live hold broadcast (Ably, per-section) needs a
 *     server in the path at the moment a hold is taken. A direct PostgREST call
 *     from the browser has no such place. This is that place.
 *
 *  3. A SEAM FOR RATE LIMITING. `session_id` is a client-generated uuid, so
 *     rotating it walks around the per-session cap inside hold_seat. Postgres
 *     cannot see a trustworthy client IP (PostgREST connects from its own pool),
 *     and an IP passed as an RPC argument is attacker-supplied. A route can read
 *     x-forwarded-for. Not implemented here — noted so the seam is understood.
 *
 * CONCURRENCY IS NOT DECIDED HERE. `seat_holds` has UNIQUE (seat_id) and
 * hold_seat inserts ON CONFLICT DO NOTHING, so when two buyers tap the same seat
 * in the same millisecond Postgres elects exactly one winner at the index. This
 * route only reports which of them won. Broadcast is not locking.
 */
export async function POST(req: Request) {
    let body: { seatId?: string; sessionId?: string; origin?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad body' }, { status: 400 })
    }

    const { seatId, sessionId, origin } = body
    if (!seatId || !sessionId) {
        return NextResponse.json({ error: 'seatId and sessionId are required' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )

    // hold_seat is SECURITY DEFINER and returns false for "taken" AND for "at the
    // per-order cap" — both mean "you did not get it", which is all the caller
    // needs to render.
    //
    // The seat's routing is resolved SERVER-SIDE and in PARALLEL, so it costs no
    // serial latency. Taking the channel from the request body instead would let
    // a caller aim a "held" announcement at any section of any event; the seat id
    // in it is still real, but a listener should not have to reason about that.
    const [holdRes, seatRes] = await Promise.all([
        supabase.rpc('hold_seat', { p_seat_id: seatId, p_session_id: sessionId }),
        supabase.from('seats').select('section_id, event_id').eq('id', seatId).maybeSingle(),
    ])

    const { data: held, error } = holdRes
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Only ever announced when the hold actually succeeded, so the message
    // reports a fact Postgres has already committed, never an intention.
    if (held === true && seatRes.data?.event_id && seatRes.data?.section_id) {
        publishSeatEvent(seatRes.data.event_id, seatRes.data.section_id, 'held', seatId, origin)
    }

    // The caller's session state AFTER the write, read in the same request so the
    // client never has to ask a second time and never sees a torn view. Returned
    // whether or not this particular seat was won — losing a seat does not tell
    // you anything about the holds you already have.
    const { data: state } = await supabase.rpc('get_seat_hold_expiry', {
        p_session_id: sessionId,
    })

    return NextResponse.json(
        {
            held: held === true,
            expiresAt: (state as any)?.expires_at ?? null,
            serverNow: (state as any)?.server_now ?? null,
            seatsHeld: Number((state as any)?.seats_held ?? 0),
        },
        { headers: { 'Cache-Control': 'no-store' } }
    )
}
