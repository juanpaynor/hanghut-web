'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { executeXenditPayout } from '@/lib/payment/xendit-payouts'
import { BankCode } from '@/lib/constants/banks'

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
