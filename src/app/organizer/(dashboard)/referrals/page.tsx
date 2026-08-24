import { redirect } from 'next/navigation'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { getReferralLinkStats, type ReferralLinkStat } from '@/lib/organizer/referral-actions'
import { ReferralLinksManager } from '@/components/organizer/referral-links-manager'

export const dynamic = 'force-dynamic'

/**
 * Referrals — influencer link tracking. Organizers create a short /r/<code> link
 * per influencer (event-scoped or storefront-wide), share it, and see clicks →
 * purchases → tickets → revenue attributed back to each one.
 */
export default async function ReferralsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer')

    const supabase = await createClient()
    const { data: events } = await supabase
        .from('events')
        .select('id, title')
        .eq('organizer_id', partner.id)
        .order('created_at', { ascending: false })

    const stats = await getReferralLinkStats({ organizerId: partner.id })
    const baseUrl = `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'}`

    // A failed load used to fall through to an EMPTY list, which is indistinguishable
    // from "you have no links" — so a broken read looked like the organizer's saved
    // links had been deleted. (That is exactly how the ambiguous-column bug in
    // get_referral_link_stats stayed hidden.) Say so instead of showing nothing.
    const loadFailed = !('links' in stats)

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Referrals</h1>
                <p className="text-muted-foreground mt-1">
                    Give each influencer a trackable link. See exactly who drives clicks, ticket sales, and revenue.
                </p>
            </div>

            {loadFailed && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                    <p className="font-semibold text-destructive">Couldn&apos;t load your referral links</p>
                    <p className="text-muted-foreground mt-1">
                        Your links are safe — this is a display problem, not a deletion. Try refreshing;
                        if it keeps happening, contact support rather than creating them again.
                    </p>
                </div>
            )}

            <ReferralLinksManager
                organizerId={partner.id}
                baseUrl={baseUrl}
                hasStorefront={Boolean(partner.slug)}
                events={(events ?? []) as { id: string; title: string }[]}
                initialLinks={('links' in stats ? stats.links : []) as ReferralLinkStat[]}
            />
        </div>
    )
}
