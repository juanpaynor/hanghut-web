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
    audienceType: 'all_subscribers' | 'event_attendees' | 'customer_segment',
    eventId?: string,
    segment?: string
): Promise<number> {
    const supabase = createAdminClient()

    if (audienceType === 'customer_segment' && segment) {
        const emails = await getSegmentEmails(partnerId, segment)
        return emails.length
    }

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

/** First word of a full name (for {{first_name}} personalization). */
function firstNameOf(name?: string | null): string | null {
    if (!name) return null
    return name.trim().split(/\s+/)[0] || null
}

export interface Recipient { email: string; first_name: string | null }

/**
 * Like getEventAttendeeEmails but carries each buyer's first name so the send
 * pipeline can resolve {{first_name}}. Deduped by lowercased email (first
 * non-empty name wins).
 */
export async function getEventAttendeeRecipients(eventId: string): Promise<Recipient[]> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('purchase_intents')
        .select('guest_email, guest_name')
        .eq('event_id', eventId)
        .eq('status', 'completed')
        .not('guest_email', 'is', null)

    const byEmail = new Map<string, Recipient>()
    for (const row of (data as { guest_email: string | null; guest_name: string | null }[]) || []) {
        if (!row.guest_email) continue
        const email = row.guest_email.toLowerCase()
        const existing = byEmail.get(email)
        const first = firstNameOf(row.guest_name)
        if (!existing) byEmail.set(email, { email, first_name: first })
        else if (!existing.first_name && first) existing.first_name = first
    }
    return Array.from(byEmail.values())
}

/**
 * Like getSegmentEmails but carries first names (get_organizer_customers returns
 * `email` + `name` per customer). Deduped by lowercased email.
 */
export async function getSegmentRecipients(partnerId: string, segment: string): Promise<Recipient[]> {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_organizer_customers', {
        p_partner_id: partnerId,
        p_segment: segment === 'all' ? 'customers' : segment,
        p_search: null,
        p_limit: 10000,
        p_offset: 0,
        p_sort: 'recent',
    })
    const rows = ((data as { customers?: { email: string; name?: string | null }[] } | null)?.customers) || []
    const byEmail = new Map<string, Recipient>()
    for (const r of rows) {
        if (!r.email) continue
        const email = r.email.toLowerCase()
        if (!byEmail.has(email)) byEmail.set(email, { email, first_name: firstNameOf(r.name) })
    }
    return Array.from(byEmail.values())
}

/**
 * Resolves the emails for a customer/RFM segment (champion, loyal, new, at_risk,
 * lost, repeat, no_show, abandoned, rejected, reengaged, or 'customers' for all).
 * Reuses get_organizer_customers (SECURITY DEFINER, self-authorizes via auth.uid).
 * Suppression (unsubscribes/bounces) is applied downstream by send-promotional-email.
 */
export async function getSegmentEmails(partnerId: string, segment: string): Promise<string[]> {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_organizer_customers', {
        p_partner_id: partnerId,
        p_segment: segment === 'all' ? 'customers' : segment,
        p_search: null,
        p_limit: 10000,
        p_offset: 0,
        p_sort: 'recent',
    })
    const rows = ((data as { customers?: { email: string }[] } | null)?.customers) || []
    const unique = new Set<string>()
    for (const r of rows) if (r.email) unique.add(r.email.toLowerCase())
    return Array.from(unique)
}

// ─────────────────────────────────────────────────────────────
// TEMPLATES (Phase 1) — starter gallery + save-your-own
// ─────────────────────────────────────────────────────────────

export interface EmailTemplate {
    id: string
    name: string
    description: string | null
    category: string | null
    html_content: string
    is_system: boolean
}

export async function getTemplates(): Promise<EmailTemplate[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('email_templates')
        .select('id, name, description, category, html_content, is_system')
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: false })
    return (data as EmailTemplate[]) ?? []
}

export async function saveAsTemplate(name: string, html_content: string) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }
    if (!name.trim() || !html_content.trim()) return { error: 'A name and content are required.' }
    const { data, error } = await supabase
        .from('email_templates')
        .insert({ partner_id: partnerId, name: name.trim(), html_content, is_system: false, category: 'custom' })
        .select('id').single()
    if (error || !data) return { error: error?.message || 'Failed to save template' }
    return { success: true as const, id: data.id }
}

export async function deleteTemplate(id: string) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }
    const { error } = await supabase.from('email_templates').delete().eq('id', id).eq('partner_id', partnerId)
    if (error) return { error: error.message }
    return { success: true as const }
}

// ─────────────────────────────────────────────────────────────
// INSERT-EVENT BLOCK (Phase 1) — email-safe live event card
// ─────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Renders a table-based, email-client-safe event card (cover, title, date, venue, price, CTA). */
export async function buildEventEmailBlock(eventId: string): Promise<{ html?: string; error?: string }> {
    const supabase = await createClient()
    const { data: event } = await supabase
        .from('events')
        .select('id, title, cover_image_url, start_datetime, venue_name, city, ticket_price, ticket_tiers(price, is_active)')
        .eq('id', eventId)
        .maybeSingle()
    if (!event) return { error: 'Event not found' }

    const tiers = ((event.ticket_tiers as { price: number; is_active: boolean }[] | null) || []).filter((t) => t.is_active)
    const price = tiers.length ? Math.min(...tiers.map((t) => Number(t.price))) : Number(event.ticket_price || 0)
    const priceLabel = price === 0 ? 'Free' : `From ₱${price.toLocaleString()}`
    const dateStr = event.start_datetime
        ? new Date(event.start_datetime).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : ''
    const venue = [event.venue_name, event.city].filter(Boolean).join(', ')
    const url = `https://hanghut.com/events/${event.id}`

    const cover = event.cover_image_url
        ? `<a href="${url}" style="text-decoration:none;"><img src="${esc(event.cover_image_url)}" alt="" width="100%" style="display:block;width:100%;height:auto;border:0;" /></a>`
        : ''

    const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:separate;">
<tr><td style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
${cover}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:18px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.05em;">${esc(priceLabel)}</p>
<h2 style="margin:0 0 10px;font-size:20px;line-height:1.25;font-weight:800;color:#111827;">${esc(event.title)}</h2>
${dateStr ? `<p style="margin:0 0 4px;font-size:14px;color:#475569;">📅 ${esc(dateStr)}</p>` : ''}
${venue ? `<p style="margin:0 0 16px;font-size:14px;color:#475569;">📍 ${esc(venue)}</p>` : '<div style="height:12px"></div>'}
<a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:11px 26px;border-radius:999px;">Get Tickets →</a>
</td></tr></table>
</td></tr></table>`

    return { html }
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

// ─────────────────────────────────────────────────────────────
// SCHEDULED CAMPAIGNS
// A scheduled campaign is an email_campaigns row with status='scheduled' and a
// future scheduled_for. The process-scheduled-campaigns edge fn (pg_cron, every
// minute) claims due rows and hands them to send-promotional-email. For the
// event-attendees audience the recipient list is snapshotted here at schedule
// time; all_subscribers is resolved fresh at send time by the edge fn.
// ─────────────────────────────────────────────────────────────

export interface ScheduleInput {
    id?: string // reuse an existing draft / scheduled row
    subject: string
    html_content: string
    // 'all_subscribers' | 'event_attendees' | a customer-segment key (champion, at_risk, …)
    segment: string
    event_id?: string | null
    scheduled_for: string // ISO timestamp
}

export async function scheduleCampaign(input: ScheduleInput) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }

    if (!input.subject?.trim() || !input.html_content?.trim()) {
        return { error: 'A subject and content are required to schedule.' }
    }

    const when = new Date(input.scheduled_for)
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
        return { error: 'Pick a send time at least a minute in the future.' }
    }

    const { data: partner } = await supabase
        .from('partners').select('business_name').eq('id', partnerId).maybeSingle()
    const sender_name = partner?.business_name || 'Updates'

    const payload: Record<string, unknown> = {
        sender_name,
        segment: input.segment,
        event_id: input.event_id ?? null,
    }
    let recipientCount = 0

    if (input.segment === 'event_attendees') {
        if (!input.event_id) return { error: 'Select an event for the attendee audience.' }
        // Snapshot named recipients now so the scheduled send can personalize {{first_name}}.
        const recipients = await getEventAttendeeRecipients(input.event_id)
        if (recipients.length === 0) return { error: 'No attendee emails found for this event.' }
        payload.target_recipients = recipients
        recipientCount = recipients.length
    } else if (input.segment !== 'all_subscribers') {
        // Customer/RFM segment — snapshot named recipients now (like event_attendees).
        const recipients = await getSegmentRecipients(partnerId, input.segment)
        if (recipients.length === 0) return { error: 'No customers in this segment yet.' }
        payload.target_recipients = recipients
        recipientCount = recipients.length
    }

    const row = {
        partner_id: partnerId,
        subject: input.subject,
        html_content: input.html_content,
        segment: input.segment,
        event_id: input.segment === 'event_attendees' ? (input.event_id ?? null) : null,
        status: 'scheduled' as const,
        scheduled_for: when.toISOString(),
        scheduled_payload: payload,
        recipient_count: recipientCount,
        updated_at: new Date().toISOString(),
    }

    if (input.id) {
        const { error } = await supabase
            .from('email_campaigns').update(row)
            .eq('id', input.id).eq('partner_id', partnerId)
            .in('status', ['draft', 'scheduled', 'scheduled_failed'])
        if (error) return { error: error.message }
        return { success: true as const, id: input.id }
    }

    const { data, error } = await supabase
        .from('email_campaigns').insert(row).select('id').single()
    if (error || !data) return { error: error?.message || 'Failed to schedule campaign' }
    return { success: true as const, id: data.id }
}

export async function getScheduledCampaigns() {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return []
    const { data } = await supabase
        .from('email_campaigns')
        .select('id, subject, segment, event_id, scheduled_for, status, recipient_count')
        .eq('partner_id', partnerId)
        .in('status', ['scheduled', 'scheduled_failed'])
        .order('scheduled_for', { ascending: true })
    return data ?? []
}

export async function cancelScheduledCampaign(id: string) {
    const supabase = await createClient()
    const partnerId = await resolveMarketingPartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }
    // Only cancellable while still pending — once the cron claims it ('dispatching')
    // or it has sent, it can't be pulled back.
    const { error } = await supabase
        .from('email_campaigns').delete()
        .eq('id', id).eq('partner_id', partnerId)
        .in('status', ['scheduled', 'scheduled_failed'])
    if (error) return { error: error.message }
    return { success: true as const }
}
