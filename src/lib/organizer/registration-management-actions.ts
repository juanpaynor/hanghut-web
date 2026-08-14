'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { formatInManila } from '@/lib/datetime'

// Edge functions must be called via the raw Supabase project URL, not the custom domain
const SUPABASE_FUNCTIONS_URL = 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1'

export interface EventRegistration {
    id: string
    event_id: string
    user_id: string | null
    guest_email: string | null
    guest_name: string | null
    tier_id: string | null
    status: 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'cancelled'
    rejection_reason: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
    user?: { full_name: string | null; email: string | null } | null
    tier?: { name: string } | null
    answers: { question_label: string; answer: any }[]
}

export async function getEventRegistrations(
    eventId: string,
    status?: string
): Promise<EventRegistration[]> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Verify the caller is the organizer for this event
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: ownerCheck } = await supabase
        .from('events')
        .select('id, partners!events_organizer_id_fkey(user_id)')
        .eq('id', eventId)
        .single()

    const partnerUserId = (ownerCheck?.partners as any)?.user_id
    if (!ownerCheck || partnerUserId !== user.id) return []

    // Use admin client to bypass RLS on the nested joins (users, registration_answers, registration_questions)
    let query = adminClient
        .from('event_registrations')
        .select(`
            id,
            event_id,
            user_id,
            guest_email,
            guest_name,
            tier_id,
            status,
            rejection_reason,
            reviewed_by,
            reviewed_at,
            created_at,
            user:users!event_registrations_user_id_fkey (
                display_name,
                email
            ),
            registration_answers (
                answer,
                registration_questions (
                    label
                )
            )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })

    if (status) {
        query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
        console.error('getEventRegistrations error:', JSON.stringify(error), error)
        return []
    }

    const registrations: EventRegistration[] = (data || []).map((r: any) => ({
        id: r.id,
        event_id: r.event_id,
        user_id: r.user_id,
        guest_email: r.guest_email,
        guest_name: r.guest_name,
        tier_id: r.tier_id,
        status: r.status,
        rejection_reason: r.rejection_reason,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        user: r.user ? { full_name: r.user.display_name, email: r.user.email } : null,
        tier: null,
        answers: (r.registration_answers || []).map((a: any) => ({
            question_label: a.registration_questions?.label || 'Unknown',
            answer: a.answer,
        })),
    }))

    return registrations
}

export async function approveRegistration(
    registrationId: string,
    eventId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Explicit ownership check — don't rely on RLS silently blocking
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { success: false, error: 'Unauthorized' }

    const { data: eventCheck } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!eventCheck) return { success: false, error: 'Unauthorized: not the organizer of this event' }

    // Use admin client so RLS cannot silently swallow the update
    const { data: updated, error: updateError } = await adminClient
        .from('event_registrations')
        .update({
            status: 'approved',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', registrationId)
        .select('id')

    if (updateError) return { success: false, error: updateError.message }
    if (!updated?.length) return { success: false, error: 'Registration not found' }

    // Fetch registration to determine if free (check tier price or event price)
    const { data: reg } = await adminClient
        .from('event_registrations')
        .select('user_id, guest_email, guest_name, tier_id, event_id')
        .eq('id', registrationId)
        .single()

    // Determine if free: check tier price if tier set, else check event ticket_price
    let isFreeEvent = false
    if (reg?.tier_id) {
        const { data: tier } = await adminClient
            .from('ticket_tiers')
            .select('price')
            .eq('id', reg.tier_id)
            .single()
        isFreeEvent = !tier || Number(tier.price) === 0
    } else {
        const { data: event } = await adminClient
            .from('events')
            .select('ticket_price')
            .eq('id', eventId)
            .single()
        isFreeEvent = !event || Number(event.ticket_price) === 0
    }

    // For free events: issue ticket via create-purchase-intent (which handles
    // reserve_tickets → issue_tickets → send-ticket-email with real QR code)
    if (isFreeEvent && reg) {
        try {
            const intentPayload: any = {
                event_id: reg.event_id,
                quantity: 1,
                registration_id: registrationId,
            }
            if (reg.tier_id) intentPayload.tier_id = reg.tier_id
            // Pass guest_details so the server guard can match guest email ownership
            if (!reg.user_id && reg.guest_email) {
                intentPayload.guest_details = {
                    name: reg.guest_name || '',
                    email: reg.guest_email,
                    phone: '',
                }
            }

            const intentRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-purchase-intent`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(intentPayload),
            })

            if (!intentRes.ok) {
                const err = await intentRes.text()
                console.error('create-purchase-intent failed on free approval:', err)
            } else {
                console.log('Free ticket issued via create-purchase-intent for registration:', registrationId)
            }
        } catch (e) {
            console.error('Failed to issue free ticket via create-purchase-intent (non-fatal):', e)
        }
    }

    // Fire push notification to the user (if they have an account)
    try {
        const { data: regForPush } = await adminClient
            .from('event_registrations')
            .select('user_id, event:events(title)')
            .eq('id', registrationId)
            .single()
        const reg = regForPush

        if (reg?.user_id) {
            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-push`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: reg.user_id,
                    title: '✅ Registration Approved!',
                    body: `Your registration for ${(reg.event as any)?.title || 'the event'} has been approved.`,
                    data: {
                        type: 'ticket_approved',
                        event_id: eventId,
                        event_title: (reg.event as any)?.title || '',
                    },
                }),
            })
        }
    } catch (e) {
        console.error('Push notification failed (non-fatal):', e)
    }

    // Send approval email
    try {
        const { data: regForEmail } = await adminClient
            .from('event_registrations')
            .select(`
                guest_email,
                guest_name,
                user_id,
                event:events (
                    id,
                    title,
                    start_datetime,
                    venue_name,
                    approval_email_subject,
                    approval_email_body,
                    partners!events_organizer_id_fkey ( business_name )
                )
            `)
            .eq('id', registrationId)
            .single()

        const event = regForEmail?.event as any
        const recipientEmail = regForEmail?.guest_email
            || (regForEmail?.user_id
                ? (await adminClient.from('users').select('email').eq('id', regForEmail.user_id).single()).data?.email
                : null)

        // Always email approved registrants (not just when a custom body is set) —
        // it carries the link they need to come back and get their tickets.
        if (recipientEmail) {
            const recipientName = regForEmail?.guest_name || 'there'
            const eventDate = event.start_datetime
                ? formatInManila(event.start_datetime, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : ''

            const resolveTags = (str: string) =>
                str
                    .replace(/{{name}}/g, recipientName)
                    .replace(/{{event_title}}/g, event.title || '')
                    .replace(/{{event_date}}/g, eventDate)
                    .replace(/{{event_venue}}/g, event.venue_name || '')
                    .replace(/{{organizer_name}}/g, event.partners?.business_name || '')

            const subject = resolveTags(event.approval_email_subject || `Your registration for ${event.title} has been approved!`)
            const defaultBody = `Hi ${recipientName},\n\nGood news — your registration for ${event.title} has been approved! Tap the button below to get your tickets.`
            const rawBody = resolveTags(event.approval_email_body || defaultBody)
            // Wrap plain text in minimal HTML if it doesn't look like HTML
            const bodyHtml = rawBody.trimStart().startsWith('<')
                ? rawBody
                : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`

            // Append the all-important return link so the approved user can check out.
            const eventUrl = `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'}/events/${event.id}`
            const htmlBody = `${bodyHtml}<div style="text-align:center;margin:28px 0"><a href="${eventUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-family:sans-serif">Get your tickets</a></div>`

            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-registration-email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject,
                    html: htmlBody,
                    sender_name: event.partners?.business_name || 'HangHut',
                }),
            })
        }
    } catch (e) {
        console.error('Approval email failed (non-fatal):', e)
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export async function rejectRegistration(
    registrationId: string,
    eventId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Explicit ownership check
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { success: false, error: 'Unauthorized' }

    const { data: eventCheck } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!eventCheck) return { success: false, error: 'Unauthorized: not the organizer of this event' }

    const { data: updated, error: updateError } = await adminClient
        .from('event_registrations')
        .update({
            status: 'rejected',
            rejection_reason: reason || null,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', registrationId)
        .select('id')

    if (updateError) return { success: false, error: updateError.message }
    if (!updated?.length) return { success: false, error: 'Registration not found' }

    // Fire push notification
    try {
        const { data: reg } = await adminClient
            .from('event_registrations')
            .select('user_id, event:events(title)')
            .eq('id', registrationId)
            .single()

        if (reg?.user_id) {
            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-push`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: reg.user_id,
                    title: '❌ Registration Not Approved',
                    body: `Your registration for ${(reg.event as any)?.title || 'the event'} was not approved.${reason ? ' Reason: ' + reason : ''}`,
                    data: {
                        type: 'ticket_rejected',
                        event_id: eventId,
                        event_title: (reg.event as any)?.title || '',
                        reason: reason || '',
                    },
                }),
            })
        }
    } catch (e) {
        console.error('Push notification failed (non-fatal):', e)
    }

    // Send rejection email
    try {
        const { data: regForEmail } = await adminClient
            .from('event_registrations')
            .select(`
                guest_email,
                guest_name,
                user_id,
                event:events (
                    title,
                    start_datetime,
                    venue_name,
                    rejection_email_subject,
                    rejection_email_body,
                    partners!events_organizer_id_fkey ( business_name )
                )
            `)
            .eq('id', registrationId)
            .single()

        const event = regForEmail?.event as any
        const recipientEmail = regForEmail?.guest_email
            || (regForEmail?.user_id
                ? (await adminClient.from('users').select('email').eq('id', regForEmail.user_id).single()).data?.email
                : null)

        if (recipientEmail && event?.rejection_email_body) {
            const recipientName = regForEmail?.guest_name || 'there'
            const eventDate = event.start_datetime
                ? formatInManila(event.start_datetime, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : ''

            const resolveTags = (str: string) =>
                str
                    .replace(/{{name}}/g, recipientName)
                    .replace(/{{event_title}}/g, event.title || '')
                    .replace(/{{event_date}}/g, eventDate)
                    .replace(/{{event_venue}}/g, event.venue_name || '')
                    .replace(/{{organizer_name}}/g, event.partners?.business_name || '')
                    .replace(/{{reason}}/g, reason || '')

            const subject = resolveTags(event.rejection_email_subject || `Update on your registration for ${event.title}`)
            const rawBody = resolveTags(event.rejection_email_body)
            const htmlBody = rawBody.trimStart().startsWith('<')
                ? rawBody
                : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`

            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-registration-email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject,
                    html: htmlBody,
                    sender_name: event.partners?.business_name || 'HangHut',
                }),
            })
        }
    } catch (e) {
        console.error('Rejection email failed (non-fatal):', e)
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
