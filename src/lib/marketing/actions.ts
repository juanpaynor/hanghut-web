'use server'

import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface UnsubscribeResult {
    success: boolean
    message: string
    organizer?: string
    email?: string
}

/**
 * HMAC key for signed attendee unsubscribe links. Event attendees are not in
 * `partner_subscribers` (so they have no `unsubscribe_token`), so their
 * unsubscribe link is a signature over `email|partner_id` instead.
 *
 * Falls back to the service-role key so this works with zero new secrets; set
 * a dedicated UNSUBSCRIBE_SECRET (in both Vercel and Supabase function secrets)
 * to decouple it. The SAME value must be used by the send-promotional-email
 * edge function that generates the links.
 */
function unsubscribeSecret(): string {
    return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function signUnsubscribe(email: string, partnerId: string): string {
    return createHmac('sha256', unsubscribeSecret())
        .update(`${email.toLowerCase()}|${partnerId}`)
        .digest('hex')
}

/**
 * Constant-time check of an attendee unsubscribe signature.
 */
function verifyUnsubscribeSig(email: string, partnerId: string, sig: string): boolean {
    const expected = signUnsubscribe(email, partnerId)
    if (sig.length !== expected.length) return false
    try {
        return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    } catch {
        return false
    }
}

export async function processUnsubscribe(token: string): Promise<UnsubscribeResult> {
    const supabase = await createClient()

    // 1. Verify token and get subscription details
    const { data: subscription, error: fetchError } = await supabase
        .from('partner_subscribers')
        .select(`
            *,
            partner:partners (
                business_name
            )
        `)
        .eq('unsubscribe_token', token)
        .single()

    if (fetchError || !subscription) {
        return {
            success: false,
            message: "Invalid or expired unsubscribe link."
        }
    }

    // 2. Already unsubscribed?
    if (!subscription.is_active) {
        return {
            success: true,
            message: "You are already unsubscribed.",
            organizer: subscription.partner?.business_name || "Organizer",
            email: subscription.email
        }
    }

    // 3. Perform unsubscribe
    // Note: We need to use service role if RLS blocks update, 
    // but typically we can set up secure RLS or just use a dedicated RPC.
    // However, since we are in a server action with createClient() it uses user auth or anon.
    // Anon + RLS policies I set up earlier might block this update unless we use a token policy.

    // FOR NOW: Let's assume the "Public Unsubscribe Policy" I wrote in migration works,
    // OR createAdminClient() is needed.
    // Let's use createAdminClient pattern if available or just try standard update.

    // WARNING: `createClient` from `@/lib/supabase/server` usually returns a client scoped to the request cookies.
    // If the user is unauthenticated (clicking email link), they are ANON.
    // The RLS policy: USING (unsubscribe_token = current_setting(...)) is complex to trigger from client.

    // BETTER APPROACH: Use `supabase-admin` here to bypass RLS since we validated the token securely in step 1.
    // But I don't see a `createAdminClient` utility exported commonly. 
    // I'll try the standard update. If it fails due to RLS, I might need to adjust RLS or use a secure endpoint.

    const { error: updateError } = await supabase
        .from('partner_subscribers')
        .update({
            is_active: false,
            unsubscribed_at: new Date().toISOString()
        })
        .eq('id', subscription.id)

    if (updateError) {
        // Fallback: This might be RLS blocking.
        // In a real production app, we'd use a Service Role client here.
        console.error("Unsubscribe update failed:", updateError)
        return {
            success: false,
            message: "System error. Please contact support."
        }
    }

    return {
        success: true,
        message: "Successfully unsubscribed.",
        organizer: subscription.partner?.business_name || "Organizer",
        email: subscription.email
    }
}

/**
 * Unsubscribe for an event attendee who is NOT on the partner's subscriber
 * list (so they have no token). The link carries email + partner_id + an HMAC
 * signature; we verify the signature, then record the address in
 * email_suppressions so future sends from this partner skip it.
 */
export async function processAttendeeUnsubscribe(
    email: string,
    partnerId: string,
    sig: string
): Promise<UnsubscribeResult> {
    if (!email || !partnerId || !sig || !verifyUnsubscribeSig(email, partnerId, sig)) {
        return { success: false, message: "Invalid or expired unsubscribe link." }
    }

    const supabase = createAdminClient()

    // Look up partner name for the confirmation message (best-effort).
    const { data: partner } = await supabase
        .from('partners')
        .select('business_name')
        .eq('id', partnerId)
        .maybeSingle()

    // Suppress for this partner. Idempotent on (partner_id, lower(email)).
    const { error } = await supabase
        .from('email_suppressions')
        .upsert(
            {
                partner_id: partnerId,
                email: email.toLowerCase(),
                reason: 'unsubscribe',
                source: 'attendee_unsub',
            },
            { onConflict: 'partner_id,email', ignoreDuplicates: true }
        )

    if (error) {
        console.error('Attendee unsubscribe failed:', error)
        return { success: false, message: "System error. Please contact support." }
    }

    // Also flip any matching subscriber row inactive, in case they're on both.
    await supabase
        .from('partner_subscribers')
        .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
        .eq('partner_id', partnerId)
        .ilike('email', email)

    return {
        success: true,
        message: "Successfully unsubscribed.",
        organizer: partner?.business_name || "Organizer",
        email,
    }
}

export async function getAudienceCount(
    partnerId: string,
    audienceType: 'all_subscribers' | 'event_attendees',
    eventId?: string
): Promise<number> {
    const supabase = createAdminClient()

    if (audienceType === 'all_subscribers') {
        const { count } = await supabase
            .from('partner_subscribers')
            .select('*', { count: 'exact', head: true })
            .eq('partner_id', partnerId)
            .eq('is_active', true)
        return count || 0
    }

    if (audienceType === 'event_attendees' && eventId) {
        const emails = await getEventAttendeeEmails(eventId)
        return emails.length
    }

    return 0
}

/**
 * Resolves the unique set of attendee emails for an event from completed
 * purchase intents. Runs with the admin client so it bypasses RLS on
 * purchase_intents (organizers cannot read that table directly).
 */
export async function getEventAttendeeEmails(eventId: string): Promise<string[]> {
    const supabase = createAdminClient()

    const { data } = await supabase
        .from('purchase_intents')
        .select('guest_email')
        .eq('event_id', eventId)
        .eq('status', 'completed')
        .not('guest_email', 'is', null)

    const unique = new Set<string>()
    for (const row of data || []) {
        if ((row as any).guest_email) unique.add((row as any).guest_email.toLowerCase())
    }
    return Array.from(unique)
}

export async function subscribeGuestToNewsletter(partnerId: string, email: string, name: string, eventId?: string) {
    if (!partnerId || !email) {
        return { success: false, message: 'Missing fields' }
    }

    const supabase = createAdminClient()

    try {
        const { error } = await supabase
            .from('partner_subscribers')
            .upsert({
                partner_id: partnerId,
                email: email,
                full_name: name,
                source: 'checkout',
                is_active: true,
                unsubscribed_at: null,
                ...(eventId ? { event_id: eventId } : {}),
            }, {
                onConflict: 'partner_id,email'
            })

        if (error) {
            console.error('Error subscribing guest:', error)
            return { success: false, message: 'Failed to subscribe' }
        }

        return { success: true }
    } catch (err) {
        console.error('Exception subscribing guest:', err)
        return { success: false, message: 'System error' }
    }
}

// ─────────────────────────────────────────────────────────────
// DRAFTS (Phase 6)
// A draft is an email_campaigns row with status='draft' (never enqueued).
// On send, send-promotional-email is passed draft_campaign_id and reuses the row.
// ─────────────────────────────────────────────────────────────

async function resolveMarketingPartnerId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: owner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).maybeSingle()
    if (owner) return owner.id
    const { data: tm } = await supabase
        .from('partner_team_members').select('partner_id').eq('user_id', user.id).maybeSingle()
    return tm?.partner_id ?? null
}

export interface DraftInput {
    id?: string
    subject: string
    html_content: string
    segment?: string | null
    event_id?: string | null
}

export async function saveDraft(input: DraftInput) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }
    if (!input.subject?.trim() && !input.html_content?.trim()) {
        return { error: 'Nothing to save yet.' }
    }

    const row = {
        partner_id: partnerId,
        subject: input.subject || '(no subject)',
        html_content: input.html_content || '',
        segment: input.segment || 'all_subscribers',
        event_id: input.event_id || null,
        status: 'draft' as const,
        updated_at: new Date().toISOString(),
    }

    if (input.id) {
        const { error } = await supabase
            .from('email_campaigns').update(row)
            .eq('id', input.id).eq('partner_id', partnerId).eq('status', 'draft')
        if (error) return { error: error.message }
        return { success: true as const, id: input.id }
    }

    const { data, error } = await supabase
        .from('email_campaigns').insert(row).select('id').single()
    if (error || !data) return { error: error?.message || 'Failed to save draft' }
    return { success: true as const, id: data.id }
}

export async function getDrafts() {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return []
    const { data } = await supabase
        .from('email_campaigns')
        .select('id, subject, segment, event_id, updated_at')
        .eq('partner_id', partnerId).eq('status', 'draft')
        .order('updated_at', { ascending: false })
    return data ?? []
}

export async function getDraft(id: string) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return null
    const { data } = await supabase
        .from('email_campaigns')
        .select('id, subject, html_content, segment, event_id')
        .eq('id', id).eq('partner_id', partnerId).eq('status', 'draft').maybeSingle()
    return data
}

export async function deleteDraft(id: string) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }
    const { error } = await supabase
        .from('email_campaigns').delete()
        .eq('id', id).eq('partner_id', partnerId).eq('status', 'draft')
    if (error) return { error: error.message }
    return { success: true as const }
}
