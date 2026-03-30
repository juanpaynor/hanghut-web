'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface Attendee {
    id: string
    status: string
    created_at: string
    user_id: string | null
    guest_info: {
        name: string
        email: string
        phone?: string
    } | null
    user: {
        email: string
        display_name: string
        phone?: string
    } | null
    tier: {
        name: string
        price: number
    } | null
    payment_id: string | null
    purchase_intent_id: string | null
    payment_status: string | null
    payment_method: string | null
    refunded_amount: number | null
    refunded_at: string | null
}

export async function getEventAttendees(
    eventId: string,
    page: number = 1,
    limit: number = 20,
    search: string = ''
) {
    const supabase = await createClient()

    // Base Query
    let query = supabase
        .from('tickets')
        .select(`
            id,
            status,
            created_at,
            user_id,
            guest_name,
            guest_email,
            purchase_intent_id,
            legacy_tier_name:tier,
            purchase_intent:purchase_intents (
                xendit_invoice_id,
                unit_price,
                guest_name,
                guest_email,
                guest_phone,
                status,
                payment_method,
                paid_at,
                refunded_amount,
                refunded_at
            ),
            user:users!tickets_user_id_fkey (
                email,
                display_name
            ),
            tier:ticket_tiers (
                name,
                price
            )
        `, { count: 'exact' })
        .eq('event_id', eventId)
        .neq('status', 'available') // Filter out pre-minted inventory

    // Search Filter
    if (search) {
        // ... (Keep existing search logic)
        query = query.or(`ticket_number.ilike.%${search}%,guest_name.ilike.%${search}%,guest_email.ilike.%${search}%`)
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: tickets, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) {
        console.error('Error fetching attendees:', error)
        throw new Error('Failed to fetch attendees')
    }

    // Map to Attendee Interface
    const attendees: Attendee[] = tickets.map((t: any) => ({
        id: t.id,
        status: t.status,
        created_at: t.purchase_intent?.paid_at || t.created_at,
        user_id: t.user_id,
        payment_id: t.purchase_intent?.xendit_invoice_id || null,
        purchase_intent_id: t.purchase_intent_id,
        payment_status: t.purchase_intent?.status || null,
        payment_method: t.purchase_intent?.payment_method || null,
        refunded_amount: t.purchase_intent?.refunded_amount || 0,
        refunded_at: t.purchase_intent?.refunded_at || null,
        // Prefer explicit tier relation, fallback to legacy text column
        tier: t.tier ? t.tier : {
            name: t.legacy_tier_name || 'General Admission',
            price: t.purchase_intent?.unit_price || 0
        },
        user: t.user ? {
            email: t.user.email,
            display_name: t.user.display_name,
        } : null,
        guest_info: (t.guest_name || t.guest_email || t.purchase_intent?.guest_email) ? {
            name: t.guest_name || t.purchase_intent?.guest_name,
            email: t.guest_email || t.purchase_intent?.guest_email,
            phone: t.purchase_intent?.guest_phone
        } : null
    }))

    return { attendees, total: count || 0 }
}

export async function refundTicket(ticketId: string, eventId: string, reason: string = 'Requested by organizer') {
    const supabase = await createClient()

    // 1. Fetch ticket with intent and tier info
    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*, tier:ticket_tiers(id, price), purchase_intent:purchase_intents(id, total_amount, quantity, status, xendit_invoice_id)')
        .eq('id', ticketId)
        .single()

    if (ticketError || !ticket) {
        throw new Error('Ticket not found')
    }

    if (ticket.status === 'refunded') {
        throw new Error('Ticket is already refunded')
    }

    const intent = Array.isArray(ticket.purchase_intent) ? ticket.purchase_intent[0] : ticket.purchase_intent
    if (!intent) {
        throw new Error('No purchase intent found for this ticket')
    }

    if (intent.status !== 'completed' && intent.status !== 'paid') {
        throw new Error('Cannot refund — payment was not completed')
    }

    // 2. Calculate refund amount (per-ticket price)
    const tier = Array.isArray(ticket.tier) ? ticket.tier[0] : ticket.tier
    const perTicketPrice = tier?.price || (intent.total_amount / (intent.quantity || 1))

    // 3. Call the request-refund edge function (handles Xendit API + MASTER transfer + rollback)
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-refund`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
                intent_id: intent.id,
                amount: perTicketPrice,
                reason: reason,
                intent_type: 'event',
            }),
        }
    )

    const result = await response.json()

    if (!response.ok || !result.success) {
        const errorMsg = result.error || 'Refund failed'
        const errorCode = result.code || 'UNKNOWN'
        console.error('[Refund] Edge function error:', errorCode, errorMsg)

        if (errorCode === 'INSUFFICIENT_BALANCE') {
            throw new Error('Insufficient balance in organizer wallet. Please top up first.')
        }
        throw new Error(`Refund failed: ${errorMsg}`)
    }

    // 4. Mark this specific ticket as refunded (edge function handles intent-level updates, we handle per-ticket)
    const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', ticketId)

    if (updateError) {
        console.error('[Refund] Failed to update ticket status:', updateError)
        // Don't throw — the actual refund succeeded, this is just a DB status update
    }

    // 5. Decrement tier quantity_sold
    if (ticket.tier_id) {
        try {
            await supabase.rpc('decrement_tier_sold', {
                row_id: ticket.tier_id,
                amount: 1
            })
        } catch (e) {
            // Fallback manual decrement
            const { data: currentTier } = await supabase.from('ticket_tiers').select('quantity_sold').eq('id', ticket.tier_id).single()
            if (currentTier) {
                await supabase.from('ticket_tiers').update({ quantity_sold: Math.max(0, currentTier.quantity_sold - 1) }).eq('id', ticket.tier_id)
            }
        }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true, refundId: result.data?.id }
}

export async function markIntentAsRefunded(intentId: string, eventId: string, reason: string = 'Full order refund by organizer') {
    const supabase = await createClient()

    // 1. Get intent details
    const { data: intent } = await supabase
        .from('purchase_intents')
        .select('id, total_amount, quantity, status, xendit_invoice_id')
        .eq('id', intentId)
        .single()

    if (!intent) {
        throw new Error('Purchase intent not found')
    }

    if (intent.status === 'refunded') {
        return { success: true }
    }

    // 2. Get all non-refunded tickets for this intent
    const { data: tickets } = await supabase
        .from('tickets')
        .select('id, tier_id, status')
        .eq('purchase_intent_id', intentId)

    if (!tickets || tickets.length === 0) return { success: true }

    const ticketsToRefund = tickets.filter(t => t.status !== 'refunded')
    if (ticketsToRefund.length === 0) return { success: true }

    // 3. Call the request-refund edge function (full refund — no amount means full)
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-refund`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
                intent_id: intentId,
                reason: reason,
                intent_type: 'event',
            }),
        }
    )

    const result = await response.json()

    if (!response.ok || !result.success) {
        const errorMsg = result.error || 'Refund failed'
        const errorCode = result.code || 'UNKNOWN'
        console.error('[Refund] Edge function error:', errorCode, errorMsg)

        if (errorCode === 'INSUFFICIENT_BALANCE') {
            throw new Error('Insufficient balance in organizer wallet. Please top up first.')
        }
        throw new Error(`Refund failed: ${errorMsg}`)
    }

    // 4. Mark all tickets as refunded
    const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('purchase_intent_id', intentId)

    if (updateError) {
        console.error('[Refund] Failed to update ticket statuses:', updateError)
    }

    // 5. Decrement tier inventory
    const tierCounts = new Map<string, number>()
    for (const t of ticketsToRefund) {
        if (t.tier_id) {
            tierCounts.set(t.tier_id, (tierCounts.get(t.tier_id) || 0) + 1)
        }
    }

    for (const [tierId, count] of Array.from(tierCounts.entries())) {
        try {
            await supabase.rpc('decrement_tier_sold', {
                row_id: tierId,
                amount: count
            })
        } catch (e) {
            console.error('[Refund] Failed to decrement tier sold:', e)
        }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true, refundId: result.data?.id }
}
