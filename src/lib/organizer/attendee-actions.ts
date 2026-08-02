'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface SeatInfo { section?: string; row?: string; seat?: number; label?: string }

export interface Attendee {
    id: string
    status: string
    created_at: string
    user_id: string | null
    ticket_number: string | null
    seat_info: SeatInfo | null
    checked_in_at: string | null
    registration_id: string | null
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

export type AttendeeFilters = {
    page?: number
    limit?: number
    search?: string
    /** Ticket lifecycle axis: all | active (valid+used) | refunded */
    status?: 'all' | 'active' | 'refunded'
    /** Payment method (e.g. GCASH, QRPH, CARDS) or 'all' */
    payment?: string
    /** Ticket tier id or 'all' */
    tierId?: string
    /** Check-in axis (orthogonal to status): any | in (scanned) | out (not scanned) */
    checkin?: 'any' | 'in' | 'out'
    /** ISO date bounds on purchase date (inclusive) */
    dateFrom?: string
    dateTo?: string
    /** Sort order */
    sort?: 'newest' | 'oldest' | 'checkin'
}

export async function getEventAttendees(eventId: string, filters: AttendeeFilters = {}) {
    const {
        page = 1,
        limit = 20,
        search = '',
        status = 'all',
        payment = 'all',
        tierId = 'all',
        checkin = 'any',
        dateFrom,
        dateTo,
        sort = 'newest',
    } = filters

    const supabase = await createClient()

    // When filtering by payment method, the embed must be !inner so the filter
    // narrows the ticket rows (payment_method lives on the joined purchase_intent),
    // not just the embedded object.
    const intentInner = payment && payment !== 'all' ? '!inner' : ''

    // Base Query
    let query = supabase
        .from('tickets')
        .select(`
            id,
            status,
            created_at,
            user_id,
            ticket_number,
            seat_info,
            checked_in_at,
            registration_id,
            guest_name,
            guest_email,
            purchase_intent_id,
            legacy_tier_name:tier,
            purchase_intent:purchase_intents${intentInner} (
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
        .neq('status', 'reserved') // Filter out abandoned/incomplete checkouts

    // Status axis: active = attending (valid or checked-in), refunded = voided.
    // Check-in state is a SEPARATE axis (checked_in_at), so 'active' spans both.
    if (status === 'active') {
        query = query.in('status', ['valid', 'used'])
    } else if (status === 'refunded') {
        query = query.eq('status', 'refunded')
    }

    // Check-in axis (orthogonal): scanned tickets have checked_in_at set.
    if (checkin === 'in') {
        query = query.not('checked_in_at', 'is', null)
    } else if (checkin === 'out') {
        query = query.is('checked_in_at', null)
    }

    // Tier filter
    if (tierId && tierId !== 'all') {
        query = query.eq('tier_id', tierId)
    }

    // Payment-method filter (e.g. find QRPH attendees who need a manual refund).
    // Relies on the !inner embed above to filter ticket rows by the joined method.
    if (payment && payment !== 'all') {
        query = query.eq('purchase_intent.payment_method', payment)
    }

    // Purchase-date range (inclusive). dateTo is treated as end-of-day.
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)

    // Search: ticket # + guest name/email live on the tickets row, but a
    // LOGGED-IN buyer's name/email live on the joined users row — a plain .or()
    // over ticket columns misses them (the old bug). Resolve matching user ids
    // first (admin client, scoped by the search term) and fold them into the OR.
    if (search) {
        const safe = search.replace(/[,()*]/g, ' ').trim()
        if (safe) {
            const clauses = [
                `ticket_number.ilike.%${safe}%`,
                `guest_name.ilike.%${safe}%`,
                `guest_email.ilike.%${safe}%`,
            ]
            try {
                const admin = createAdminClient()
                const { data: users } = await admin
                    .from('users')
                    .select('id')
                    .or(`display_name.ilike.%${safe}%,email.ilike.%${safe}%`)
                    .limit(100)
                const ids = (users || []).map((u: any) => u.id)
                if (ids.length) clauses.push(`user_id.in.(${ids.join(',')})`)
            } catch {
                // Non-fatal — fall back to ticket-column search only.
            }
            query = query.or(clauses.join(','))
        }
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Sort
    if (sort === 'oldest') {
        query = query.order('created_at', { ascending: true })
    } else if (sort === 'checkin') {
        query = query.order('checked_in_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
    } else {
        query = query.order('created_at', { ascending: false })
    }

    const { data: tickets, error, count } = await query.range(from, to)

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
        ticket_number: t.ticket_number || null,
        seat_info: t.seat_info || null,
        checked_in_at: t.checked_in_at || null,
        registration_id: t.registration_id || null,
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

/**
 * Distinct payment methods actually used for this event's attendees — drives the
 * payment-method filter dropdown so it always matches the real data (cards, QRPH,
 * GCash, direct debit, etc.) instead of a hardcoded list. Scoped to intents that
 * produced attendees (completed/refunded); excludes the unresolved 'multiple' placeholder.
 */
export async function getEventPaymentMethods(eventId: string): Promise<string[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('purchase_intents')
        .select('payment_method')
        .eq('event_id', eventId)
        .in('status', ['completed', 'refunded'])
        .not('payment_method', 'is', null)
    const set = new Set<string>()
    for (const r of (data || []) as any[]) {
        const m = (r.payment_method || '').toUpperCase()
        if (m && m !== 'MULTIPLE') set.add(m)
    }
    return Array.from(set).sort()
}

/** Ticket tiers for this event — drives the tier filter dropdown. */
export async function getEventTiers(eventId: string): Promise<{ id: string; name: string }[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('ticket_tiers')
        .select('id, name, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })
    return (data || []).map((t: any) => ({ id: t.id, name: t.name }))
}

/** Top-of-page attendee stats (independent of the current filter/page). */
export async function getAttendeeStats(eventId: string) {
    const supabase = await createClient()
    const [attendeeRes, checkedInRes, paidRes] = await Promise.all([
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).in('status', ['valid', 'used']),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'used'),
        supabase.from('purchase_intents').select('total_amount').eq('event_id', eventId).eq('status', 'completed'),
    ])
    const revenue = (paidRes.data || []).reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0)
    return {
        attendees: attendeeRes.count || 0,
        checkedIn: checkedInRes.count || 0,
        revenue,
    }
}

export interface RegistrationAnswerView { label: string; answer: string }

/** Loads an attendee's registration question answers on demand (View answers). */
export async function getRegistrationAnswers(registrationId: string): Promise<RegistrationAnswerView[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('registration_answers')
        .select('answer, question:registration_questions(label, display_order)')
        .eq('registration_id', registrationId)

    const pretty = (raw: string | null): string => {
        if (!raw) return '—'
        const s = String(raw).trim()
        if (s.startsWith('[')) {
            try { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr.join(', ') } catch { /* keep raw */ }
        }
        if (s === 'true') return 'Yes'
        if (s === 'false') return 'No'
        return s
    }

    return (data || [])
        .map((a: any) => ({
            label: a.question?.label ?? 'Question',
            answer: pretty(a.answer),
            order: a.question?.display_order ?? 0,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ label, answer }) => ({ label, answer }))
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
