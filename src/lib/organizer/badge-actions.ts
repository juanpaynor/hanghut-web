'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

/**
 * Partner-authored loyalty badges — criteria contract v1 (team_comms #239).
 *
 * The organizer authors a badge here; the counting engine in Postgres decides who
 * earns it. Nothing in this file computes eligibility: award and preview both go
 * through creator_badge_qualifying_emails() so the number a partner sees while
 * authoring is the same number the engine will act on.
 */

export type BadgeCriteriaType =
    | 'manual_grant'
    | 'attendance_count'
    | 'checkin_count'
    | 'spend_total'
    | 'specific_event'
    | 'first_n_buyers'
    | 'group_buyer'
    | 'streak_months'
    // v1.1
    | 'customer_segment'
    | 'event_count_purchased'
    | 'tier_purchased'


export interface BadgeCriteria {
    version: 1
    type: BadgeCriteriaType
    params: Record<string, unknown>
}

export interface CreatorBadge {
    id: string
    organizer_id: string
    name: string
    description: string | null
    tier: string
    art_url: string | null
    art_suppressed: boolean
    criteria: BadgeCriteria
    is_active: boolean
    holder_count: number
    created_at: string
    updated_at: string
}

/** Service-role client for storage writes; partners never write to the bucket directly. */
function adminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Server config error')
    return createSupabaseClient(url, key)
}

/**
 * Confirms the caller may act for this partner: the OWNER, one of their TEAM
 * MEMBERS, or a platform admin.
 *
 * Team members matter here and were missed on the first pass. getPartner() falls
 * back to team membership, and the sidebar shows Badges to managers and
 * marketing — so a manager could open the page and then have every single action
 * fail with "Forbidden", including the art upload.
 *
 * This is a fast rejection, not the security boundary. The same rule is enforced
 * underneath by the creator_badges RLS policy and by can_manage_partner() inside
 * grant_creator_badge() and preview_creator_badge_earners(), so a forged
 * organizer id gets nowhere even if this check is bypassed. Keep the three in
 * step: they disagreed once, and the symptom was a page that loaded and then
 * refused every action.
 */
async function requirePartnerAccess(organizerId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' as const }

    const { data: partner } = await supabase
        .from('partners').select('id').eq('id', organizerId).eq('user_id', user.id).maybeSingle()
    if (partner) return { user, supabase }

    const { data: teamMember } = await supabase
        .from('partner_team_members').select('partner_id')
        .eq('partner_id', organizerId).eq('user_id', user.id).maybeSingle()
    if (teamMember) return { user, supabase }

    const { data: adminUser } = await supabase
        .from('users').select('is_admin').eq('id', user.id).maybeSingle()
    if (adminUser?.is_admin) return { user, supabase }

    return { error: 'Forbidden' as const }
}

export async function getCreatorBadges(organizerId: string) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    const { data, error } = await ctx.supabase
        .from('creator_badges')
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('getCreatorBadges error:', error)
        return { error: 'Failed to load badges' }
    }
    return { badges: (data ?? []) as CreatorBadge[] }
}

/**
 * How many customers qualify for this criteria RIGHT NOW.
 *
 * This is the whole reason the attendance criteria can stay visible in the
 * builder (team_comms #294). The real risk was never that check-in data is
 * sparse — it is that a partner publishes "attend 3 of my events" without
 * knowing nobody can earn it. That is a question about their own data, and it
 * has an answer before they publish.
 */
export async function previewBadgeEarners(organizerId: string, criteria: BadgeCriteria) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    const { data, error } = await ctx.supabase.rpc('preview_creator_badge_earners', {
        p_organizer_id: organizerId,
        p_criteria: criteria,
    })

    if (error) {
        console.error('previewBadgeEarners error:', error)
        return { error: 'Could not calculate' }
    }
    return { count: Number(data ?? 0) }
}

export async function saveCreatorBadge(input: {
    id?: string
    organizerId: string
    name: string
    description?: string
    tier: string
    criteria: BadgeCriteria
    artUrl?: string | null
    isActive: boolean
}) {
    const ctx = await requirePartnerAccess(input.organizerId)
    if ('error' in ctx) return { error: ctx.error }

    if (!input.name?.trim()) return { error: 'Name is required' }
    if (!input.criteria?.type) return { error: 'Choose how this badge is earned' }

    const row = {
        organizer_id: input.organizerId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        tier: input.tier,
        criteria: input.criteria,
        art_url: input.artUrl ?? null,
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
    }

    const query = input.id
        ? ctx.supabase.from('creator_badges').update(row).eq('id', input.id).select('id').single()
        : ctx.supabase.from('creator_badges').insert(row).select('id').single()

    const { data, error } = await query
    if (error) {
        console.error('saveCreatorBadge error:', error)
        return { error: error.message }
    }

    revalidatePath('/organizer/badges')
    return { success: true, id: data.id as string }
}

export async function deleteCreatorBadge(organizerId: string, badgeId: string) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    // Holders cascade with the badge (FK ON DELETE CASCADE). Deleting therefore
    // takes an earned badge away from everyone who has it, which is why the UI
    // asks first and offers deactivation as the softer option.
    const { error } = await ctx.supabase
        .from('creator_badges').delete().eq('id', badgeId).eq('organizer_id', organizerId)

    if (error) return { error: error.message }
    revalidatePath('/organizer/badges')
    return { success: true }
}

/** Run the engine for one badge. Idempotent — safe to press repeatedly. */
export async function evaluateBadge(organizerId: string, badgeId: string) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    // Awarding is service-role. evaluate_creator_badge, evaluate_all_creator_badges
    // and creator_badge_qualifying_emails are SECURITY DEFINER and trust their
    // arguments, so EXECUTE on them is revoked from anon and authenticated — a
    // browser cannot mint badges, nor read anyone's customer emails, by calling
    // the engine directly.
    const admin = adminClient()
    const { data: badge } = await admin
        .from('creator_badges').select('id').eq('id', badgeId).eq('organizer_id', organizerId).maybeSingle()
    if (!badge) return { error: 'Badge not found' }

    const { data, error } = await admin.rpc('evaluate_creator_badge', { p_badge_id: badgeId })
    if (error) {
        console.error('evaluateBadge error:', error)
        return { error: error.message }
    }

    revalidatePath('/organizer/badges')
    return { success: true, awarded: Number((data as any)?.awarded ?? 0) }
}

export interface CustomerHit {
    email: string
    name: string | null
    events_purchased: number
    total_spent: number
    rfm_segment: string | null
}

/**
 * The organizer's own customers, for picking people to grant a badge to.
 *
 * Reads through get_organizer_customers, which enforces partner ownership in the
 * database rather than trusting this layer — so this cannot be used to browse
 * somebody else's customer list even with a forged organizer id.
 */
export async function searchOrganizerCustomers(organizerId: string, search: string, segment?: string) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    const { data, error } = await ctx.supabase.rpc('get_organizer_customers', {
        p_partner_id: organizerId,
        p_segment: segment || null,
        p_search: search?.trim() || null,
        p_limit: 25,
        p_offset: 0,
        p_sort: 'spend',
    })

    if (error) {
        console.error('searchOrganizerCustomers error:', error)
        return { error: 'Could not load customers' }
    }

    const customers = (((data as any)?.customers ?? []) as any[]).map(c => ({
        email: c.email,
        name: c.name ?? null,
        events_purchased: Number(c.events_purchased ?? 0),
        total_spent: Number(c.total_spent ?? 0),
        rfm_segment: c.rfm_segment ?? null,
    })) as CustomerHit[]

    return { customers }
}

/** manual_grant only — hand a badge to specific people by email. */
export async function grantBadgeToEmails(organizerId: string, badgeId: string, emails: string[]) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    const cleaned = emails
        .map(e => e.trim().toLowerCase())
        .filter(e => e.includes('@') && e.length > 3)

    if (cleaned.length === 0) return { error: 'Enter at least one valid email' }

    const { data, error } = await ctx.supabase.rpc('grant_creator_badge', {
        p_badge_id: badgeId,
        p_emails: cleaned,
    })
    if (error) return { error: error.message }

    revalidatePath('/organizer/badges')
    return { success: true, granted: Number((data as any)?.granted ?? 0) }
}

/**
 * Upload badge art. Server-side with the service role, so the bucket needs no
 * client INSERT policy — a partner's browser never writes to it.
 */
export async function uploadBadgeArt(organizerId: string, formData: FormData) {
    const ctx = await requirePartnerAccess(organizerId)
    if ('error' in ctx) return { error: ctx.error }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return { error: 'Choose an image' }
    if (file.size > 2 * 1024 * 1024) return { error: 'Image must be under 2MB' }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${organizerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const admin = adminClient()
    const { error } = await admin.storage
        .from('badge-art')
        .upload(path, file, { contentType: file.type, upsert: false })

    if (error) {
        console.error('uploadBadgeArt error:', error)
        return { error: error.message }
    }

    const { data } = admin.storage.from('badge-art').getPublicUrl(path)
    return { success: true, url: data.publicUrl }
}
