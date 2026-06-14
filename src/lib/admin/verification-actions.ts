'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Admin-only helper to get signed URL for private docs
export async function getDocumentUrl(path: string) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) throw new Error('Config Error')

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Create a signed URL valid for 1 hour
    const { data, error } = await adminSupabase.storage
        .from('kyc-documents')
        .createSignedUrl(path, 3600)

    if (error) throw new Error(error.message)
    return data.signedUrl
}

export async function reviewKYC(
    partnerId: string,
    action: 'approve' | 'reject',
    reason?: string,
    feePercentage?: number,
    passFeesToCustomer?: boolean
) {
    const supabase = await createClient()

    // 1. Admin Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Double check admin role
    const { data: adminUser } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!adminUser?.is_admin) return { error: 'Forbidden' }

    // 2. Perform Update
    //
    // Platform approval (verified / status) is SEPARATE from payment-KYC (kyc_status):
    //  - Approve grants platform access (verified=true, status=approved) but must NOT
    //    pre-set kyc_status='verified' — that is Xendit's call. We leave kyc_status as
    //    the partner left it ('pending_review') so submit-xendit-kyc can actually run
    //    (it bails if kyc_status is already 'submitted'/'verified'). That edge function
    //    sets kyc_status='submitted'; the xendit-webhook then flips it to verified/rejected.
    //  - Reject marks the documents rejected locally, before they ever reach Xendit.
    const updates: any = {
        verified: action === 'approve', // platform access gate (NOT payment KYC)
        approved_by: action === 'approve' ? user.id : null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        status: action === 'approve' ? 'approved' : 'pending',
        custom_percentage: action === 'approve' ? (feePercentage ?? 4) : null,
        pass_fees_to_customer: action === 'approve' ? (passFeesToCustomer ?? true) : null,
    }

    if (action === 'reject') {
        updates.kyc_status = 'rejected'
        updates.kyc_rejection_reason = reason
    } else {
        // Leave kyc_status untouched (stays 'pending_review') so submit-xendit-kyc runs.
        updates.kyc_rejection_reason = null
    }

    const { error } = await supabase
        .from('partners')
        .update(updates)
        .eq('id', partnerId)

    if (error) return { error: error.message }

    // 3. If approved, ensure a Xendit sub-account exists, then submit KYC to Xendit.
    //    create-xendit-subaccount is idempotent; submit-xendit-kyc sets kyc_status to
    //    'submitted' and the xendit-webhook finalizes it to verified/rejected.
    let warning: string | null = null
    if (action === 'approve') {
        try {
            const { error: subAccountError } = await supabase.functions.invoke(
                'create-xendit-subaccount',
                { body: { partner_id: partnerId } }
            )

            if (subAccountError) {
                console.warn('[XenPlatform] Sub-account creation failed for partner:', partnerId, subAccountError)
                warning = 'Partner approved, but creating their Xendit sub-account failed. Retry from the partner dashboard.'
            } else {
                const { error: kycError } = await supabase.functions.invoke(
                    'submit-xendit-kyc',
                    { body: { partner_id: partnerId } }
                )
                if (kycError) {
                    console.warn('[XenPlatform] KYC submission failed for partner:', partnerId, kycError)
                    warning = 'Partner approved, but KYC was not submitted to Xendit (often missing documents). GCash/card stay locked until KYC is completed and resubmitted.'
                } else {
                    console.log('[XenPlatform] KYC submitted to Xendit for partner:', partnerId)
                }
            }
        } catch (xenditErr) {
            console.warn('[XenPlatform] Xendit onboarding error for partner:', partnerId, xenditErr)
            warning = 'Partner approved, but Xendit onboarding hit an error. Retry from the partner dashboard.'
        }
    }

    revalidatePath('/admin/verifications')
    return { success: true, warning }
}
