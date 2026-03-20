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
 * Convenience: get just the partnerId (most pages only need this)
 */
export const getPartnerId = cache(async (userId: string) => {
    const supabase = await createClient()

    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', userId)
        .single()

    if (partner) return partner.id

    const { data: teamMember } = await supabase
        .from('partner_team_members')
        .select('partner_id')
        .eq('user_id', userId)
        .single()

    return teamMember?.partner_id || null
})
