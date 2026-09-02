'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Approve a payout request
 */
import { executeXenditPayout } from '@/lib/payment/xendit-payouts'
import { BankCode } from '@/lib/constants/banks'

/**
 * Approve a payout request and trigger Xendit Disbursement
 */
export async function approvePayout(payoutId: string) {
    const supabase = await createClient()

    // 1. Get Auth Session (Required for Edge Function verification)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        return { success: false, message: 'Unauthorized: No active session' }
    }

    console.log(`[Admin] Approving payout ${payoutId} via Edge Function...`)

    // 2. Invoke Edge Function
    // We delegate all logic (Bank Code resolution, Xendit Call, DB Updates) to the secure backend.
    const { data: result, error: funcError } = await supabase.functions.invoke('approve-payout', {
        body: {
            payout_id: payoutId
        },
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    })

    if (funcError) {
        console.error('[Admin] Function Invocation Error:', funcError)
        throw new Error(funcError.message || 'Failed to connect to payout service')
    }

    if (result && !result.success) {
        console.error('[Admin] Function Execution Error:', result)
        throw new Error(result.error?.message || result.message || 'Payout approval failed')
    }

    console.log('[Admin] Success:', result)
    return { success: true }
}

/**
 * Reject a payout request.
 * Unlinks associated transactions so funds become available again.
 */
export async function rejectPayout(payoutId: string, reason: string) {
    const supabase = await createClient()

    // Only an un-actioned request may be rejected. Once approve-payout has fired
    // there is a live Xendit disbursement against this row, and rejecting it would
    // unlink the transactions below — handing the same money back to the partner's
    // available balance while the transfer is still in flight, so it could be
    // requested and paid a second time. approvePayout is already guarded this way
    // inside the edge function; rejection was a bare UPDATE with no check at all.
    const { data: updated, error } = await supabase
        .from('payouts')
        .update({
            status: 'rejected',
            rejection_reason: reason,
        })
        .eq('id', payoutId)
        .eq('status', 'pending_request')
        .select('id')

    if (error) {
        console.error('Error rejecting payout:', error)
        throw new Error('Failed to reject payout')
    }

    if (!updated || updated.length === 0) {
        const { data: current } = await supabase
            .from('payouts')
            .select('status')
            .eq('id', payoutId)
            .single()
        throw new Error(
            `Cannot reject: this payout is already ${current?.status ?? 'actioned'}. `
            + 'A disbursement may already be on its way to the partner.'
        )
    }

    // Unlink transactions so funds return to available balance
    await supabase
        .from('transactions')
        .update({ payout_id: null })
        .eq('payout_id', payoutId)

    await supabase
        .from('experience_transactions')
        .update({ payout_id: null })
        .eq('payout_id', payoutId)

    return { success: true }
}

/**
 * Mark payout as processing (Xendit disbursement initiated)
 */
export async function markPayoutProcessing(payoutId: string, xenditDisbursementId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('payouts')
        .update({
            status: 'processing',
            xendit_disbursement_id: xenditDisbursementId,
            processed_at: new Date().toISOString(),
        })
        .eq('id', payoutId)

    if (error) {
        console.error('Error marking payout as processing:', error)
        throw new Error('Failed to mark payout as processing')
    }

    return { success: true }
}

/**
 * Mark payout as completed
 */
export async function markPayoutCompleted(payoutId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('payouts')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
        })
        .eq('id', payoutId)

    if (error) {
        console.error('Error marking payout as completed:', error)
        throw new Error('Failed to mark payout as completed')
    }

    return { success: true }
}

/**
 * Get transactions associated with a payout
 */
export async function getPayoutTransactions(payoutId: string) {
    const supabase = await createClient()

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
            *,
            event:events(title),
            user:users(display_name, email)
        `)
        .eq('payout_id', payoutId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching payout transactions:', error)
        return []
    }

    return transactions || []
}
