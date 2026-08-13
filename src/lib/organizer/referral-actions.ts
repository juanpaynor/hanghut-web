'use server'

import { createClient } from '@/lib/supabase/server'

export type ReferralLinkType = 'organizer_event' | 'organizer_storefront' | 'platform'

export interface ReferralLinkStat {
    link_id: string
    code: string
    label: string
    type: ReferralLinkType
    event_id: string | null
    is_active: boolean
    created_at: string
    clicks: number
    purchases: number
    tickets: number
    revenue: number
}

/** URL-safe code from a label + short random suffix (e.g. "maria-cruz-k3f9"). */
function makeCode(label: string): string {
    const base = label
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'ref'
    const suffix = Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
}

/**
 * Per-link performance for an organizer (optionally scoped to one event):
 * clicks → purchases → tickets → revenue. Ownership is enforced inside the RPC.
 */
export async function getReferralLinkStats(opts: { organizerId: string; eventId?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data, error } = await supabase.rpc('get_referral_link_stats', {
        p_organizer_id: opts.organizerId,
        p_event_id: opts.eventId ?? null,
    })
    if (error) {
        console.error('getReferralLinkStats error:', error)
        return { error: 'Failed to load referral links' }
    }
    return { links: (data ?? []) as ReferralLinkStat[] }
}

/**
 * Create an influencer link. RLS enforces that organizerId belongs to the caller
 * (owner or team manager). Retries once on the (astronomically unlikely) code
 * collision. For organizer_event pass eventId; storefront links omit it.
 */
export async function createReferralLink(opts: {
    organizerId: string
    label: string
    type: ReferralLinkType
    eventId?: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const label = opts.label.trim()
    if (!label) return { error: 'Label is required' }

    const row = {
        organizer_id: opts.organizerId,
        event_id: opts.type === 'organizer_event' ? (opts.eventId ?? null) : null,
        type: opts.type,
        label,
        created_by: user.id,
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase
            .from('referral_links')
            .insert({ ...row, code: makeCode(label) })
            .select('id, code, label, type, event_id, is_active, created_at')
            .single()

        if (!error) return { link: data }
        // 23505 = unique_violation (code already taken) → regenerate and retry once.
        if ((error as { code?: string }).code === '23505' && attempt === 0) continue
        console.error('createReferralLink error:', error)
        return { error: 'Failed to create link' }
    }
    return { error: 'Failed to create link' }
}

/** Enable/disable a link (RLS scopes it to the owner). Inactive links stop resolving. */
export async function setReferralLinkActive(id: string, isActive: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase.from('referral_links').update({ is_active: isActive }).eq('id', id)
    if (error) {
        console.error('setReferralLinkActive error:', error)
        return { error: 'Failed to update link' }
    }
    return { success: true }
}

/** Delete a link (RLS scopes it to the owner). Clicks cascade; past purchases keep their ref. */
export async function deleteReferralLink(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase.from('referral_links').delete().eq('id', id)
    if (error) {
        console.error('deleteReferralLink error:', error)
        return { error: 'Failed to delete link' }
    }
    return { success: true }
}
