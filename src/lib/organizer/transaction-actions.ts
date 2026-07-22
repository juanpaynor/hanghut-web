'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { markIntentAsRefunded } from './attendee-actions'
import { revalidatePath } from 'next/cache'

export interface TransactionDetail {
    id: string
    event_title: string
    buyer_name: string | null
    buyer_email: string | null
    quantity: number
    gross_amount: number
    platform_fee: number
    payment_processing_fee: number
    fixed_fee: number | null
    vat: number
    organizer_payout: number
    total_amount: number
    payment_method: string | null
    xendit_transaction_id: string | null
    status: string
    created_at: string
    intent_status: string | null
    refunded_amount: number
    refunded_at: string | null
    refund_method: string | null
    purchase_intent_id: string | null
    pass_fees: boolean
    tickets: { ticket_number: string | null; seat_info: any; status: string; tier: string | null }[]
}

/** Full detail for a single transaction — organizer-scoped. */
export async function getTransactionDetail(transactionId: string): Promise<{ detail?: TransactionDetail; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data: txn } = await supabase
        .from('transactions')
        .select(`
            id, gross_amount, platform_fee, payment_processing_fee, fixed_fee, vat, organizer_payout,
            status, created_at, xendit_transaction_id, partner_id, event_id, purchase_intent_id,
            event:events ( title ),
            purchase_intent:purchase_intents ( id, guest_name, guest_email, user_id, quantity, total_amount, payment_method, status, refunded_amount, refunded_at, refund_method, metadata )
        `)
        .eq('id', transactionId)
        .maybeSingle()

    if (!txn) return { error: 'Transaction not found' }
    if (txn.partner_id !== partnerId) return { error: 'Not authorized' }

    const pi: any = txn.purchase_intent

    let buyerName: string | null = pi?.guest_name || null
    let buyerEmail: string | null = pi?.guest_email || null
    if (!buyerEmail && pi?.user_id) {
        const { data: u } = await supabase.from('users').select('email, display_name').eq('id', pi.user_id).maybeSingle()
        buyerEmail = u?.email || null
        buyerName = buyerName || u?.display_name || null
    }

    let tickets: TransactionDetail['tickets'] = []
    if (pi?.id) {
        const { data: tks } = await supabase
            .from('tickets')
            .select('ticket_number, seat_info, status, tier:ticket_tiers(name)')
            .eq('purchase_intent_id', pi.id)
        tickets = (tks || []).map((t: any) => ({
            ticket_number: t.ticket_number ?? null,
            seat_info: t.seat_info ?? null,
            status: t.status,
            tier: t.tier?.name ?? null,
        }))
    }

    return {
        detail: {
            id: txn.id,
            event_title: (txn.event as any)?.title || 'Event',
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            quantity: pi?.quantity ?? tickets.length,
            gross_amount: Number(txn.gross_amount) || 0,
            platform_fee: Number(txn.platform_fee) || 0,
            payment_processing_fee: Number(txn.payment_processing_fee) || 0,
            fixed_fee: txn.fixed_fee != null ? Number(txn.fixed_fee) : null,
            vat: Number(txn.vat) || 0,
            organizer_payout: Number(txn.organizer_payout) || 0,
            total_amount: Number(pi?.total_amount ?? txn.gross_amount) || 0,
            payment_method: pi?.payment_method || null,
            xendit_transaction_id: txn.xendit_transaction_id || null,
            status: txn.status,
            created_at: txn.created_at,
            intent_status: pi?.status ?? null,
            refunded_amount: Number(pi?.refunded_amount) || 0,
            refunded_at: pi?.refunded_at || null,
            refund_method: pi?.refund_method || null,
            purchase_intent_id: pi?.id || null,
            pass_fees: pi?.metadata?.pass_fees === true,
            tickets,
        },
    }
}

/**
 * Issue a manual refund for a transaction. Full (amount >= order total) reuses
 * markIntentAsRefunded (voids tickets + restores inventory). Partial refunds the
 * given amount via the request-refund edge fn and leaves tickets valid.
 */
export async function refundTransaction(
    transactionId: string,
    amount: number,
    reason: string,
): Promise<{ success?: boolean; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data: txn } = await supabase
        .from('transactions')
        .select('id, partner_id, event_id, status, purchase_intent:purchase_intents ( id, total_amount, status, refunded_at )')
        .eq('id', transactionId)
        .maybeSingle()

    if (!txn) return { error: 'Transaction not found' }
    if (txn.partner_id !== partnerId) return { error: 'Not authorized' }

    const pi: any = txn.purchase_intent
    if (!pi?.id) return { error: 'No order is linked to this transaction.' }
    if (pi.status === 'refunded' || pi.refunded_at) return { error: 'This transaction has already been refunded.' }

    const total = Number(pi.total_amount) || 0
    const amt = Math.min(Math.max(Number(amount) || 0, 0), total)
    if (amt <= 0) return { error: 'Enter a valid refund amount.' }

    try {
        if (amt >= total) {
            // Full refund — voids tickets, restores inventory, status → refunded.
            await markIntentAsRefunded(pi.id, txn.event_id, reason)
        } else {
            // Partial refund — refund the amount via the edge fn; tickets stay valid.
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ intent_id: pi.id, amount: amt, reason, intent_type: 'event' }),
            })
            const result = await res.json()
            if (!res.ok || !result.success) {
                return { error: result.error || result.message || 'Refund failed' }
            }
        }
        revalidatePath('/organizer/payouts')
        return { success: true }
    } catch (e: any) {
        return { error: e?.message || 'Refund failed' }
    }
}

/**
 * Record an OFF-PLATFORM (manual) refund for payment methods Xendit can't auto-reverse
 * (QRPH). The organizer pays the customer back directly (GCash/bank/cash) and records it
 * here; the atomic record_manual_refund RPC voids/partials the order, restores inventory +
 * seats, writes the double-entry reversal row (platform fee kept), and logs the disbursement.
 */
export async function recordManualRefund(
    transactionId: string,
    amount: number,
    channel: 'gcash' | 'bank' | 'cash',
    reference: string,
    note: string,
): Promise<{ success?: boolean; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data: txn } = await supabase
        .from('transactions')
        .select('id, partner_id, purchase_intent:purchase_intents ( id )')
        .eq('id', transactionId)
        .maybeSingle()

    if (!txn) return { error: 'Transaction not found' }
    if (txn.partner_id !== partnerId) return { error: 'Not authorized' }
    const pi: any = txn.purchase_intent
    if (!pi?.id) return { error: 'No order is linked to this transaction.' }

    const { data, error } = await supabase.rpc('record_manual_refund', {
        p_intent_id: pi.id,
        p_amount: amount,
        p_channel: channel,
        p_reference: reference || null,
        p_note: note || null,
    })
    if (error) return { error: error.message }
    if (!data?.success) return { error: data?.error || 'Manual refund failed' }

    revalidatePath('/organizer/payouts')
    return { success: true }
}
