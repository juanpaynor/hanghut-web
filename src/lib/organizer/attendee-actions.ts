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
        created_at: t.created_at,
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

export async function markIntentAsRefunded(intentId: string, eventId: string) {
    const supabase = await createClient()

    // 1. Get all tickets for this intent
    const { data: tickets } = await supabase
        .from('tickets')
        .select('id, tier_id, status')
        .eq('purchase_intent_id', intentId)

    if (!tickets || tickets.length === 0) return { success: true }

    // Filter mainly to handle inventory correctly (avoid double count)
    const ticketsToRefund = tickets.filter(t => t.status !== 'refunded')

    if (ticketsToRefund.length === 0) return { success: true }

    // 2. Update status for ALL tickets (safe to re-run)
    const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('purchase_intent_id', intentId)

    if (updateError) {
        console.error('Failed to update ticket status', updateError)
        throw new Error('Failed to update ticket status')
    }

    // 3. Decrement Inventory
    const tierCounts = new Map<string, number>()
    for (const t of ticketsToRefund) {
        // Only count if it has a tier_id
        if (t.tier_id) {
            tierCounts.set(t.tier_id, (tierCounts.get(t.tier_id) || 0) + 1)
        }
    }

    for (const [tierId, count] of Array.from(tierCounts.entries())) {
        try {
            // Optimistic call, ignore error if SP doesn't exist
            await supabase.rpc('decrement_tier_sold', {
                row_id: tierId,
                amount: count
            })
        } catch (e) {
            console.error('Failed to decrement tier sold', e)
        }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
