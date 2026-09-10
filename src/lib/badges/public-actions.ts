import { createPublicClient } from '@/lib/supabase/public'
import type { BadgeCriteria } from '@/lib/organizer/badge-actions'

/**
 * Badges a visitor could earn from this organizer, for the storefront.
 *
 * Reads through creator_badges_public_read (USING true), so this works for a
 * signed-out visitor with no extra policy. Only ACTIVE badges are returned —
 * a deactivated badge is one the organizer has stopped awarding, and offering
 * it on a public page would be a promise we don't keep.
 */
export interface PublicBadge {
    id: string
    name: string
    description: string | null
    tier: string
    art_url: string | null
    criteria: BadgeCriteria
    holder_count: number
}

export async function getPublicBadges(organizerId: string): Promise<PublicBadge[]> {
    const supabase = createPublicClient()

    const { data, error } = await supabase
        .from('creator_badges')
        .select('id, name, description, tier, art_url, art_suppressed, criteria, holder_count')
        .eq('organizer_id', organizerId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

    if (error || !data) return []

    return data.map((b: any) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        tier: b.tier,
        // art_suppressed means the art was pulled (moderation or a broken upload);
        // the badge still exists, it just falls back to the tier treatment.
        art_url: b.art_suppressed ? null : b.art_url,
        criteria: b.criteria,
        holder_count: Number(b.holder_count ?? 0),
    }))
}

/**
 * Plain-language "how you earn this".
 *
 * The organizer authors criteria as a typed jsonb contract; a visitor should
 * never see `spend_total` or a raw threshold. Anything we can't describe
 * confidently returns null and the card simply omits the line rather than
 * guessing at a rule someone might act on.
 */
export function describeCriteria(criteria: BadgeCriteria | null | undefined): string | null {
    if (!criteria?.type) return null
    const p = (criteria.params || {}) as Record<string, any>
    const n = (v: any) => Number(v ?? 0)
    const peso = (v: any) => `₱${n(v).toLocaleString()}`

    switch (criteria.type) {
        case 'manual_grant':
            return 'Awarded by the organizer'
        case 'attendance_count':
            return `Attend ${n(p.count)} ${n(p.count) === 1 ? 'event' : 'events'}`
        case 'checkin_count':
            return `Check in at ${n(p.count)} ${n(p.count) === 1 ? 'event' : 'events'}`
        case 'event_count_purchased':
            return `Buy tickets to ${n(p.count)} ${n(p.count) === 1 ? 'event' : 'events'}`
        case 'spend_total':
            return `Spend ${peso(p.amount)} in total`
        case 'specific_event':
            return 'Attend a specific event'
        case 'first_n_buyers':
            return `Be one of the first ${n(p.count)} buyers`
        case 'group_buyer':
            return `Buy ${n(p.count)} tickets in one order`
        case 'streak_months':
            return `Attend ${n(p.months)} months in a row`
        case 'tier_purchased':
            return 'Buy a specific ticket type'
        case 'customer_segment':
            return 'Awarded to the organizer’s most loyal fans'
        default:
            return null
    }
}
