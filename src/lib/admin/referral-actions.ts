'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export interface PlatformReferralStat {
    link_id: string
    code: string
    label: string
    is_active: boolean
    created_at: string
    clicks: number
    app_downloads: number
    signups: number
}

/** Any admin role may manage platform referral links. Returns the admin's user id. */
async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data: role } = await supabase.rpc('is_user_admin')
    if (!role) throw new Error('Admin access required')
    return user.id
}

function getServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Config error')
    return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

function makeCode(label: string): string {
    const base = label
        .toLowerCase().normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'ref'
    return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

/** Per-platform-link stats (clicks, app-download proxy, partner signups). */
export async function getPlatformReferralStats() {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_referral_stats')
    if (error) {
        console.error('getPlatformReferralStats error:', error)
        return { error: 'Failed to load platform links' }
    }
    return { links: (data ?? []) as PlatformReferralStat[] }
}

/** Create a HangHut platform referral link (organizer_id is null). */
export async function createPlatformLink(label: string) {
    const userId = await requireAdmin()
    const clean = label.trim()
    if (!clean) return { error: 'Label is required' }

    const admin = getServiceClient()
    for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await admin
            .from('referral_links')
            .insert({ type: 'platform', organizer_id: null, label: clean, code: makeCode(clean), created_by: userId })
            .select('id, code, label, is_active, created_at')
            .single()
        if (!error) return { link: data }
        if ((error as { code?: string }).code === '23505' && attempt === 0) continue
        console.error('createPlatformLink error:', error)
        return { error: 'Failed to create link' }
    }
    return { error: 'Failed to create link' }
}

export async function setPlatformLinkActive(id: string, isActive: boolean) {
    await requireAdmin()
    const admin = getServiceClient()
    const { error } = await admin.from('referral_links').update({ is_active: isActive }).eq('id', id).eq('type', 'platform')
    if (error) { console.error('setPlatformLinkActive error:', error); return { error: 'Failed to update link' } }
    return { success: true }
}

export async function deletePlatformLink(id: string) {
    await requireAdmin()
    const admin = getServiceClient()
    const { error } = await admin.from('referral_links').delete().eq('id', id).eq('type', 'platform')
    if (error) { console.error('deletePlatformLink error:', error); return { error: 'Failed to delete link' } }
    return { success: true }
}
