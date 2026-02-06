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
 * Reject a payout request
 */
export async function rejectPayout(payoutId: string, reason: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('payouts')
        .update({
            status: 'rejected',
            rejection_reason: reason,
        })
        .eq('id', payoutId)

    if (error) {
        console.error('Error rejecting payout:', error)
        throw new Error('Failed to reject payout')
    }

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
