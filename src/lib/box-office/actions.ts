'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Door sales — the thin server layer over the box-office RPCs.
 *
 * All authorization lives in the database (can_sell_at_door / can_manage_door_sales),
 * so these actions deliberately do NOT re-check roles: the RPC is the single gate
 * and a second, drifting copy of the rule here would be worse than none. What they
 * do add is a friendly error string, because the raw exception text from Postgres
 * is what door staff would otherwise read at 9pm with a queue behind them.
 */

export type DoorPaymentMethod = 'CASH' | 'TERMINAL' | 'BANK' | 'COMP'

export interface DoorSaleResult {
    intent_id: string
    quantity: number
    unit_price: number
    total: number
    payment_method: DoorPaymentMethod
    ticket_url: string
    email_sent_to: string | null
    admitted: number
    cash_tendered: number | null
    change_given: number | null
    tickets: { ticket_number: string; qr_code: string }[] | null
}

export interface DoorSale {
    intent_id: string
    buyer_name: string | null
    buyer_email: string | null
    quantity: number
    total: number
    payment_method: string
    status: string
    created_at: string
    seller_name: string | null
    admitted: boolean
    access_token: string | null
}

export interface DoorSummaryRow {
    seller_id: string | null
    seller_name: string
    units: number
    gross: number
    cash_amount: number
    terminal_amount: number
    bank_amount: number
    comp_units: number
    online_amount: number
    voided_units: number
    voided_amount: number
}

/** Postgres RAISE text is already written for humans in these RPCs — surface it as-is. */
function readableError(message: string): string {
    return message.replace(/^.*?ERROR:\s*/i, '').trim() || 'Something went wrong'
}

export async function sellAtDoor(input: {
    eventId: string
    quantity: number
    tierId?: string | null
    buyerName: string
    buyerEmail?: string | null
    buyerPhone?: string | null
    paymentMethod: DoorPaymentMethod
    note?: string | null
    admitNow: boolean
    /** Cash handed over. Only meaningful for CASH; the RPC ignores it otherwise. */
    cashTendered?: number | null
}): Promise<{ data: DoorSaleResult } | { error: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('create_box_office_order', {
        p_event_id: input.eventId,
        p_quantity: input.quantity,
        p_tier_id: input.tierId || null,
        p_buyer_name: input.buyerName,
        p_buyer_email: input.buyerEmail || null,
        p_buyer_phone: input.buyerPhone || null,
        p_payment_method: input.paymentMethod,
        p_note: input.note || null,
        p_admit_now: input.admitNow,
        p_cash_tendered: input.cashTendered ?? null,
    })

    if (error) return { error: readableError(error.message) }

    revalidatePath(`/box-office/${input.eventId}`)
    return { data: data as DoorSaleResult }
}

export async function voidDoorSale(
    intentId: string,
    eventId: string,
    reason?: string
): Promise<{ ok: true; released: number } | { error: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('void_box_office_order', {
        p_intent_id: intentId,
        p_reason: reason || null,
    })

    if (error) return { error: readableError(error.message) }

    revalidatePath(`/box-office/${eventId}`)
    return { ok: true, released: (data as { tickets_released: number }).tickets_released }
}

/**
 * Tonight's door sales, newest first.
 *
 * Reads purchase_intents directly rather than through a view: RLS on the table
 * already restricts an organizer to their own events, and the extra `source`
 * filter keeps online orders out of a list whose only actions are door actions.
 */
export async function getDoorSales(eventId: string): Promise<DoorSale[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('purchase_intents')
        .select('id, guest_name, guest_email, quantity, total_amount, payment_method, status, created_at, access_token, metadata')
        .eq('event_id', eventId)
        .eq('source', 'box_office')
        .order('created_at', { ascending: false })
        .limit(200)

    if (error || !data) return []

    // Which of these actually walked in. Done as one follow-up query rather than a
    // join so the list still renders if the tickets read is slow or empty.
    const ids = data.map((r) => r.id)
    const admitted = new Set<string>()
    if (ids.length > 0) {
        const { data: tk } = await supabase
            .from('tickets')
            .select('purchase_intent_id')
            .in('purchase_intent_id', ids)
            .not('checked_in_at', 'is', null)
        tk?.forEach((t) => t.purchase_intent_id && admitted.add(t.purchase_intent_id))
    }

    const sellerIds = Array.from(
        new Set(data.map((r) => (r.metadata as { sold_by?: string })?.sold_by).filter(Boolean) as string[])
    )
    const names = new Map<string, string>()
    if (sellerIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, display_name').in('id', sellerIds)
        users?.forEach((u) => names.set(u.id, u.display_name))
    }

    return data.map((r) => ({
        intent_id: r.id,
        buyer_name: r.guest_name,
        buyer_email: r.guest_email,
        quantity: r.quantity,
        total: Number(r.total_amount),
        payment_method: r.payment_method ?? 'CASH',
        status: r.status,
        created_at: r.created_at,
        seller_name: names.get((r.metadata as { sold_by?: string })?.sold_by ?? '') ?? null,
        admitted: admitted.has(r.id),
        access_token: r.access_token ?? null,
    }))
}

export async function getDoorSummary(eventId: string): Promise<DoorSummaryRow[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_box_office_summary', { p_event_id: eventId })
    if (error || !data) return []
    return (data as DoorSummaryRow[]).map((r) => ({
        ...r,
        gross: Number(r.gross),
        cash_amount: Number(r.cash_amount),
        terminal_amount: Number(r.terminal_amount),
        bank_amount: Number(r.bank_amount),
        online_amount: Number(r.online_amount),
        voided_amount: Number(r.voided_amount),
    }))
}

/* ── Finding someone who already bought ───────────────────────────────────── */

export interface DoorAttendee {
    ticket_id: string
    ticket_number: string | null
    attendee_name: string | null
    attendee_email: string | null
    tier_name: string | null
    status: string
    checked_in_at: string | null
    seat_info: { section?: string; row?: string; seat?: number; label?: string } | null
    source: string | null
    order_quantity: number | null
}

/**
 * Search the room by name, email or ticket number.
 *
 * This is the queue-jamming case /scan cannot handle: a dead phone or an inbox
 * they can't reach. The RPC owns authorization and the 2-character floor.
 */
export async function findAtDoor(eventId: string, query: string): Promise<DoorAttendee[]> {
    if (query.trim().length < 2) return []
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('find_attendees_at_door', {
        p_event_id: eventId,
        p_query: query,
    })
    if (error || !data) return []
    return data as DoorAttendee[]
}

export async function admitAtDoor(
    ticketId: string
): Promise<{ ok: true; who: string | null } | { ok: false; error: string; message: string; who?: string | null; checked_in_by_name?: string }> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('admit_ticket_at_door', { p_ticket_id: ticketId })
    if (error) return { ok: false, error: 'SERVER_ERROR', message: readableError(error.message) }
    return data as Awaited<ReturnType<typeof admitAtDoor>>
}

/* ── Close-out: counting the tin ───────────────────────────────────────────── */

export interface DoorCloseout {
    seller_id: string | null
    seller_name: string
    counted_cash: number
    expected_cash: number
    /** counted − expected. Positive = over, negative = short. */
    variance: number
    note: string | null
    counted_by_name: string
    counted_at: string
}

export async function getDoorCloseouts(eventId: string): Promise<DoorCloseout[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_box_office_closeouts', { p_event_id: eventId })
    if (error || !data) return []
    return (data as DoorCloseout[]).map((r) => ({
        ...r,
        counted_cash: Number(r.counted_cash),
        expected_cash: Number(r.expected_cash),
        variance: Number(r.variance),
    }))
}

/**
 * Record what was actually counted.
 *
 * Only the counted figure is sent — expected cash is recomputed by the RPC. A
 * client-supplied expectation would let a till be balanced by asserting the very
 * number it exists to prove.
 *
 * `sellerId` null counts the whole door as one tin, which is how a small event
 * with a single drawer actually works.
 */
export async function recordDoorCloseout(
    eventId: string,
    countedCash: number,
    sellerId?: string | null,
    note?: string
): Promise<
    | { ok: true; expected: number; counted: number; variance: number }
    | { ok: false; error: string }
> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('record_box_office_closeout', {
        p_event_id: eventId,
        p_counted_cash: countedCash,
        p_seller_id: sellerId ?? null,
        p_note: note ?? null,
    })
    if (error) return { ok: false, error: readableError(error.message) }

    const row = data as { expected_cash: number; counted_cash: number; variance: number }
    revalidatePath(`/box-office/${eventId}`)
    return {
        ok: true,
        expected: Number(row.expected_cash),
        counted: Number(row.counted_cash),
        variance: Number(row.variance),
    }
}
