/**
 * Shared serialization for subscription objects returned by the public API,
 * so the list, retrieve, and create endpoints all emit an identical shape.
 */

export interface RawFanSubscription {
    id: string
    fan_id: string
    tier_id: string
    partner_id: string
    status: string
    current_period_start: string | null
    current_period_end: string | null
    cancelled_at: string | null
    created_at: string
    updated_at: string
    tier?: { id: string; name: string; price_monthly: number } | null
    fan?: { id: string; email: string | null; full_name: string | null } | null
}

export function serializeSubscription(sub: RawFanSubscription) {
    return {
        id: sub.id,
        status: sub.status,
        tier: sub.tier
            ? {
                id: sub.tier.id,
                name: sub.tier.name,
                price_monthly: Number(sub.tier.price_monthly),
            }
            : { id: sub.tier_id },
        customer: sub.fan
            ? {
                id: sub.fan.id,
                email: sub.fan.email,
                name: sub.fan.full_name,
            }
            : { id: sub.fan_id },
        currency: 'PHP',
        interval: 'monthly',
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        cancelled_at: sub.cancelled_at,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
    }
}

export const SUBSCRIPTION_SELECT = `
    id, fan_id, tier_id, partner_id, status,
    current_period_start, current_period_end, cancelled_at, created_at, updated_at,
    tier:subscription_tiers ( id, name, price_monthly ),
    fan:users ( id, email, full_name )
`
