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
    /** What this ticket ACTUALLY cost at purchase (reflects the price paid + any
     * discount), not the tier's current list price. Falls back to order/qty, then list. */
    amount_paid: number
    /** Total amount captured for the whole order this ticket belongs to. */
    order_total: number
    /** Number of tickets in this ticket's order. */
    order_quantity: number
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
                total_amount,
                quantity,
                discount_amount,
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
    const attendees: Attendee[] = tickets.map((t: any) => {
        const pi = t.purchase_intent || {}
        const orderQty = Number(pi.quantity) || 1
        const orderTotal = Number(pi.total_amount) || 0
        // What this single ticket actually cost. Prefer the unit_price captured at
        // purchase (survives later tier price edits), fall back to splitting the
        // order total across its tickets, and only then to the tier's list price.
        const amountPaid =
            Number(pi.unit_price) > 0 ? Number(pi.unit_price)
            : orderTotal > 0 ? orderTotal / orderQty
            : (t.tier?.price ?? 0)
        return {
        id: t.id,
        status: t.status,
        created_at: pi.paid_at || t.created_at,
        user_id: t.user_id,
        ticket_number: t.ticket_number || null,
        seat_info: t.seat_info || null,
        checked_in_at: t.checked_in_at || null,
        registration_id: t.registration_id || null,
        payment_id: pi.xendit_invoice_id || null,
        purchase_intent_id: t.purchase_intent_id,
        payment_status: pi.status || null,
        payment_method: pi.payment_method || null,
        refunded_amount: pi.refunded_amount || 0,
        refunded_at: pi.refunded_at || null,
        amount_paid: amountPaid,
        order_total: orderTotal,
        order_quantity: orderQty,
        // Prefer explicit tier relation, fallback to legacy text column
        tier: t.tier ? t.tier : {
            name: t.legacy_tier_name || 'General Admission',
            price: pi.unit_price || 0
        },
        user: t.user ? {
            email: t.user.email,
            display_name: t.user.display_name,
        } : null,
        // pi.guest_name is part of the test, not just the fallback: a box-office
        // door sale can legitimately have a NAME and no email, and without it here
        // that attendee renders with no identity at all.
        guest_info: (t.guest_name || t.guest_email || pi.guest_name || pi.guest_email) ? {
            name: t.guest_name || pi.guest_name,
            email: t.guest_email || pi.guest_email,
            phone: pi.guest_phone
        } : null
        }
    })

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
        supabase.from('purchase_intents').select('total_amount, refunded_amount').eq('event_id', eventId).in('status', ['completed', 'refunded']),
    ])
    // Net revenue: refunds set refunded_amount on the intent but never flip its
    // status, so a plain sum of total_amount double-counts refunded orders. Subtract
    // what was actually returned to keep this in step with the event-overview figure.
    const revenue = (paidRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.total_amount || 0) - Number(p.refunded_amount || 0),
        0,
    )
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
        .select('id, status')
        .eq('id', intentId)
        .single()

    if (!intent) {
        throw new Error('Purchase intent not found')
    }

    if (intent.status === 'refunded') {
        return { success: true, finalized: true }
    }

    // 2. Money: request-refund edge fn (full order — no amount). This also sets
    //    refunded_amount/refunded_at on the intent. NOTE: this is the ONLY call to
    //    request-refund on this path — callers must not invoke it separately (doing so
    //    trips the idempotency guard and blocks the DB finalize below).
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

        if (errorCode === 'INSUFFICIENT_BALANCE' || errorCode === 'INSUFFICIENT_SUBWALLET_BALANCE') {
            throw new Error('Insufficient balance in organizer wallet. Please top up first.')
        }
        throw new Error(`Refund failed: ${errorMsg}`)
    }

    // 3. Finalize atomically: reversal ledger row, void tickets, free seats, decrement
    //    tier + events.tickets_sold, status → refunded. If this fails the money has
    //    already moved, so we return a soft flag rather than throwing (reconcilable).
    const { data: fin, error: finErr } = await supabase.rpc('finalize_event_refund', { p_intent_id: intentId })
    if (finErr || !fin?.success) {
        console.error('[Refund] finalize_event_refund failed (money already refunded):', finErr?.message || fin?.error)
        revalidatePath(`/organizer/events/${eventId}`)
        return { success: true, finalized: false, refundId: result.data?.id }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true, finalized: true, refundId: result.data?.id }
}

/**
 * Every attendee matching `filters`, for CSV/PDF export.
 *
 * The client used to page through getEventAttendees itself, which worked but
 * made one round trip per 200 rows — sequentially, from the browser. At a few
 * hundred attendees that is slow; at the size we are onboarding for it is a
 * spinner that looks broken, and a half-finished loop silently produces a short
 * file with no error.
 *
 * Doing it in one action means the export either arrives whole or fails loudly.
 * The paging still happens, just server-side and close to the database: a single
 * huge .range() is not an option because PostgREST caps rows per request, so a
 * naive "just ask for 50,000" would truncate exactly like the bug we are fixing.
 */
const EXPORT_CHUNK = 1000
/** Refuses rather than silently truncating past this. */
const EXPORT_MAX_ROWS = 50000

export async function getAllEventAttendeesForExport(
    eventId: string,
    filters: AttendeeFilters = {}
): Promise<{ attendees: Attendee[]; total: number; truncated: boolean }> {
    const first = await getEventAttendees(eventId, { ...filters, page: 1, limit: EXPORT_CHUNK })
    const all = [...first.attendees]
    const total = first.total

    const pages = Math.min(
        Math.ceil(total / EXPORT_CHUNK),
        Math.ceil(EXPORT_MAX_ROWS / EXPORT_CHUNK)
    )

    for (let p = 2; p <= pages; p++) {
        const next = await getEventAttendees(eventId, { ...filters, page: p, limit: EXPORT_CHUNK })
        // A short or empty page means the result set ended; stop rather than spin.
        if (!next.attendees.length) break
        all.push(...next.attendees)
    }

    // Reported back so the UI can say so out loud instead of handing over a file
    // that quietly stops early — the exact failure this function exists to end.
    return { attendees: all, total, truncated: all.length < total }
}

/**
 * Fix a mistyped checkout email and re-send the ticket.
 *
 * Scoped to the ORDER, not the single ticket row the organizer clicked: the
 * wrong address was typed once at checkout and landed on the purchase intent
 * and every ticket under it. Correcting one row would leave the order still
 * wrong, and the next resend would go back to the bad address.
 *
 * Never changes users.email — for an account holder this overrides the delivery
 * address on the order only. Changing someone's login from the organizer
 * dashboard is a different, far more dangerous feature.
 */
export async function correctOrderEmail(
    ticketId: string,
    newEmail: string,
    eventId: string,
    reason?: string
): Promise<
    | { ok: true; tickets_moved: number; email_sent: boolean; new_email: string; old_email: string | null; message?: string }
    | { ok: false; error: string }
> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('correct_order_email', {
        p_ticket_id: ticketId,
        p_new_email: newEmail,
        p_reason: reason || null,
    })

    if (error) {
        // The RPC raises bare tokens so both clients can map them to their own
        // copy rather than surfacing a Postgres message to an organizer.
        const MESSAGES: Record<string, string> = {
            INVALID_EMAIL: 'That doesn’t look like a valid email address.',
            TICKET_NOT_FOUND: 'That ticket no longer exists.',
            NOT_YOUR_EVENT: 'You don’t have permission to change this order.',
            SAME_EMAIL: 'That’s already the address on this order.',
        }
        const hit = Object.keys(MESSAGES).find((k) => error.message?.includes(k))
        console.error('correctOrderEmail failed:', error.message)
        return { ok: false, error: hit ? MESSAGES[hit] : 'Could not update the email. Please try again.' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return data as Awaited<ReturnType<typeof correctOrderEmail>> & { ok: true }
}
