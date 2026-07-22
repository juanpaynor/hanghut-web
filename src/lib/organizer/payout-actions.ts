'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { executeXenditPayout } from '@/lib/payment/xendit-payouts'
import { BankCode } from '@/lib/constants/banks'
import { getAuthUser } from '@/lib/auth/cached'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { PAYOUT_OTP_THRESHOLD } from './payout-constants'

function otpAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

async function hashOtp(code: string): Promise<string> {
    const salt = process.env.OTP_SALT || 'hanghut-otp-salt'
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + salt))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!domain) return email
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local[0]}${local[1]}***@${domain}`
}

/**
 * Step 1 of a payout: email the organizer a 6-digit code bound to this amount.
 * Confirm via requestPayout(partnerId, amount, code) within 5 minutes.
 * Reuses the generic send-otp-code edge function (same as admin login MFA).
 */
export async function sendPayoutOtp(amount: number) {
    if (!amount || amount <= 0) return { success: false, message: 'Invalid payout amount' }

    const { user } = await getAuthUser()
    if (!user) return { success: false, message: 'Unauthorized' }

    const admin = otpAdminClient()

    const { data: userData } = await admin.from('users').select('email').eq('id', user.id).single()
    const email = userData?.email || user.email
    if (!email) return { success: false, message: 'No email on file for verification' }

    // Rate limit: max 3 codes / 15 min per user.
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count } = await admin
        .from('payout_otp_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', fifteenMinAgo)
    if (count && count >= 3) {
        return { success: false, message: 'Too many codes requested. Please wait 15 minutes.' }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const codeHash = await hashOtp(code)

    // Invalidate any prior unused codes for this user.
    await admin.from('payout_otp_codes').update({ used: true }).eq('user_id', user.id).eq('used', false)

    const { error: insertError } = await admin.from('payout_otp_codes').insert({
        user_id: user.id,
        code_hash: codeHash,
        amount,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    if (insertError) {
        console.error('[Payout OTP] insert failed:', insertError)
        return { success: false, message: 'Failed to generate verification code' }
    }

    const { error: sendError } = await admin.functions.invoke('send-otp-code', { body: { email, code, purpose: 'payout' } })
    if (sendError) {
        console.error('[Payout OTP] send failed:', sendError)
        return { success: false, message: 'Failed to send verification email' }
    }

    return { success: true, maskedEmail: maskEmail(email) }
}

export async function requestPayout(partnerId: string, amount: number, otpCode: string) {
    if (amount <= 0) {
        return { success: false, message: 'Invalid payout amount' }
    }

    const supabase = await createClient()

    // 1. Get Auth Session (Required for Edge Function verification)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        return { success: false, message: 'Unauthorized: No active session' }
    }

    // 1b. Payouts above the threshold require an email OTP (bound to this exact
    // amount) before any funds move. Smaller payouts skip verification.
    if (amount > PAYOUT_OTP_THRESHOLD) {
        if (!otpCode || otpCode.trim().length === 0) {
            return { success: false, message: 'Verification code required' }
        }
        const otpAdmin = otpAdminClient()
        const codeHash = await hashOtp(otpCode.trim())
        const { data: otpRow } = await otpAdmin
            .from('payout_otp_codes')
            .select('id, amount')
            .eq('user_id', session.user.id)
            .eq('code_hash', codeHash)
            .eq('used', false)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!otpRow || Number(otpRow.amount) !== Number(amount)) {
            return { success: false, message: 'Invalid or expired verification code. Please request a new one.' }
        }
        // Single-use: consume the code immediately.
        await otpAdmin.from('payout_otp_codes').update({ used: true }).eq('id', otpRow.id)
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

/**
 * Flip who absorbs the platform fee (2% + ₱15/ticket) for the caller's own partner.
 * Backed by the SECURITY DEFINER `set_partner_pass_fees` RPC, which pins the write to
 * exactly that one column for the caller's own partner row (organizers can't touch
 * their rate or Xendit config). Processing fees are always organizer-absorbed and are
 * unaffected by this toggle.
 */
export async function setPassFeesToCustomer(pass: boolean) {
    const { user } = await getAuthUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('set_partner_pass_fees', { p_pass: pass })

    if (error) {
        console.error('setPassFeesToCustomer error:', error)
        return { success: false, error: 'Could not update fee setting.' }
    }
    if (data !== true) {
        return { success: false, error: 'No partner found for this account.' }
    }

    revalidatePath('/organizer/payouts')
    return { success: true }
}
