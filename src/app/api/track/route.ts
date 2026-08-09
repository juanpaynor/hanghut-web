import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set([
    'view',
    'get_tickets',
    'pick_seats',
    'share',
    'add_to_calendar',
    'checkout_started',
])

/**
 * POST /api/track — log a single event-page interaction (view or CTA press).
 * Fire-and-forget from the client. Writes via the admin client so the raw
 * table stays insert-only/unreadable to the public; organizers read aggregates
 * through the security-definer RPCs. user_id is derived server-side (never
 * trusted from the client).
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null)
        const event_id = body?.event_id
        const type = body?.type
        const session_id = body?.session_id

        if (!event_id || typeof event_id !== 'string' || !VALID_TYPES.has(type)) {
            return NextResponse.json({ error: 'invalid' }, { status: 400 })
        }

        // Acquisition attribution (best-effort; capped so a hostile client can't bloat rows).
        const cap = (v: unknown, n = 120) => (typeof v === 'string' ? v.slice(0, n) : null)
        const channel = cap(body?.channel, 32)
        const utm_source = cap(body?.utm_source)
        const utm_medium = cap(body?.utm_medium)
        const utm_campaign = cap(body?.utm_campaign)
        const referrer = cap(body?.referrer, 500)

        // Derive the user server-side from the session cookie (if logged in).
        let userId: string | null = null
        try {
            const supa = await createClient()
            const { data: { user } } = await supa.auth.getUser()
            userId = user?.id ?? null
        } catch {
            /* anonymous viewer — fine */
        }

        const admin = createAdminClient()
        await admin.from('event_interactions').insert({
            event_id,
            type,
            session_id: typeof session_id === 'string' ? session_id.slice(0, 64) : null,
            user_id: userId,
            source: 'web',
            channel,
            utm_source,
            utm_medium,
            utm_campaign,
            referrer,
        })

        return NextResponse.json({ ok: true })
    } catch {
        return NextResponse.json({ error: 'bad request' }, { status: 400 })
    }
}
