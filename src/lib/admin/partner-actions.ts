'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Approve a pending partner application
 */
export async function approvePartner(partnerId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            verified: true,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error approving partner:', error)
        throw new Error('Failed to approve partner')
    }

    return { success: true }
}

/**
 * Reject a partner application
 */
export async function rejectPartner(partnerId: string, reason: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            status: 'rejected',
            admin_notes: reason,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error rejecting partner:', error)
        throw new Error('Failed to reject partner')
    }

    return { success: true }
}

/**
 * Suspend an approved partner
 */
export async function suspendPartner(partnerId: string, reason: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            status: 'suspended',
            admin_notes: reason,
            verified: false,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error suspending partner:', error)
        throw new Error('Failed to suspend partner')
    }

    return { success: true }
}

/**
 * Reactivate a suspended partner
 */
export async function reactivatePartner(partnerId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            status: 'approved',
            verified: true,
            admin_notes: null,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error reactivating partner:', error)
        throw new Error('Failed to reactivate partner')
    }

    return { success: true }
}

/**
 * Set custom pricing for a partner
 */
export async function setCustomPricing(
    partnerId: string,
    percentage: number,
    passFeesToCustomer: boolean = false,
    fixedFeePerTicket: number = 15.00
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            pricing_model: 'custom',
            custom_percentage: percentage,
            pass_fees_to_customer: passFeesToCustomer,
            fixed_fee_per_ticket: fixedFeePerTicket,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting custom pricing:', error)
        throw new Error('Failed to set custom pricing')
    }

    return { success: true }
}

/**
 * Reset partner to standard pricing
 */
export async function resetToStandardPricing(partnerId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            pricing_model: 'standard',
            custom_percentage: null,
            pass_fees_to_customer: false,
            fixed_fee_per_ticket: 15.00,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error resetting pricing:', error)
        throw new Error('Failed to reset pricing')
    }

    return { success: true }
}
