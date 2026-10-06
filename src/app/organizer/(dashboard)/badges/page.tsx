import { redirect } from 'next/navigation'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import {
    getCreatorBadges, getBadgeAnalytics, getBadgeLoyalCore,
    type CreatorBadge, type BadgeAnalytics, type LoyalCoreResult,
} from '@/lib/organizer/badge-actions'
import { BadgeManager } from '@/components/organizer/badge-manager'
import { BadgeInsights } from '@/components/organizer/badge-insights'

export const dynamic = 'force-dynamic'

/**
 * Loyalty badges — partner-authored, worn on fans' profiles in the app.
 *
 * The organizer designs the badge and picks how it is earned; Postgres decides
 * who earns it (criteria contract v1, team_comms #239). Evaluation is retroactive,
 * so a badge created today finds the people who already qualified.
 */
export default async function BadgesPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')
    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer')

    const supabase = await createClient()
    // Analytics and the loyal core are fetched here rather than on the client so
    // the page arrives with its numbers already on it. Both are a single grouped
    // query in Postgres; the holder LISTS stay lazy, behind the sheet.
    const [res, analyticsRes, coreRes, { data: events }, { data: tierRows }] = await Promise.all([
        getCreatorBadges(partner.id),
        getBadgeAnalytics(partner.id),
        // limit must match CORE_PAGE in badge-insights.tsx, or page 1 renders more
        // rows than the pager below it claims to be showing.
        getBadgeLoyalCore(partner.id, { minBadges: 2, limit: 10, offset: 0 }),
        supabase
            .from('events')
            .select('id, title')
            .eq('organizer_id', partner.id)
            .order('start_datetime', { ascending: false })
            .limit(100),
        // Tier names repeat across events ("VIP", "General"), so each option is
        // labelled with its event or the partner cannot tell them apart.
        supabase
            .from('ticket_tiers')
            .select('id, name, events!inner(title, organizer_id)')
            .eq('events.organizer_id', partner.id)
            .eq('is_active', true)
            .limit(200),
    ])

    const badges = ('badges' in res ? res.badges : []) as CreatorBadge[]
    const analytics = ('analytics' in analyticsRes ? analyticsRes.analytics : null) as BadgeAnalytics | null
    const loyalCore = ('result' in coreRes ? coreRes.result : null) as LoyalCoreResult | null

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Badges</h1>
                <p className="text-muted-foreground mt-1">
                    Recognise your regulars. Badges you create here appear on your fans&apos;
                    profiles in the app, and count past behaviour — not just what happens next.
                </p>
            </div>

            <BadgeManager
                organizerId={partner.id}
                initialBadges={badges}
                events={(events ?? []).map(e => ({ id: e.id, title: e.title }))}
                tiers={(tierRows ?? []).map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    eventTitle: t.events?.title ?? 'Event',
                }))}
            />

            <BadgeInsights
                organizerId={partner.id}
                analytics={analytics}
                loyalCore={loyalCore}
            />
        </div>
    )
}
