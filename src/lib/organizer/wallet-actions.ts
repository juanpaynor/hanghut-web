'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'

/**
 * Get wallet info for the current organizer, including:
 * - Xendit sub-account ID
 * - Platform fee receivable (owed to HangHut)
 */
export async function getWalletInfo(partnerId: string) {
    const supabase = await createClient()

    const { data: partner, error } = await supabase
        .from('partners')
        .select('xendit_account_id, platform_fee_receivable, kyc_status')
        .eq('id', partnerId)
        .single()

    if (error || !partner) {
        return { xenditAccountId: null, receivable: 0, kycStatus: null }
    }

    return {
        xenditAccountId: partner.xendit_account_id,
        receivable: Number(partner.platform_fee_receivable) || 0,
        kycStatus: partner.kyc_status,
    }
}

/**
 * Initiate a wallet top-up by invoking the topup-wallet edge function.
 * Returns a payment URL that the organizer can use to pay.
 */
export async function initiateTopUp(amount: number) {
    const supabase = await createClient()

    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return { error: 'Partner not found' }

    // Validate amount
    if (amount < 100) return { error: 'Minimum top-up is ₱100' }
    if (amount > 500000) return { error: 'Maximum top-up is ₱500,000' }

    try {
        const { data, error } = await supabase.functions.invoke('topup-wallet', {
            body: { partner_id: partnerId, amount }
        })

        if (error) {
            console.error('[TopUp] Edge function error:', error)
            return { error: 'Failed to create top-up. Please try again.' }
        }

        return { paymentUrl: data?.payment_url || data?.invoice_url }
    } catch (err) {
        console.error('[TopUp] Error:', err)
        return { error: 'Something went wrong. Please try again.' }
    }
}
