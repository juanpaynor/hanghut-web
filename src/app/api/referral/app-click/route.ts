import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/app-click — proxy metric for app installs we can't truly
 * attribute on the web. When a visitor who arrived via a platform /r/<code> link
 * (ref stored in attribution) taps an app-store button, we log it as an
 * 'app_download' click against that link. Fire-and-forget from the client.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null)
        const code = body?.code
        if (!code || typeof code !== 'string') {
            return NextResponse.json({ ok: false }, { status: 400 })
        }
        const supabase = await createClient()
        await supabase.rpc('track_referral_click', {
            p_code: code,
            p_referrer: req.headers.get('referer'),
            p_user_agent: req.headers.get('user-agent'),
            p_kind: 'app_download',
        })
        return NextResponse.json({ ok: true })
    } catch {
        return NextResponse.json({ ok: false }, { status: 200 })
    }
}
