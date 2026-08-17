import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Cached auth + partner resolution.
 * 
 * React.cache() deduplicates within a single server request.
 * So layout calls getUser() → child page calls getUser() → only 1 actual network call.
 * 
 * This eliminates the sequential waterfall where every page re-fetched auth and partner data.
 */

export const getAuthUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
})

/**
 * The partner this user is ACTING ON — ownership first, then a platform-support seat.
 *
 * Server actions historically resolved the partner with
 * `from('partners').select('id').eq('user_id', user.id)`, which answers "which partner
 * does this user OWN". A platform-support seat is not an owner row, so every one of
 * those call sites returns nothing and reports "Partner profile not found" even though
 * getUserRole() reports 'owner'. Use this instead wherever an action needs the acting
 * partner, so the read gate and the write gate agree.
 *
 * Returns null when the user has neither — callers keep their existing not-found path.
 */
export const getActingPartnerId = cache(async (userId: string): Promise<string | null> => {
    const supabase = await createClient()

    const { data: owned } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

    if (owned?.id) return owned.id

    const { data: support } = await supabase
        .from('partner_team_members')
        .select('partner_id')
        .eq('user_id', userId)
        .eq('is_platform_support', true)
        .maybeSingle()

    return support?.partner_id ?? null
})

export const getPartner = cache(async (userId: string) => {
    const supabase = await createClient()

    // Check direct ownership first
    const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name, kyc_status, slug, profile_photo_url, capabilities, custom_domain, custom_domain_verified, subscriptions_enabled, merch_enabled')
        .eq('user_id', userId)
        .single()

    if (partner) return partner

    // Fallback: check team membership
    const { data: teamMember } = await supabase
        .from('partner_team_members')
        .select('partner_id, partners(id, business_name, kyc_status, slug, profile_photo_url, capabilities, custom_domain, custom_domain_verified, subscriptions_enabled, merch_enabled)')
        .eq('user_id', userId)
        .single()

    if (teamMember?.partners) {
        const p = teamMember.partners as any
        return {
            id: p.id,
            business_name: p.business_name,
            kyc_status: p.kyc_status,
            slug: p.slug,
            profile_photo_url: p.profile_photo_url,
            capabilities: p.capabilities,
            custom_domain: p.custom_domain,
            custom_domain_verified: p.custom_domain_verified,
            subscriptions_enabled: p.subscriptions_enabled,
            merch_enabled: p.merch_enabled,
        }
    }

    return null
})

/**
 * Convenience: get just the partnerId (reuses getPartner cache)
 */
export const getPartnerId = cache(async (userId: string) => {
    const partner = await getPartner(userId)
    return partner?.id || null
})

/**
 * Get the user's role within their partner organization.
 * Returns { role, partnerId } or null if user has no org access.
 * 
 * Roles: 'owner' | 'manager' | 'scanner' | 'finance' | 'marketing'
 */
export type UserRole = {
    role: 'owner' | 'manager' | 'scanner' | 'finance' | 'marketing'
    partnerId: string
}

export const getUserRole = cache(async (userId: string): Promise<UserRole | null> => {
    const supabase = await createClient()

    // Check direct ownership first
    const { data: owner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

    if (owner) {
        return { role: 'owner', partnerId: owner.id }
    }

    // Check team membership
    const { data: member } = await supabase
        .from('partner_team_members')
        .select('partner_id, role, is_platform_support')
        .eq('user_id', userId)
        .maybeSingle()

    if (member) {
        // A platform-support seat is owner-equivalent. Settings (and anything else
        // gated on 'owner') is otherwise unreachable for a team member — the four
        // assignable roles all sit below it — so staff helping a partner configure
        // their org would have no way in without taking the client's ownership away.
        // The row itself is hidden from the partner's Team page in getTeamMembers().
        if ((member as any).is_platform_support === true) {
            return { role: 'owner', partnerId: member.partner_id }
        }
        return { role: member.role as UserRole['role'], partnerId: member.partner_id }
    }

    return null
})
