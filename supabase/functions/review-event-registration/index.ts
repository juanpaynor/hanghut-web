import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Single atomic approve/reject endpoint for the app's approvals inbox.
// Ports web's approveRegistration/rejectRegistration server actions so the
// app gets exact parity (status + reviewed_by/at, free-ticket issuance,
// push, templated emails) from ONE call. Contract:
//   POST { registration_id: uuid, approve: boolean, rejection_reason?: string }
// Auth: caller's partner JWT; must be the organizer (owner or team owner/manager)
// of the registration's event. Idempotent: only acts on a 'pending' row.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
const ROOT_DOMAIN = Deno.env.get('ROOT_DOMAIN') || 'hanghut.com'

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

function resolveTags(str: string, vars: Record<string, string>): string {
    return str
        .replace(/{{name}}/g, vars.name || '')
        .replace(/{{event_title}}/g, vars.event_title || '')
        .replace(/{{event_date}}/g, vars.event_date || '')
        .replace(/{{event_venue}}/g, vars.event_venue || '')
        .replace(/{{organizer_name}}/g, vars.organizer_name || '')
        .replace(/{{reason}}/g, vars.reason || '')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { registration_id, approve, rejection_reason } = await req.json()
        if (!registration_id || typeof approve !== 'boolean') {
            return json({ error: 'registration_id and approve (boolean) are required' }, 400)
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

        // 1. Auth — resolve caller
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
        if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

        // 2. Load registration + event (service role bypasses RLS)
        const { data: reg, error: regErr } = await supabase
            .from('event_registrations')
            .select('id, status, event_id, user_id, guest_email, guest_name, tier_id')
            .eq('id', registration_id)
            .single()
        if (regErr || !reg) return json({ error: 'Registration not found' }, 404)

        // 3. Ownership — caller must be organizer of this event (owner or team owner/manager)
        const { data: event, error: evErr } = await supabase
            .from('events')
            .select('id, title, start_datetime, venue_name, ticket_price, organizer_id, approval_email_subject, approval_email_body, rejection_email_subject, rejection_email_body, partners!events_organizer_id_fkey(business_name, user_id)')
            .eq('id', reg.event_id)
            .single()
        if (evErr || !event) return json({ error: 'Event not found' }, 404)

        const partnerUserId = (event.partners as any)?.user_id
        let isOwner = partnerUserId === user.id
        if (!isOwner) {
            const { data: tm } = await supabase
                .from('partner_team_members')
                .select('role')
                .eq('partner_id', event.organizer_id)
                .eq('user_id', user.id)
                .maybeSingle()
            isOwner = !!tm && (tm.role === 'owner' || tm.role === 'manager')
        }
        if (!isOwner) return json({ error: 'Unauthorized: not the organizer of this event' }, 403)

        // 4. Idempotency — only act on pending rows
        if (reg.status !== 'pending') {
            return json({ error: `Registration is not pending (status: ${reg.status})`, status: reg.status }, 409)
        }

        const businessName = (event.partners as any)?.business_name || 'HangHut'
        const eventDate = event.start_datetime
            ? new Date(event.start_datetime).toLocaleString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
            : ''

        // Resolve recipient email (guest or account)
        let recipientEmail = reg.guest_email as string | null
        if (!recipientEmail && reg.user_id) {
            const { data: u } = await supabase.from('users').select('email').eq('id', reg.user_id).single()
            recipientEmail = u?.email ?? null
        }
        const recipientName = (reg.guest_name as string) || 'there'

        if (approve) {
            // 4a. Update status
            const { error: upErr } = await supabase
                .from('event_registrations')
                .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
                .eq('id', registration_id)
                .eq('status', 'pending') // concurrency guard
            if (upErr) return json({ error: upErr.message }, 500)

            // 4b. Free event? issue ticket via create-purchase-intent
            let isFree = false
            if (reg.tier_id) {
                const { data: tier } = await supabase.from('ticket_tiers').select('price').eq('id', reg.tier_id).single()
                isFree = !tier || Number(tier.price) === 0
            } else {
                isFree = Number(event.ticket_price) === 0
            }
            if (isFree) {
                try {
                    const intentPayload: Record<string, unknown> = { event_id: reg.event_id, quantity: 1, registration_id }
                    if (reg.tier_id) intentPayload.tier_id = reg.tier_id
                    if (!reg.user_id && reg.guest_email) {
                        intentPayload.guest_details = { name: reg.guest_name || '', email: reg.guest_email, phone: '' }
                    }
                    const res = await fetch(`${FUNCTIONS_URL}/create-purchase-intent`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(intentPayload),
                    })
                    if (!res.ok) console.error('free-ticket issue failed:', await res.text())
                } catch (e) { console.error('free-ticket issue error (non-fatal):', e) }
            }

            // 4c. Push
            if (reg.user_id) {
                try {
                    await fetch(`${FUNCTIONS_URL}/send-push`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: reg.user_id,
                            title: '✅ Registration Approved!',
                            body: `Your registration for ${event.title} has been approved.`,
                            data: { type: 'ticket_approved', event_id: reg.event_id, event_title: event.title || '' },
                        }),
                    })
                } catch (e) { console.error('push failed (non-fatal):', e) }
            }

            // 4d. Approval email (always, carries the return link)
            if (recipientEmail) {
                try {
                    const vars = { name: recipientName, event_title: event.title || '', event_date: eventDate, event_venue: event.venue_name || '', organizer_name: businessName }
                    const subject = resolveTags(event.approval_email_subject || `Your registration for ${event.title} has been approved!`, vars)
                    const defaultBody = `Hi ${recipientName},\n\nGood news — your registration for ${event.title} has been approved! Tap the button below to get your tickets.`
                    const rawBody = resolveTags(event.approval_email_body || defaultBody, vars)
                    const bodyHtml = rawBody.trimStart().startsWith('<')
                        ? rawBody
                        : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`
                    const eventUrl = `https://${ROOT_DOMAIN}/events/${event.id}`
                    const htmlBody = `${bodyHtml}<div style="text-align:center;margin:28px 0"><a href="${eventUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-family:sans-serif">Get your tickets</a></div>`
                    await fetch(`${FUNCTIONS_URL}/send-registration-email`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to: recipientEmail, subject, html: htmlBody, sender_name: businessName }),
                    })
                } catch (e) { console.error('approval email failed (non-fatal):', e) }
            }

            return json({ success: true, status: 'approved', registration_id })
        }

        // ---- REJECT ----
        const { error: upErr } = await supabase
            .from('event_registrations')
            .update({ status: 'rejected', rejection_reason: rejection_reason || null, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
            .eq('id', registration_id)
            .eq('status', 'pending')
        if (upErr) return json({ error: upErr.message }, 500)

        // Push
        if (reg.user_id) {
            try {
                await fetch(`${FUNCTIONS_URL}/send-push`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: reg.user_id,
                        title: '❌ Registration Not Approved',
                        body: `Your registration for ${event.title} was not approved.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
                        data: { type: 'ticket_rejected', event_id: reg.event_id, event_title: event.title || '', reason: rejection_reason || '' },
                    }),
                })
            } catch (e) { console.error('push failed (non-fatal):', e) }
        }

        // Rejection email — only when the organizer set a custom rejection body (parity with web)
        if (recipientEmail && event.rejection_email_body) {
            try {
                const vars = { name: recipientName, event_title: event.title || '', event_date: eventDate, event_venue: event.venue_name || '', organizer_name: businessName, reason: rejection_reason || '' }
                const subject = resolveTags(event.rejection_email_subject || `Update on your registration for ${event.title}`, vars)
                const rawBody = resolveTags(event.rejection_email_body, vars)
                const htmlBody = rawBody.trimStart().startsWith('<')
                    ? rawBody
                    : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`
                await fetch(`${FUNCTIONS_URL}/send-registration-email`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: recipientEmail, subject, html: htmlBody, sender_name: businessName }),
                })
            } catch (e) { console.error('rejection email failed (non-fatal):', e) }
        }

        return json({ success: true, status: 'rejected', registration_id })
    } catch (e) {
        console.error('review-event-registration error:', e)
        return json({ error: (e as Error).message || 'Internal error' }, 500)
    }
})
