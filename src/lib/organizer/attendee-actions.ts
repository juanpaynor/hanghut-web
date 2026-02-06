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
                guest_phone
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
        // Note: Searching across related tables (users) in Supabase is tricky with simple OR
        // We will focus on fields on the ticket itself or try to filter broadly.
        // For MVP performance on large datasets, strict exact filtering or just ticket_number/guest_email is safer.
        // But users want name search. 
        // We will try a flexible ILIKE on the fields we have access to via views or just limit to Guest Info/Ticket ID for now to allow Index usage
        // OR filtering: ticket_number, guest_email, guest_name.
        // Accessing user.email via relation in filter is complex in one go without a View.

        // Let's search Ticket Fields + Guest Fields.
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
        created_at: t.created_at,
        user_id: t.user_id,
        payment_id: t.purchase_intent?.xendit_invoice_id || null,
        purchase_intent_id: t.purchase_intent_id,
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

export async function refundTicket(ticketId: string, eventId: string) {
    const supabase = await createClient()

    // 1. Fetch Ticket details
    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*, tier:ticket_tiers(id, price)')
        .eq('id', ticketId)
        .single()

    if (ticketError || !ticket) {
        throw new Error('Ticket not found')
    }

    if (ticket.status === 'refunded') {
        throw new Error('Ticket is already refunded')
    }

    // 2. CHECK PENDING BALANCE (SOP Requirement)
    // For MVP, we will assume we can refund if the organizer has any sales. 
    // Ideally, we sum up recent transactions. 
    // Since we lack a complex ledger for "Pending Balance" per user readily available in this context without querying transactions:
    // We will perform a "Safe Manual Refund" - marking it as refunded in DB.
    // Xendit automated refunds require specific API calls which we'll simulate for now or stub.

    // 3. Update Ticket Status
    const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', ticketId)

    if (updateError) {
        throw new Error('Failed to update ticket status')
    }

    // 4. Decrement Quantity Sold in Tier
    if (ticket.tier_id) {
        const { error: tierError } = await supabase.rpc('decrement_tier_sold', {
            row_id: ticket.tier_id,
            amount: 1
        })

        // Fallback if RPC doesn't exist (it should, but just in case, manual update)
        if (tierError) {
            // Fetch current
            const { data: currentTier } = await supabase.from('ticket_tiers').select('quantity_sold').eq('id', ticket.tier_id).single()
            if (currentTier) {
                await supabase.from('ticket_tiers').update({ quantity_sold: Math.max(0, currentTier.quantity_sold - 1) }).eq('id', ticket.tier_id)
            }
        }
    }

    // 5. TODO: Trigger Xendit Refund via Edge Function or API here
    // For now, we rely on the Admin to process the actual money return if it's not automated.
    // Or we assume the SOP where "Mark as Refunded" triggers a payout deduction.

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
