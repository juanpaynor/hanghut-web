'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface SubscriptionStatus {
    isAuthenticated: boolean
    isActive: boolean
    status: 'active' | 'grace_period' | 'cancelled' | 'expired' | null
    tierId: string | null
    tierName: string | null
    currentPeriodEnd: string | null
    cancelledAt: string | null
}

/**
 * Returns the current user's subscription status for a given partner.
 * Uses the is_active_subscriber RPC as the canonical access check,
 * then fetches full details for UI display.
 */
export async function getSubscriptionStatus(partnerId: string): Promise<SubscriptionStatus> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { isAuthenticated: false, isActive: false, status: null, tierId: null, tierName: null, currentPeriodEnd: null, cancelledAt: null }
    }

    const { data: sub } = await supabase
        .from('fan_subscriptions')
        .select('status, tier_id, current_period_end, cancelled_at, subscription_tiers(name)')
        .eq('fan_id', user.id)
        .eq('partner_id', partnerId)
        .maybeSingle()

    if (!sub) {
        return { isAuthenticated: true, isActive: false, status: null, tierId: null, tierName: null, currentPeriodEnd: null, cancelledAt: null }
    }

    const isActive = (sub.status === 'active' || sub.status === 'grace_period')
        && new Date(sub.current_period_end) > new Date()

    return {
        isAuthenticated: true,
        isActive,
        status: sub.status as SubscriptionStatus['status'],
        tierId: sub.tier_id,
        tierName: (sub.subscription_tiers as any)?.name ?? null,
        currentPeriodEnd: sub.current_period_end,
        cancelledAt: sub.cancelled_at,
    }
}

/**
 * Server-side check: is the current user an active subscriber for this partner?
 * Calls the shared is_active_subscriber RPC — same logic the app uses.
 */
export async function checkIsActiveSubscriber(
    partnerId: string,
    minTierId?: string
): Promise<boolean> {
    const supabase = await createClient()

    const { data } = await supabase.rpc('is_active_subscriber', {
        p_partner_id: partnerId,
        p_min_tier_id: minTierId ?? null,
    })

    return data === true
}

/**
 * Fetches the partner's total subscription revenue for the current
 * calendar month — used for fee tier calculation.
 */
export async function getPartnerMonthlyRevenue(partnerId: string): Promise<number> {
    const adminClient = createAdminClient()
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data } = await adminClient
        .from('subscription_payments')
        .select('amount')
        .eq('partner_id', partnerId)
        .eq('status', 'paid')
        .gte('created_at', monthStart)

    return (data || []).reduce((sum, row) => sum + Number(row.amount), 0)
}
