'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'

/**
 * Get wallet info for the current organizer, including:
 * - Xendit sub-account balance (available + pending settlement)
 * - Platform fee receivable (owed to HangHut)
 * - KYC status
 */
export async function getWalletInfo(partnerId: string) {
    const supabase = await createClient()

    // 1. Get partner basics from DB
    const { data: partner, error } = await supabase
        .from('partners')
        .select('xendit_account_id, platform_fee_receivable, kyc_status, use_main_wallet')
        .eq('id', partnerId)
        .single()

    if (error || !partner) {
        return {
            xenditAccountId: null,
            receivable: 0,
            kycStatus: null,
            xenditAvailableBalance: 0,
            pendingSettlement: 0,
            useMainWallet: false,
        }
    }

    // 2. Main-wallet partners (e.g. Acme Events) settle directly into the HangHut
    //    main Xendit account — there is no per-partner sub-account balance to fetch.
    //    Skip the API call entirely; the payouts page uses the transactions ledger instead.
    let xenditAvailableBalance = 0
    let pendingSettlement = 0

    if (partner.xendit_account_id && !partner.use_main_wallet) {
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                'get-subaccount-balance',
                { body: { partner_id: partnerId } }
            )

            if (!fnError && data) {
                xenditAvailableBalance = data.available_balance || 0
                pendingSettlement = data.pending_settlement || 0
            }
        } catch (err) {
            console.error('[Wallet] Failed to fetch Xendit balance:', err)
        }
    }

    return {
        xenditAccountId: partner.xendit_account_id,
        receivable: Number(partner.platform_fee_receivable) || 0,
        kycStatus: partner.kyc_status,
        xenditAvailableBalance,
        pendingSettlement,
        useMainWallet: partner.use_main_wallet ?? false,
    }
}

/**
 * Refresh real Xendit settlement status onto this partner's recent intents.
 * Best-effort + non-blocking: on any failure the UI simply keeps showing the
 * honest T+N estimate. Returns how many transactions got real data written.
 */
export async function syncSettlements(partnerId: string): Promise<{ updated: number }> {
    const supabase = await createClient()
    try {
        const { data, error } = await supabase.functions.invoke('sync-settlements', {
            body: { partner_id: partnerId },
        })
        if (error) {
            console.error('[Settlement] sync failed:', error)
            return { updated: 0 }
        }
        return { updated: Number(data?.updated) || 0 }
    } catch (err) {
        console.error('[Settlement] sync error:', err)
        return { updated: 0 }
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
