'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type ScanResult =
    | { success: true, ticket: any, message: string }
    | { success: false, message: string, details?: string, ticket?: any }

export async function processScan(code: string, eventId?: string): Promise<ScanResult> {
    console.log('[Scan] START - Code:', code, 'EventId:', eventId)

    const supabase = await createClient()

    // 1. Auth Check (Standard Client)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[Scan] Auth Result - User:', user?.id, 'Error:', authError)

    if (!user) {
        return { success: false, message: 'Unauthorized. Please login.' }
    }

    console.log('[Scan] User authenticated:', user.id)

    // Use Admin Client to bypass RLS for lookup
    const adminClient = createAdminClient()

    // 2. Fetch Ticket (Enhanced Lookup)
    let query = adminClient
        .from('tickets')
        .select(`
            *,
            events (
                id,
                title,
                organizer_id
            ),
            ticket_tiers (
                name,
                description,
                price
            ),
            purchase_intents (
                guest_name,
                guest_email
            ),
            user:users!tickets_user_id_fkey (
                display_name,
                email
            )
        `)

    // Determine strategy based on code format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
    const isTicketNum = code.toUpperCase().startsWith('TK-')

    if (isUUID) {
        query = query.eq('id', code)
    } else if (isTicketNum) {
        query = query.eq('ticket_number', code.toUpperCase())
    } else {
        query = query.eq('qr_code', code)
    }

    const { data: ticket, error } = await query.single()

    if (error || !ticket) {
        console.log('[Scan] Initial query failed, trying fallback extraction')
        // Fallback: Check composite extraction
        if (code.includes(':')) {
            const parts = code.split(':')
            if (parts[0] && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(parts[0])) {
                const retryId = parts[0]
                console.log('[Scan] Retrying with extracted ID:', retryId)

                const { data: retryTicket, error: retryError } = await adminClient
                    .from('tickets')
                    .select(`
                        *, 
                        events (id, title, organizer_id), 
                        ticket_tiers (name),
                        purchase_intents (guest_name, guest_email),
                        user:users!tickets_user_id_fkey (display_name, email)
                    `)
                    .eq('id', retryId)
                    .single()

                console.log('[Scan] Retry Result - Found:', !!retryTicket, 'Error:', retryError?.message)

                if (retryTicket) {
                    console.log('[Scan] Calling validation for retry ticket')
                    return handleTicketValidation(retryTicket, eventId, user.id, adminClient)
                } else {
                    console.log('[Scan] FAIL - Retry ticket not found')
                }
            }
        }
        console.log('[Scan] FAIL - No ticket found after all attempts')
        return { success: false, message: 'Ticket Not Found' }
    }

    return handleTicketValidation(ticket, eventId, user.id, adminClient)
}

// 3. Validation Logic
async function handleTicketValidation(ticket: any, activeEventId: string | undefined, userId: string, adminClient: any): Promise<ScanResult> {

    console.log('[Scan] >> VALIDATION START')
    console.log('[Scan] Ticket ID:', ticket.id, 'Event ID:', ticket.event_id)
    console.log('[Scan] Scanner User ID:', userId)

    // Authorization Check: Is this user allowed to scan for this ticket's event?
    const organizerId = ticket.events?.organizer_id
    console.log('[Scan] Event Organizer ID:', organizerId)

    if (!organizerId) {
        console.log('[Scan] FAIL - No organizer on event')
        return { success: false, message: 'Configuration Error', details: 'Event has no organizer' }
    }

    console.log('[Scan] Checking if user', userId, 'is owner/member of organizer', organizerId)

    // Check if user is Owner OR Team Member
    // Parallel check for performance
    const [ownerCheck, teamCheck] = await Promise.all([
        adminClient.from('partners').select('id').eq('id', organizerId).eq('user_id', userId).single(),
        adminClient.from('partner_team_members').select('id').eq('partner_id', organizerId).eq('user_id', userId).single()
    ])

    console.log('[Scan] Owner check - Data:', !!ownerCheck.data, 'Error:', ownerCheck.error?.message)
    console.log('[Scan] Team check - Data:', !!teamCheck.data, 'Error:', teamCheck.error?.message)

    if (!ownerCheck.data && !teamCheck.data) {
        console.log('[Scan] FAIL - User is not authorized for this event organizer')
        return { success: false, message: 'Unauthorized', details: 'You are not a team member for this event.' }
    }

    console.log('[Scan] Authorization SUCCESS')

    // Verify Event Match (if scanner selected one)
    if (activeEventId && ticket.event_id !== activeEventId) {
        return {
            success: false,
            message: 'Wrong Event',
            details: `This ticket is for "${ticket.events?.title}"`,
            ticket
        }
    }

    // Check Status
    const status = ticket.status

    if (status === 'used' || status === 'redeemed' || ticket.checked_in_at) {
        const checkedInDate = ticket.checked_in_at ? new Date(ticket.checked_in_at) : null
        const timeStr = checkedInDate ? checkedInDate.toLocaleTimeString() : 'Previously'

        return {
            success: false,
            message: 'ALREADY SCANNED',
            details: `Checked in at ${timeStr}`,
            ticket: formatTicket(ticket)
        }
    }

    if (status === 'cancelled' || status === 'refunded') {
        return { success: false, message: 'Ticket Voided', details: 'Status: ' + status, ticket: formatTicket(ticket) }
    }

    // Redeem Logic (Admin Client Update)
    const { error: updateError } = await adminClient
        .from('tickets')
        .update({
            status: 'used',
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId
        })
        .eq('id', ticket.id)

    if (updateError) {
        console.error('Scan Update Error:', updateError)
        return { success: false, message: 'Database Error', details: 'Could not update status' }
    }

    // Revalidate organizer pages so they show updated check-in status
    revalidatePath(`/organizer/event/${ticket.event_id}`)
    revalidatePath('/organizer')

    return {
        success: true,
        message: 'Valid Ticket',
        ticket: formatTicket(ticket)
    }
}

function formatTicket(ticket: any) {
    // Priority: user display_name > ticket guest_name > purchase_intent guest_name > 'Guest'
    const displayName = ticket.user?.display_name
        || ticket.guest_name
        || ticket.purchase_intents?.guest_name
        || 'Guest'

    return {
        ...ticket,
        guestName: displayName
    }
}

// Get check-in statistics for an event
export async function getEventCheckInStats(eventId: string) {
    const adminClient = createAdminClient()

    // Get total tickets for this event
    const { count: totalCount } = await adminClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)

    const { count: checkedInCount } = await adminClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'used')

    return {
        total: totalCount || 0,
        checkedIn: checkedInCount || 0
    }
}
