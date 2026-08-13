import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /r/<code> — influencer / referral link entry point.
 *
 * Logs a click and 302s to the target with ?ref=<code> appended. The existing
 * first-touch attribution capture (src/lib/tracking.ts) picks up the ref on the
 * destination page and carries it into checkout → purchase_intents.attribution.
 *
 * track_referral_click is a security-definer RPC: it resolves an ACTIVE link,
 * writes the click, and returns the target. Unknown/inactive codes return null,
 * in which case we bounce to home without logging (no leak of which codes exist).
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code } = await params
    const origin = new URL(req.url).origin

    // Fall back to home for anything we can't resolve.
    const home = () => NextResponse.redirect(new URL('/', origin))

    if (!code) return home()

    const supabase = await createClient()
    const referrer = req.headers.get('referer')
    const userAgent = req.headers.get('user-agent')

    const { data, error } = await supabase.rpc('track_referral_click', {
        p_code: code,
        p_referrer: referrer,
        p_user_agent: userAgent,
    })

    if (error || !data) return home()

    const link = data as { code: string; type: string; event_id: string | null; partner_slug: string | null }
    const ref = encodeURIComponent(link.code)

    let path = '/'
    if (link.type === 'organizer_event' && link.event_id) {
        path = `/events/${link.event_id}?ref=${ref}`
    } else if (link.type === 'organizer_storefront' && link.partner_slug) {
        path = `/${link.partner_slug}?ref=${ref}`
    } else if (link.type === 'platform') {
        // Phase 2 refines the platform target (register/landing); default to landing.
        path = `/?ref=${ref}`
    }

    return NextResponse.redirect(new URL(path, origin))
}
