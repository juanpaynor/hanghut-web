'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { executeXenditPayout } from '@/lib/payment/xendit-payouts'
import { BankCode } from '@/lib/constants/banks'
import { getAuthUser } from '@/lib/auth/cached'

export async function requestPayout(partnerId: string, amount: number) {
    if (amount <= 0) {
        return { success: false, message: 'Invalid payout amount' }
    }

    const supabase = await createClient()

    // 1. Get Auth Session (Required for Edge Function verification)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        return { success: false, message: 'Unauthorized: No active session' }
    }

    // 2. Get Primary Bank Account ID
    // The Edge Function requires bank_account_id to process the payout
    const { data: bank } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('partner_id', partnerId)
        .eq('is_primary', true)
        .single()

    if (!bank) {
        return { success: false, message: 'No primary bank account set. Please go to Bank Settings.' }
    }

    console.log('[Payout] Invoking Edge Function request-payout...')

    // 3. Invoke Edge Function
    const { data: result, error: funcError } = await supabase.functions.invoke('request-payout', {
        body: {
            amount: amount,
            bank_account_id: bank.id
        },
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    })

    if (funcError) {
        console.error('[Payout] Function Invocation Error:', funcError)
        return {
            success: false,
            message: funcError.message || 'Failed to connect to payout service'
        }
    }

    if (result && !result.success) {
        console.error('[Payout] Function Execution Error:', result)
        // Pass through the error message from the Edge Function (e.g., "Insufficient balance")
        return {
            success: false,
            message: result.error?.message || result.message || 'Payout request failed'
        }
    }

    console.log('[Payout] Success:', result)
    revalidatePath('/organizer/payouts')
    return { success: true, message: 'Payout request processed successfully.' }
}

/**
 * Cancel a pending payout request.
 * Only allowed when status is 'pending_request'.
 * Unlinks transactions so funds become available again.
 */
export async function cancelPayoutRequest(payoutId: string) {
    const supabase = await createClient()

    const { user } = await getAuthUser()
    if (!user) return { success: false, message: 'Unauthorized' }

    // 1. Fetch payout and verify ownership
    const { data: payout, error: fetchError } = await supabase
        .from('payouts')
        .select('id, status, partner_id')
        .eq('id', payoutId)
        .single()

    if (fetchError || !payout) {
        return { success: false, message: 'Payout not found' }
    }

    // 2. Verify the payout belongs to this user's partner account
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner || partner.id !== payout.partner_id) {
        return { success: false, message: 'Unauthorized' }
    }

    // 3. Only allow cancellation of pending_request
    if (payout.status !== 'pending_request') {
        return {
            success: false,
            message: `Cannot cancel a payout that is already ${payout.status.replace('_', ' ')}.`
        }
    }

    // 4. Cancel + unlink transactions atomically
    const { error: cancelError } = await supabase
        .from('payouts')
        .update({ status: 'cancelled' })
        .eq('id', payoutId)
        .eq('status', 'pending_request') // Optimistic concurrency — prevent race condition

    if (cancelError) {
        return { success: false, message: 'Failed to cancel payout. Please try again.' }
    }

    // 5. Unlink transactions so funds are freed
    await supabase
        .from('transactions')
        .update({ payout_id: null })
        .eq('payout_id', payoutId)

    await supabase
        .from('experience_transactions')
        .update({ payout_id: null })
        .eq('payout_id', payoutId)

    revalidatePath('/organizer/payouts')
    return { success: true, message: 'Payout request cancelled successfully.' }
}
