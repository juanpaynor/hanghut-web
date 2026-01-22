'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Approve a payout request
 */
export async function approvePayout(payoutId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('payouts')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
        })
        .eq('id', payoutId)

    if (error) {
        console.error('Error approving payout:', error)
        throw new Error('Failed to approve payout')
    }

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
