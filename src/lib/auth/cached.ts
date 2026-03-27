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

export const getPartner = cache(async (userId: string) => {
    const supabase = await createClient()

    // Check direct ownership first
    const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name, kyc_status, slug, profile_photo_url')
        .eq('user_id', userId)
        .single()

    if (partner) return partner

    // Fallback: check team membership
    const { data: teamMember } = await supabase
        .from('partner_team_members')
        .select('partner_id, partners(id, business_name, kyc_status, slug, profile_photo_url)')
        .eq('user_id', userId)
        .single()

    if (teamMember?.partners) {
        // Team member's partner data has the same shape
        const p = teamMember.partners as any
        return {
            id: p.id,
            business_name: p.business_name,
            kyc_status: p.kyc_status,
            slug: p.slug,
            profile_photo_url: p.profile_photo_url,
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
        .select('partner_id, role')
        .eq('user_id', userId)
        .maybeSingle()

    if (member) {
        return { role: member.role as UserRole['role'], partnerId: member.partner_id }
    }

    return null
})
