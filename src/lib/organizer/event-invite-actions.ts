'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Edge functions must be called via the raw Supabase project URL, not the custom domain
const SUPABASE_FUNCTIONS_URL = 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface EventInvite {
    id: string
    event_id: string
    email: string
    name: string | null
    token: string
    status: 'invited' | 'accepted' | 'declined'
    source: 'manual' | 'csv' | 'past_attendee' | 'subscriber'
    created_at: string
    responded_at: string | null
}

export interface InviteEntry {
    email: string
    name?: string | null
}

/**
 * Verify the caller owns this event. Returns the event row (with organizer name)
 * plus the authed user, or null if not authorized.
 */
async function assertEventOwner(eventId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: event } = await supabase
        .from('events')
        .select('id, title, start_datetime, organizer_id, partners!events_organizer_id_fkey(user_id, business_name)')
        .eq('id', eventId)
        .single()

    const partner = event?.partners as any
    if (!event || partner?.user_id !== user.id) return null

    return { user, event, organizerName: partner?.business_name || 'An organizer' }
}

/** Fire invite emails for a set of invites (best-effort, non-blocking failures). */
async function dispatchInviteEmails(
    invites: { email: string; name: string | null; token: string }[],
    event: { id: string; title: string; start_datetime: string | null },
    organizerName: string
) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return

    await Promise.allSettled(
        invites.map((inv) =>
            fetch(`${SUPABASE_FUNCTIONS_URL}/send-event-invite`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to_email: inv.email,
                    to_name: inv.name,
                    event_id: event.id,
                    event_title: event.title,
                    event_date: event.start_datetime,
                    organizer_name: organizerName,
                    invite_token: inv.token,
                }),
            }).catch((e) => console.error('Failed to send event invite email:', e))
        )
    )
}

/** List all invites for an event (organizer only). */
export async function listEventInvites(eventId: string): Promise<EventInvite[]> {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return []

    const admin = createAdminClient()
    const { data } = await admin
        .from('event_invites')
        .select('id, event_id, email, name, token, status, source, created_at, responded_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    return (data as EventInvite[]) ?? []
}

/**
 * Bulk-add invitees. Dedupes against existing rows (unique event_id+email),
 * inserts the new ones, and fires invite emails only for the newly created rows.
 */
export async function addEventInvites(
    eventId: string,
    entries: InviteEntry[],
    source: EventInvite['source'] = 'manual'
): Promise<{ added: number; skipped: number; error?: string }> {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return { added: 0, skipped: 0, error: 'Not authorized' }

    const admin = createAdminClient()

    // Normalize + dedupe within the batch
    const seen = new Set<string>()
    const clean: InviteEntry[] = []
    for (const e of entries) {
        const email = (e.email || '').trim().toLowerCase()
        if (!EMAIL_RE.test(email) || seen.has(email)) continue
        seen.add(email)
        clean.push({ email, name: e.name?.trim() || null })
    }
    if (clean.length === 0) return { added: 0, skipped: entries.length, error: 'No valid new emails' }

    // Which emails already exist for this event?
    const { data: existing } = await admin
        .from('event_invites')
        .select('email')
        .eq('event_id', eventId)
        .in('email', clean.map((c) => c.email))
    const existingSet = new Set((existing ?? []).map((r: any) => r.email))

    const toInsert = clean.filter((c) => !existingSet.has(c.email))
    if (toInsert.length === 0) return { added: 0, skipped: clean.length }

    const { data: inserted, error } = await admin
        .from('event_invites')
        .insert(toInsert.map((c) => ({
            event_id: eventId,
            email: c.email,
            name: c.name,
            source,
            invited_by: ctx.user.id,
        })))
        .select('email, name, token')

    if (error) return { added: 0, skipped: clean.length, error: error.message }

    await dispatchInviteEmails(
        (inserted ?? []).map((r: any) => ({ email: r.email, name: r.name, token: r.token })),
        ctx.event as any,
        ctx.organizerName
    )

    revalidatePath(`/organizer/events/${eventId}`)
    return { added: inserted?.length ?? 0, skipped: clean.length - (inserted?.length ?? 0) }
}

/** Import distinct attendee emails from this organizer's past events. */
export async function importInviteesFromPastAttendees(eventId: string) {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return { added: 0, skipped: 0, error: 'Not authorized' }

    const admin = createAdminClient()

    // Tickets for events owned by this organizer → buyer emails (guest or account)
    const { data: tickets } = await admin
        .from('tickets')
        .select('guest_email, guest_name, user_id, events!inner(organizer_id)')
        .eq('events.organizer_id', ctx.event.organizer_id)
        .neq('status', 'available')

    const entries: InviteEntry[] = []
    const userIds = new Set<string>()
    for (const t of (tickets ?? []) as any[]) {
        if (t.guest_email) entries.push({ email: t.guest_email, name: t.guest_name })
        else if (t.user_id) userIds.add(t.user_id)
    }

    if (userIds.size > 0) {
        const { data: users } = await admin
            .from('users')
            .select('email, display_name')
            .in('id', [...userIds])
        for (const u of (users ?? []) as any[]) {
            if (u.email) entries.push({ email: u.email, name: u.display_name })
        }
    }

    return addEventInvites(eventId, entries, 'past_attendee')
}

/** Import active subscribers of this organizer. */
export async function importInviteesFromSubscribers(eventId: string) {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return { added: 0, skipped: 0, error: 'Not authorized' }

    const admin = createAdminClient()

    const { data: subs } = await admin
        .from('fan_subscriptions')
        .select('fan_id')
        .eq('partner_id', ctx.event.organizer_id)
        .eq('status', 'active')

    const fanIds = [...new Set((subs ?? []).map((s: any) => s.fan_id).filter(Boolean))]
    if (fanIds.length === 0) return { added: 0, skipped: 0 }

    const { data: users } = await admin
        .from('users')
        .select('email, display_name')
        .in('id', fanIds)

    const entries: InviteEntry[] = (users ?? [])
        .filter((u: any) => u.email)
        .map((u: any) => ({ email: u.email, name: u.display_name }))

    return addEventInvites(eventId, entries, 'subscriber')
}

/** Revoke (delete) an invite. */
export async function revokeEventInvite(eventId: string, inviteId: string) {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return { error: 'Not authorized' }

    const admin = createAdminClient()
    const { error } = await admin
        .from('event_invites')
        .delete()
        .eq('id', inviteId)
        .eq('event_id', eventId)

    if (error) return { error: error.message }
    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

/** Resend the invite email for a single invitee. */
export async function resendEventInvite(eventId: string, inviteId: string) {
    const ctx = await assertEventOwner(eventId)
    if (!ctx) return { error: 'Not authorized' }

    const admin = createAdminClient()
    const { data: invite } = await admin
        .from('event_invites')
        .select('email, name, token')
        .eq('id', inviteId)
        .eq('event_id', eventId)
        .single()

    if (!invite) return { error: 'Invite not found' }

    await dispatchInviteEmails([invite as any], ctx.event as any, ctx.organizerName)
    return { success: true }
}

// ─── Public (attendee-facing) ───────────────────────────────────────────────

/** Look up an invite by token (used by the event page accept flow). */
export async function getEventInviteByToken(token: string) {
    const admin = createAdminClient()
    const { data } = await admin
        .from('event_invites')
        .select('id, event_id, email, name, status')
        .eq('token', token)
        .single()
    return data as Pick<EventInvite, 'id' | 'event_id' | 'email' | 'name' | 'status'> | null
}

/** Accept or decline an invite via its token. */
export async function respondToEventInvite(token: string, response: 'accepted' | 'declined') {
    const admin = createAdminClient()
    const { data: invite } = await admin
        .from('event_invites')
        .select('id, event_id')
        .eq('token', token)
        .single()

    if (!invite) return { error: 'Invite not found' }

    const { error } = await admin
        .from('event_invites')
        .update({ status: response, responded_at: new Date().toISOString() })
        .eq('id', invite.id)

    if (error) return { error: error.message }
    revalidatePath(`/events/${invite.event_id}`)
    return { success: true }
}
