'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Approve a pending partner application.
 * Also triggers XenPlatform sub-account creation and KYC submission.
 */
export async function approvePartner(partnerId: string) {
    const supabase = await createClient()

    // Step 1: Approve the partner
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

    // Step 2: Create Xendit sub-account (XenPlatform)
    let xenditWarning: string | null = null
    try {
        const { data: subAccountResult, error: subAccountError } = await supabase.functions.invoke(
            'create-xendit-subaccount',
            { body: { partner_id: partnerId } }
        )

        if (subAccountError) {
            console.warn('[XenPlatform] Sub-account creation failed:', subAccountError)
            xenditWarning = 'Partner approved but Xendit sub-account creation failed. You can retry from the dashboard.'
        } else {
            console.log('[XenPlatform] Sub-account created:', subAccountResult)

            // Step 3: Submit KYC docs to Xendit (only if sub-account was created)
            try {
                const { data: kycResult, error: kycError } = await supabase.functions.invoke(
                    'submit-xendit-kyc',
                    { body: { partner_id: partnerId } }
                )

                if (kycError) {
                    console.warn('[XenPlatform] KYC submission failed:', kycError)
                    xenditWarning = 'Sub-account created but KYC submission failed. Documents can be submitted later.'
                } else {
                    console.log('[XenPlatform] KYC submitted:', kycResult)
                }
            } catch (kycErr) {
                console.warn('[XenPlatform] KYC submission error:', kycErr)
                xenditWarning = 'Sub-account created but KYC submission failed. Documents can be submitted later.'
            }
        }
    } catch (xenditErr) {
        console.warn('[XenPlatform] Sub-account creation error:', xenditErr)
        xenditWarning = 'Partner approved but Xendit sub-account creation failed. You can retry from the dashboard.'
    }

    return { success: true, warning: xenditWarning }
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
 * Set custom pricing for a partner.
 * Also creates a matching Xendit split rule for payment splitting.
 */
export async function setCustomPricing(
    partnerId: string,
    percentage: number,
    passFixedToCustomer: boolean = true,
    passPercentageToCustomer: boolean = false,
    fixedFeePerTicket: number = 15.00
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            pricing_model: 'custom',
            custom_percentage: percentage,
            pass_fixed_to_customer: passFixedToCustomer,
            pass_percentage_to_customer: passPercentageToCustomer,
            pass_fees_to_customer: passFixedToCustomer || passPercentageToCustomer,
            fixed_fee_per_ticket: fixedFeePerTicket,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting custom pricing:', error)
        throw new Error('Failed to set custom pricing')
    }

    // Create/update Xendit split rule — this MUST stay in sync with the DB percentage
    let splitRuleWarning: string | null = null
    try {
        const { data, error: splitError } = await supabase.functions.invoke(
            'create-split-rule',
            { body: { partner_id: partnerId, platform_percentage: percentage } }
        )

        if (splitError) {
            console.error('[SplitRule] FAILED to create split rule:', splitError)
            splitRuleWarning = `Pricing updated but Xendit split rule failed to sync. Payments may not split correctly until this is resolved. Error: ${splitError.message || 'Unknown'}`
        } else if (!data?.split_rule_id) {
            console.error('[SplitRule] No split_rule_id returned')
            splitRuleWarning = 'Pricing updated but Xendit did not return a split rule ID. Check the edge function logs.'
        } else {
            // Save the split rule ID
            const { error: updateError } = await supabase
                .from('partners')
                .update({ split_rule_id: data.split_rule_id })
                .eq('id', partnerId)

            if (updateError) {
                console.error('[SplitRule] Failed to save split_rule_id:', updateError)
                splitRuleWarning = `Split rule created (${data.split_rule_id}) but failed to save to DB.`
            } else {
                console.log('[SplitRule] Created for partner:', partnerId, 'rule:', data.split_rule_id)
            }
        }
    } catch (err) {
        console.error('[SplitRule] Exception creating split rule:', err)
        splitRuleWarning = `Pricing updated but split rule creation threw an error. Payments may not split correctly.`
    }

    return { success: true, warning: splitRuleWarning }
}

/**
 * Reset partner to standard pricing (4%).
 * Also creates a Xendit split rule for the standard 4% tier.
 */
export async function resetToStandardPricing(partnerId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            pricing_model: 'standard',
            custom_percentage: null,
            pass_fixed_to_customer: true,
            pass_percentage_to_customer: false,
            pass_fees_to_customer: true,
            fixed_fee_per_ticket: 15.00,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error resetting pricing:', error)
        throw new Error('Failed to reset pricing')
    }

    // Create/update Xendit split rule for standard 4%
    let splitRuleWarning: string | null = null
    try {
        const { data, error: splitError } = await supabase.functions.invoke(
            'create-split-rule',
            { body: { partner_id: partnerId, platform_percentage: 4 } }
        )

        if (splitError) {
            console.error('[SplitRule] FAILED to reset split rule:', splitError)
            splitRuleWarning = `Pricing reset but Xendit split rule failed to sync. Error: ${splitError.message || 'Unknown'}`
        } else if (!data?.split_rule_id) {
            splitRuleWarning = 'Pricing reset but Xendit did not return a split rule ID.'
        } else {
            const { error: updateError } = await supabase
                .from('partners')
                .update({ split_rule_id: data.split_rule_id })
                .eq('id', partnerId)

            if (updateError) {
                splitRuleWarning = `Split rule created (${data.split_rule_id}) but failed to save to DB.`
            } else {
                console.log('[SplitRule] Reset to standard for partner:', partnerId)
            }
        }
    } catch (err) {
        console.error('[SplitRule] Error creating standard split rule:', err)
        splitRuleWarning = 'Pricing reset but split rule creation threw an error.'
    }

    return { success: true, warning: splitRuleWarning }
}

/**
 * Set partner capabilities (organizer, experience_host, or both)
 */
export async function setPartnerCapabilities(partnerId: string, capabilities: string[]) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({ capabilities })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting partner capabilities:', error)
        throw new Error('Failed to set partner capabilities')
    }

    return { success: true }
}

/**
 * Set auto-approve payouts flag for a partner
 */
export async function setAutoApprovePayouts(partnerId: string, autoApprove: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            auto_approve_payouts: autoApprove,
        })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting auto-approve payouts:', error)
        throw new Error('Failed to set auto-approve payouts')
    }

    return { success: true }
}

// Feature-gate the subscription/membership product per partner while recurring
// billing is finalized. New partners default OFF; admins flip this on per org.
export async function setSubscriptionsEnabled(partnerId: string, enabled: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({ subscriptions_enabled: enabled })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting subscriptions_enabled:', error)
        throw new Error('Failed to update subscriptions access')
    }

    return { success: true }
}

// Feature-gate merch selling per partner (controlled rollout). Off by default;
// admins enable it per organizer. Gates the organizer merch tools + buyer surfaces.
export async function setMerchEnabled(partnerId: string, enabled: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({ merch_enabled: enabled })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting merch_enabled:', error)
        throw new Error('Failed to update merch access')
    }

    return { success: true }
}
