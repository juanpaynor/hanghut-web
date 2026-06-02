import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TierManager } from '@/components/organizer/subscriptions/tier-manager'

export const dynamic = 'force-dynamic'

async function getPartnerTiers(partnerId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('partner_id', partnerId)
        .order('price_monthly', { ascending: true })
    return data || []
}

async function getSubscriberStats(partnerId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('fan_subscriptions')
        .select('status, tier_id, subscription_tiers(price_monthly)')
        .eq('partner_id', partnerId)
        .in('status', ['active', 'grace_period'])

    const active = data || []
    const mrr = active.reduce((sum, s) => sum + Number((s.subscription_tiers as any)?.price_monthly || 0), 0)
    return { activeCount: active.length, mrr }
}

export default async function SubscriptionsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const [tiers, stats] = await Promise.all([
        getPartnerTiers(partnerId),
        getSubscriberStats(partnerId),
    ])

    return (
        <div className="space-y-6">
            <div className="flex justify-end gap-6">
                <div className="text-center">
                    <p className="text-2xl font-bold">{stats.activeCount}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Subscribers</p>
                </div>
                <div className="w-px bg-border" />
                <div className="text-center">
                    <p className="text-2xl font-bold">₱{stats.mrr.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">MRR</p>
                </div>
            </div>
            <TierManager tiers={tiers} partnerId={partnerId} />
        </div>
    )
}
