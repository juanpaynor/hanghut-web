import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SubscriptionAnalytics } from '@/components/organizer/subscriptions/subscription-analytics'

export const dynamic = 'force-dynamic'

async function getAnalyticsData(partnerId: string) {
    const supabase = await createClient()

    const [paymentsRes, subsRes] = await Promise.all([
        // All paid payments for this partner
        supabase
            .from('subscription_payments')
            .select('amount, platform_fee, created_at, billing_period_start')
            .eq('partner_id', partnerId)
            .eq('status', 'paid')
            .order('created_at', { ascending: true }),

        // All subscriptions ever
        supabase
            .from('fan_subscriptions')
            .select('id, status, created_at, cancelled_at, current_period_end, subscription_tiers(name, price_monthly)')
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: true }),
    ])

    return {
        payments: paymentsRes.data || [],
        subscriptions: subsRes.data || [],
    }
}

export default async function SubscriptionAnalyticsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const { payments, subscriptions } = await getAnalyticsData(partnerId)

    return <SubscriptionAnalytics payments={payments as any} subscriptions={subscriptions as any} />
}
