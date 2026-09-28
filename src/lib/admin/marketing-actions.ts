'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Platform marketing — HangHut emailing its OWN audience.
 *
 * Until now the only admin email surface was the app-waitlist composer, so the
 * platform could reach people waiting for the app and nobody else, while every
 * organizer had a full marketing suite.
 *
 * WHOSE ADDRESSES THESE ARE. These audiences are built from people who have a
 * direct relationship with HangHut: they bought a ticket through us (and
 * accepted our Terms at checkout) or hold a HangHut account. They are not
 * organizers' subscriber lists. Someone who only ever subscribed to a
 * partner's newsletter opted in to hear from THAT partner — on prod that is 24
 * people out of 1,823, so borrowing those lists would add almost nobody while
 * putting the shared sending domain, and therefore everyone's ticket email, at
 * risk over addresses that never asked for us.
 *
 * HangHut sends under its own partner row, which gives it its own suppression
 * list and its own unsubscribe link. That is the point: unsubscribing from
 * HangHut marketing must not silently unsubscribe someone from the comedy club
 * they actually follow.
 */

/** The partner row HangHut sends platform mail as. Changing this changes the
 *  sender identity, the unsubscribe scope and the suppression list, so it is
 *  deliberately one obvious constant rather than scattered logic. */
const PLATFORM_PARTNER_SLUG = 'hanghut'

export type PlatformAudience =
    | 'all_buyers'
    | 'account_holders'
    | 'everyone'
    | 'event_buyers'
    | 'lapsed_buyers'
    | 'app_waitlist'

export interface AudienceOption {
    value: PlatformAudience
    label: string
    description: string
    /** Needs an event picked before it can resolve. */
    needsEvent?: boolean
    /** Needs a day count. */
    needsDays?: boolean
}

export const PLATFORM_AUDIENCES: AudienceOption[] = [
    { value: 'all_buyers', label: 'Ticket buyers', description: 'Everyone who has completed a purchase on HangHut.' },
    { value: 'account_holders', label: 'Account holders', description: 'Everyone with a HangHut account, whether or not they have bought.' },
    { value: 'everyone', label: 'Everyone we know', description: 'Buyers and account holders combined, de-duplicated.' },
    { value: 'event_buyers', label: 'Buyers of one event', description: 'People who bought a ticket to a specific event.', needsEvent: true },
    { value: 'lapsed_buyers', label: 'Lapsed buyers', description: 'Bought before, but nothing recently.', needsDays: true },
    { value: 'app_waitlist', label: 'App waitlist', description: 'People waiting for the mobile app.' },
]

export interface PlatformRecipient {
    email: string
    first_name: string | null
}

function serviceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createServiceClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
}

/**
 * Deliberately narrower than the usual `is_admin` check used elsewhere in
 * /admin. `is_admin` is true for support staff too, and mailing the entire
 * customer base is not a support action — the nav already limits this page to
 * super_admin and admin, and a hidden link is not authorisation.
 */
const PLATFORM_EMAIL_ROLES = ['super_admin', 'admin']

async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' as const }
    const { data: adminUser } = await supabase
        .from('users').select('is_admin, admin_role').eq('id', user.id).single()
    if (!adminUser?.is_admin || !PLATFORM_EMAIL_ROLES.includes(adminUser.admin_role ?? '')) {
        return { error: 'Forbidden' as const }
    }
    // The caller's own client goes back with them. The audience RPCs must run
    // AS the admin, not as the service role: they gate on
    // can_send_platform_email(), which reads auth.uid(), and the service role
    // has none — it would be refused, and papering over that by dropping the
    // SQL gate would leave the database with no opinion about who may mail
    // every customer.
    return { user, supabase }
}

/** The partner row platform mail is sent as, so the UI can name it honestly. */
export async function getPlatformSender(): Promise<{ id?: string; name?: string; error?: string }> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }

    const admin = serviceClient()
    if (!admin) return { error: 'Server configuration error' }

    const { data } = await admin
        .from('partners')
        .select('id, business_name')
        .eq('slug', PLATFORM_PARTNER_SLUG)
        .maybeSingle()

    if (!data) return { error: `No partner with slug "${PLATFORM_PARTNER_SLUG}" — platform sending identity is not configured.` }
    return { id: data.id as string, name: data.business_name as string }
}

/**
 * Resolve one audience to named recipients.
 *
 * Names are carried so {{first_name}} works, exactly as the organizer path
 * does. Suppression is NOT applied here — the send pipeline already filters
 * against email_suppressions, and doing it twice would report a count the
 * sender then silently disagrees with.
 */
export async function getPlatformRecipients(
    audience: PlatformAudience,
    opts?: { eventId?: string; days?: number },
): Promise<{ data?: PlatformRecipient[]; error?: string }> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }

    const { data, error } = await gate.supabase.rpc('get_platform_audience', {
        p_audience: audience,
        p_event_id: opts?.eventId ?? null,
        p_days: opts?.days ?? 180,
    })

    if (error) {
        console.error('get_platform_audience failed', error)
        return { error: 'Could not resolve that audience.' }
    }

    return { data: (data || []) as PlatformRecipient[] }
}

/** Counts for every audience at once, for the picker. */
export async function getPlatformAudienceCounts(): Promise<{
    data?: Record<string, number>; error?: string
}> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }

    const { data, error } = await gate.supabase.rpc('get_platform_audience_counts')
    if (error) {
        console.error('get_platform_audience_counts failed', error)
        return { error: 'Could not load audience sizes.' }
    }
    return { data: (data || {}) as Record<string, number> }
}

/** Upcoming events, for the "buyers of one event" audience. */
export async function getPlatformEventOptions(q: string): Promise<{ id: string; title: string }[]> {
    const gate = await requireAdmin()
    if ('error' in gate) return []

    const admin = serviceClient()
    if (!admin) return []

    let query = admin
        .from('events')
        .select('id, title, start_datetime')
        .order('start_datetime', { ascending: false })
        .limit(20)

    if (q.trim()) query = query.ilike('title', `%${q.trim()}%`)

    const { data } = await query
    return (data || []).map(e => ({ id: e.id as string, title: e.title as string }))
}
