import { redirect } from 'next/navigation'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { getCreatorBadges, type CreatorBadge } from '@/lib/organizer/badge-actions'
import { BadgeManager } from '@/components/organizer/badge-manager'

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
    const [res, { data: events }, { data: tierRows }] = await Promise.all([
        getCreatorBadges(partner.id),
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
        </div>
    )
}
