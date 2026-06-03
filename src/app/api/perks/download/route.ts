import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const tierId = req.nextUrl.searchParams.get('tierId')
    if (!tierId) return NextResponse.json({ error: 'Missing tierId' }, { status: 400 })

    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Must be authenticated — guests can't have subscriptions
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // Fetch the tier + partner
    const { data: tier } = await adminClient
        .from('subscription_tiers')
        .select('id, partner_id, perks')
        .eq('id', tierId)
        .single()

    if (!tier) return NextResponse.json({ error: 'Tier not found' }, { status: 404 })

    // Verify active subscription — cut off immediately on expiry (no grace period for downloads)
    const { data: isActive } = await supabase.rpc('is_active_subscriber', {
        p_partner_id: tier.partner_id,
        p_min_tier_id: tierId,
    })

    if (!isActive) {
        return NextResponse.json(
            { error: 'Active subscription required to access this download' },
            { status: 403 }
        )
    }

    // Find the digital_download perk
    const perks: any[] = tier.perks || []
    const perk = perks.find((p: any) => p.type === 'digital_download')

    if (!perk) return NextResponse.json({ error: 'No download perk found on this tier' }, { status: 404 })

    // Supabase Storage file — generate a short-lived signed URL (5 min)
    if (perk.file_path) {
        const { data: signed, error } = await adminClient.storage
            .from('subscription-downloads')
            .createSignedUrl(perk.file_path, 300) // 300 seconds = 5 minutes

        if (error || !signed?.signedUrl) {
            return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
        }

        return NextResponse.redirect(signed.signedUrl)
    }

    // External URL — proxy redirect (URL never sent to browser directly)
    if (perk.url) {
        return NextResponse.redirect(perk.url)
    }

    return NextResponse.json({ error: 'No file or URL configured for this perk' }, { status: 404 })
}
