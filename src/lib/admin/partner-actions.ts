'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

export type XenditStatusReport = {
    ok: boolean
    stage: string
    local: Record<string, any>
    xendit?: Record<string, any>
    discrepancies: string[]
    blockers: string[]
}

/**
 * Read-only: ask Xendit what it actually knows about this partner.
 *
 * The Xendit secret lives only in the edge-function secrets, so the check has to
 * happen there. Nothing is written to Xendit or to our DB — it reports drift and
 * lets an admin decide.
 */
export async function getXenditAccountStatus(
    partnerId: string
): Promise<{ report?: XenditStatusReport; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.functions.invoke('xendit-account-status', {
        body: { partner_id: partnerId },
    })

    if (error) {
        // Edge errors arrive as an opaque FunctionsHttpError; surface the body when we can.
        let detail = error.message
        try {
            const body = await (error as any).context?.json?.()
            if (body?.error) detail = body.message ? `${body.error}: ${body.message}` : body.error
        } catch { /* keep the original message */ }
        return { error: detail }
    }
    if (data?.error) return { error: data.message ? `${data.error}: ${data.message}` : data.error }

    return { report: data as XenditStatusReport }
}

export type PartnerKycDoc = {
    id: string
    doc_type: string
    owner_kind: string
    owner_name: string | null
    created_at: string
    url: string | null
}

/**
 * Every KYC document a partner has uploaded, with short-lived signed URLs.
 *
 * The verifications queue can only show partners sitting at 'pending_review', so
 * documents belonging to anyone in another state (e.g. a partner approved before
 * they uploaded) were unreachable in the UI despite being stored correctly.
 */
export async function getPartnerKycDocuments(
    partnerId: string
): Promise<{ docs?: PartnerKycDoc[]; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminUser } = await supabase
        .from('users').select('is_admin').eq('id', user.id).single()
    if (!adminUser?.is_admin) return { error: 'Forbidden' }

    const { data: rows, error } = await supabase
        .from('partner_kyc_documents')
        .select('id, doc_type, owner_kind, owner_id, storage_path, created_at')
        .eq('partner_id', partnerId)
        .order('owner_kind')
        .order('doc_type')
    if (error) return { error: error.message }
    if (!rows?.length) return { docs: [] }

    // Name the person a stakeholder document belongs to, so several people's IDs
    // in one list stay tellable apart.
    const stakeholderIds = [...new Set(rows.map(r => r.owner_id).filter(Boolean))] as string[]
    const names = new Map<string, string>()
    if (stakeholderIds.length) {
        const { data: sh } = await supabase
            .from('partner_stakeholders')
            .select('id, first_name, last_name')
            .in('id', stakeholderIds)
        for (const s of sh ?? []) names.set(s.id, [s.first_name, s.last_name].filter(Boolean).join(' '))
    }

    const admin = createAdminClient()
    const docs = await Promise.all(rows.map(async (r) => {
        let url: string | null = null
        try {
            const { data } = await admin.storage
                .from('kyc-documents')
                .createSignedUrl(r.storage_path, 3600)
            url = data?.signedUrl ?? null
        } catch { /* a missing object shouldn't hide the rest of the list */ }
        return {
            id: r.id,
            doc_type: r.doc_type,
            owner_kind: r.owner_kind,
            owner_name: r.owner_id ? (names.get(r.owner_id) ?? null) : null,
            created_at: r.created_at,
            url,
        }
    }))

    return { docs }
}

/**
 * Replace a single KYC document a partner uploaded (wrong file, unreadable scan,
 * expired ID). Admin-only.
 *
 * The subtle part is NOT the upload — it's cache invalidation. submit-xendit-kyc skips
 * re-uploading a file when partner_gateway_accounts.file_ids already has an entry for
 * that storage path. We write the replacement to a NEW path (so the original stays
 * recoverable) and drop the OLD path's entry, otherwise the stale mapping lingers and
 * the "documents uploaded" count silently disagrees with what Xendit actually holds.
 *
 * We also do NOT touch a 'verified' partner's status: silently un-verifying a live
 * partner would strip capabilities. For 'submitted', the submission is genuinely stale
 * once a document changes, and submit-xendit-kyc refuses to run at that status — so it
 * returns to 'pending_review' and the caller is told to resubmit.
 */
export async function replacePartnerKycDocument(
    formData: FormData
): Promise<{ success?: boolean; message?: string; warning?: string; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminUser } = await supabase
        .from('users').select('is_admin').eq('id', user.id).single()
    if (!adminUser?.is_admin) return { error: 'Forbidden' }

    const docId = formData.get('doc_id') as string
    const file = formData.get('file') as File | null
    if (!docId) return { error: 'Missing document id' }
    if (!file || file.size === 0) return { error: 'Choose a file to upload.' }

    // Bucket limits: 5MB, jpeg/png/pdf. Fail here with a readable message rather than
    // letting storage reject it with an opaque one.
    const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf']
    if (!ALLOWED.includes(file.type)) {
        return { error: `Unsupported file type (${file.type || 'unknown'}). Use JPEG, PNG or PDF.` }
    }
    if (file.size > 5 * 1024 * 1024) {
        return { error: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.` }
    }

    const admin = createAdminClient()

    const { data: doc } = await admin
        .from('partner_kyc_documents')
        .select('id, partner_id, doc_type, storage_path')
        .eq('id', docId)
        .single()
    if (!doc) return { error: 'Document not found' }

    const { data: partner } = await admin
        .from('partners')
        .select('id, kyc_status, business_name')
        .eq('id', doc.partner_id)
        .single()
    if (!partner) return { error: 'Partner not found' }

    // Keep the partner's own folder prefix — the storage bucket's RLS and the
    // organizer form's own-folder guard both key off that first path segment.
    const folder = String(doc.storage_path).split('/')[0]
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const newPath = `${folder}/${doc.doc_type.toLowerCase()}-${Date.now()}-admin.${ext}`

    const { error: upErr } = await admin.storage
        .from('kyc-documents')
        .upload(newPath, file, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Upload failed: ${upErr.message}` }

    const { error: rowErr } = await admin
        .from('partner_kyc_documents')
        .update({ storage_path: newPath })
        .eq('id', docId)
    if (rowErr) {
        // Roll the object back so a failed swap doesn't leave an orphan in the bucket.
        await admin.storage.from('kyc-documents').remove([newPath])
        return { error: `Could not update the document record: ${rowErr.message}` }
    }

    // Drop the superseded path -> Xendit file id mapping.
    const { data: gateway } = await admin
        .from('partner_gateway_accounts')
        .select('file_ids')
        .eq('partner_id', doc.partner_id).eq('provider', 'xendit')
        .maybeSingle()

    if (gateway?.file_ids && typeof gateway.file_ids === 'object') {
        const fileIds = { ...(gateway.file_ids as Record<string, string>) }
        if (doc.storage_path in fileIds) {
            delete fileIds[doc.storage_path]
            await admin
                .from('partner_gateway_accounts')
                .update({ file_ids: fileIds, updated_at: new Date().toISOString() })
                .eq('partner_id', doc.partner_id).eq('provider', 'xendit')
        }
    }

    let warning: string | undefined
    if (partner.kyc_status === 'submitted') {
        await admin.from('partners')
            .update({ kyc_status: 'pending_review' })
            .eq('id', doc.partner_id)
        warning = 'KYC was already submitted, so it has been moved back to pending review. Press "Submit KYC to Xendit" again to send the corrected document.'
    } else if (partner.kyc_status === 'verified') {
        warning = 'This partner is already VERIFIED — the new file is stored but Xendit still holds the old one. Status left untouched so their capabilities are not revoked; contact Xendit if the verified record must change.'
    }

    revalidatePath('/admin/partners')
    revalidatePath('/admin/verifications')

    return { success: true, message: `Replaced ${doc.doc_type.replace(/_/g, ' ')}.`, warning }
}

export type PartnerKycDetails = {
    tax_id?: string
    street_line1?: string
    street_line2?: string
    city?: string
    province_state?: string
    postal_code?: string
}

/**
 * Admin fill-in for the business details Xendit needs but the KYC form never
 * collected (TIN + business address). Lets us complete a partner's record without
 * making them redo the whole verification form.
 *
 * Blank fields are skipped rather than written as null, so a partial save can't
 * wipe data the partner already provided.
 */
export async function updatePartnerKycDetails(
    partnerId: string,
    details: PartnerKycDetails
): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminUser } = await supabase
        .from('users').select('is_admin').eq('id', user.id).single()
    if (!adminUser?.is_admin) return { error: 'Forbidden' }

    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(details)) {
        const trimmed = (value ?? '').trim()
        if (trimmed) updates[key] = trimmed
    }
    if (Object.keys(updates).length === 0) return { error: 'Nothing to save.' }

    const { error } = await supabase.from('partners').update(updates).eq('id', partnerId)
    if (error) return { error: error.message }

    return { success: true }
}

/**
 * Create this partner's Xendit sub-account on demand.
 *
 * Sub-accounts are normally created inside approvePartner(), so a partner approved
 * before that step existed — or whose creation call failed at the time — has no way
 * back: "Submit KYC to Xendit" is disabled without one. This is that way back.
 *
 * Idempotent: the edge function returns the existing id (already_existed) rather than
 * creating a second account, so a double click cannot orphan a Xendit account.
 *
 * Does NOT change use_main_wallet. Owning a sub-account and settling through it are
 * separate decisions — create-purchase-intent routes on the wallet flag, not on the
 * presence of an account id — so a main-wallet partner keeps settling to the main
 * account until that flag is deliberately flipped.
 */
export async function createPartnerXenditSubaccount(
    partnerId: string
): Promise<{ success?: boolean; message?: string; xenditAccountId?: string; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.functions.invoke('create-xendit-subaccount', {
        body: { partner_id: partnerId },
    })

    if (error) {
        let detail = error.message
        try {
            const body = await (error as any).context?.json?.()
            if (body?.error) detail = body.details ? `${body.error} — ${JSON.stringify(body.details)}` : body.error
        } catch { /* keep the original message */ }
        return { error: detail }
    }
    if (data?.error) return { error: data.details ? `${data.error} — ${JSON.stringify(data.details)}` : data.error }

    revalidatePath('/admin/partners')

    return {
        success: true,
        xenditAccountId: data?.xendit_account_id,
        message: data?.already_existed
            ? `Sub-account already existed: ${data.xendit_account_id}`
            : `Xendit sub-account created: ${data?.xendit_account_id}`,
    }
}

/**
 * Send this partner's stored KYC documents to Xendit (legacy account_holder flow).
 *
 * This is a real, outward-facing submission of the partner's PII — it exists as an
 * explicit admin action because the only other trigger is the approve path, which
 * has already fired for partners who submitted their documents after approval.
 */
export async function submitPartnerKycToXendit(
    partnerId: string
): Promise<{ success?: boolean; message?: string; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.functions.invoke('submit-xendit-kyc', {
        body: { partner_id: partnerId },
    })

    if (error) {
        let detail = error.message
        try {
            const body = await (error as any).context?.json?.()
            if (body?.error) detail = body.details ? `${body.error} — ${JSON.stringify(body.details)}` : body.error
        } catch { /* keep the original message */ }
        return { error: detail }
    }
    if (data?.error) return { error: data.details ? `${data.error} — ${JSON.stringify(data.details)}` : data.error }

    return { success: true, message: data?.message || 'KYC submitted to Xendit.' }
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
 * Set the auto-approve payouts flag for a partner.
 *
 * Writes `auto_approve_enabled` — the column request-payout actually reads. This
 * used to write `auto_approve_payouts`, which NOTHING in the money path consults,
 * so the toggle saved, the UI showed it on, and every payout still queued for
 * manual review. Seven partners were granted auto-approve that way and none of
 * them had it. `auto_approve_payouts` is now vestigial; do not reintroduce it.
 */
export async function setAutoApprovePayouts(partnerId: string, autoApprove: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partners')
        .update({
            auto_approve_enabled: autoApprove,
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
/**
 * Switch a partner between settling into their own Xendit sub-wallet and settling
 * into the HangHut main account (ledger-tracked, paid out by disbursement).
 *
 * Main-wallet mode also unlocks Cards/GCash at checkout without per-sub-account
 * capability onboarding — see create-purchase-intent's channel list.
 *
 * The dangerous move is switching a partner that HAS a sub-account: their earnings
 * physically sit in that wallet, but the main-wallet path computes balance from the
 * transactions ledger and disburses from the platform account — so we'd pay them
 * from our own funds while their money stays stranded. Blocked unless forced.
 */
export async function setPartnerWalletMode(
    partnerId: string,
    useMainWallet: boolean,
    force = false
): Promise<{ success: true } | { success: false; reason: string }> {
    const supabase = await createClient()

    const { data: partner, error: readError } = await supabase
        .from('partners')
        .select('xendit_account_id, business_name')
        .eq('id', partnerId)
        .single()

    if (readError || !partner) throw new Error('Partner not found')

    if (useMainWallet && partner.xendit_account_id && !force) {
        return {
            success: false,
            reason:
                `${partner.business_name} has a Xendit sub-account (${partner.xendit_account_id}). ` +
                `Any balance sitting in it becomes unreachable from the payouts page once switched, ` +
                `and payouts would be disbursed from the platform account instead. ` +
                `Drain the sub-wallet first, or confirm to override.`,
        }
    }

    const { error } = await supabase
        .from('partners')
        .update({ use_main_wallet: useMainWallet })
        .eq('id', partnerId)

    if (error) {
        console.error('Error setting use_main_wallet:', error)
        throw new Error('Failed to update wallet mode')
    }

    return { success: true }
}

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
