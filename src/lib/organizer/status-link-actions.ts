'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface StatusLink {
    id: string
    token: string
    label: string | null
    show_revenue: boolean
    is_active: boolean
    expires_at: string | null
    created_at: string
    revoked_at: string | null
    view_count: number
    last_viewed_at: string | null
}

const COLUMNS =
    'id, token, label, show_revenue, is_active, expires_at, created_at, revoked_at, view_count, last_viewed_at'

/**
 * Ownership is enforced by RLS on event_status_links (owner, or an active team
 * member with role owner/manager), exactly as referral links do it. Scanners and
 * finance deliberately cannot mint these: a status link is a standing grant to
 * anyone it is forwarded to, so creating one is a sharing decision, not a
 * door-shift one.
 */
export async function getStatusLinks(eventId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
        .from('event_status_links')
        .select(COLUMNS)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('getStatusLinks error:', error)
        return { error: 'Failed to load status links' }
    }
    return { links: (data ?? []) as StatusLink[] }
}

export async function createStatusLink(opts: {
    eventId: string
    label?: string
    showRevenue?: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // 32 bytes, base64url. The token IS the credential — there is no second
    // factor behind it — so it is generated server-side with a CSPRNG and never
    // derived from the label. A readable slug here would be a guessable one.
    const token = randomBytes(32).toString('base64url')

    const { data, error } = await supabase
        .from('event_status_links')
        .insert({
            event_id: opts.eventId,
            token,
            label: opts.label?.trim()?.slice(0, 80) || null,
            show_revenue: opts.showRevenue === true,
            created_by: user.id,
        })
        .select(COLUMNS)
        .single()

    if (error) {
        console.error('createStatusLink error:', error)
        return { error: 'Could not create the link.' }
    }

    revalidatePath(`/organizer/events/${opts.eventId}`)
    return { link: data as StatusLink }
}

/**
 * Revoke is a one-way door on purpose. Re-enabling a link someone has already
 * been given back their access without them doing anything, which is exactly the
 * situation revoking exists to end — so there is no un-revoke, only a new link.
 */
export async function revokeStatusLink(id: string, eventId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('event_status_links')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('id', id)

    if (error) {
        console.error('revokeStatusLink error:', error)
        return { error: 'Could not revoke the link.' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

/** Toggle whether a live link also shows gross sales. */
export async function setStatusLinkRevenue(id: string, eventId: string, showRevenue: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('event_status_links')
        .update({ show_revenue: showRevenue })
        .eq('id', id)

    if (error) {
        console.error('setStatusLinkRevenue error:', error)
        return { error: 'Could not update the link.' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
