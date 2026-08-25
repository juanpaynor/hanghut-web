'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
    requiresStakeholders,
    isSinglePerson,
    type StructuredAddress,
} from './kyc-constants'

export type KYCFormState = {
    errors?: Record<string, string[]>
    message?: string
    success?: boolean
}

// Shape the form serializes into the `profile` / `stakeholders` JSON fields.
type PersonProfile = {
    first_name?: string
    last_name?: string
    gender?: string
    date_of_birth?: string
    role?: string
    nationality?: string
    email?: string
    mobile_country_code?: string
    mobile_number?: string
    address?: StructuredAddress
    id_type?: string
    id_number?: string
}
type ContactProfile = {
    first_name?: string
    last_name?: string
    email?: string
    mobile_country_code?: string
    mobile_number?: string
}
type BusinessProfile = {
    industry_subcategory?: string
    establishment_date?: string
    intents?: string[]
    source_of_funds?: string[]
    average_monthly_basket_size?: string
    money_out_frequency?: string
    phone_country_code?: string
    phone_number?: string
    legal_entity_address?: StructuredAddress | null
    business_address?: StructuredAddress | null
    tax_id?: string
    /** SEC/DTI registration number — Required by /account_verification. */
    registration_number?: string
    /** Factual business description for KYC review (not storefront copy). */
    business_description?: string
    /** Drives whether a shareholding-chart document is also required. */
    shareholders_include_corporate_entity?: boolean
}
type StakeholderInput = {
    roles: string[]
    first_name: string
    last_name: string
    nationality?: string
    date_of_birth?: string
    is_authorized_person?: boolean
    address?: StructuredAddress
    id_type?: string
    id_number?: string
}

function parseJSON<T>(raw: FormDataEntryValue | null, fallback: T): T {
    if (typeof raw !== 'string' || !raw) return fallback
    try { return JSON.parse(raw) as T } catch { return fallback }
}

export async function submitKYCVerification(
    prevState: KYCFormState | undefined,
    formData: FormData
): Promise<KYCFormState> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Unauthorized session.' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { message: 'Server Config Error' }
    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // ── Resolve WHICH partner this submission is for ─────────────────────────
    // Normally the caller's own partner record. An admin may instead pass
    // `partnerId` to complete or correct a submission on a partner's behalf —
    // KYC stalls constantly on fields a client can't interpret, and the
    // alternative is screen-sharing through someone's tax documents.
    //
    // The admin check reads is_admin with the SERVICE ROLE client on purpose: the
    // caller must not be able to influence the row that authorises them.
    const requestedPartnerId = (formData.get('partnerId') as string) || ''
    let actingAsAdmin = false

    if (requestedPartnerId) {
        const { data: caller } = await adminSupabase
            .from('users').select('is_admin').eq('id', user.id).single()
        if (!caller?.is_admin) return { message: 'Not authorized to submit for another partner.' }
        actingAsAdmin = true
    }

    const partnerQuery = adminSupabase.from('partners').select('id, business_type')
    const { data: partner } = requestedPartnerId
        ? await partnerQuery.eq('id', requestedPartnerId).single()
        : await partnerQuery.eq('user_id', user.id).single()
    if (!partner) return { message: 'Partner profile not found.' }

    // ── Parse submission ─────────────────────────────────────────────────────
    const entityType = (formData.get('entityType') as string) || partner.business_type || ''
    const authorized = parseJSON<PersonProfile>(formData.get('authorizedPerson'), {})
    const contact = parseJSON<ContactProfile>(formData.get('contactPerson'), {})
    const business = parseJSON<BusinessProfile>(formData.get('business'), {})
    const stakeholders = parseJSON<StakeholderInput[]>(formData.get('stakeholders'), [])
    // reuse: map of "<scope>:<doc_type>[:<stakeholderIndex>]" -> existing storage path
    const reuse = parseJSON<Record<string, string>>(formData.get('reuse'), {})
    // uploaded: docs uploaded THIS session — the browser uploads straight to the
    // kyc-documents bucket (avoids Vercel's ~4.5MB server-action body limit), so we
    // receive slot -> storage_path instead of the files themselves.
    const uploaded = parseJSON<Record<string, string>>(formData.get('uploaded'), {})

    // ── Validate per entity type ─────────────────────────────────────────────
    const errors: Record<string, string[]> = {}
    if (!entityType) errors.entityType = ['Business type is required']
    if (!authorized.first_name?.trim() || !authorized.last_name?.trim())
        errors.authorizedPerson = ['Authorized person full name is required']
    if (!authorized.date_of_birth) errors.authorizedDob = ['Authorized person date of birth is required']
    if (!business.intents?.length) errors.intents = ['Select at least one business intent']
    if (!business.source_of_funds?.length) errors.sourceOfFunds = ['Select at least one source of funds']
    if (!business.money_out_frequency) errors.moneyOut = ['Money-out frequency is required']
    // Xendit needs an address on the business entity; without it the account_holder
    // payload silently omits `address` and the review stalls.
    if (!business.business_address?.street_line1?.trim() || !business.business_address?.city?.trim())
        errors.businessAddress = ['Business street address and city are required']

    if (requiresStakeholders(entityType)) {
        const roles = new Set(stakeholders.flatMap(s => s.roles || []))
        if (!stakeholders.length) errors.stakeholders = ['At least one stakeholder is required']
        if (!roles.has('BOARD_DIRECTOR')) errors.stakeholderRoles = ['A BOARD_DIRECTOR stakeholder is required']
        if (!roles.has('BUSINESS_OWNER')) errors.stakeholderOwner = ['A BUSINESS_OWNER stakeholder is required']
    }

    if (Object.keys(errors).length > 0) return { errors, message: 'Please complete the required fields.' }

    // ── Persist business + person profile on partners ────────────────────────
    const authFullName = [authorized.first_name, authorized.last_name].filter(Boolean).join(' ').trim()
    const updateData: Record<string, any> = {
        business_type: entityType,
        representative_name: authFullName || undefined, // keep legacy column in sync for admin list
        business_industry_subcategory: business.industry_subcategory || null,
        business_establishment_date: business.establishment_date || null,
        business_intents: business.intents || null,
        business_source_of_funds: business.source_of_funds || null,
        business_average_monthly_basket_size: business.average_monthly_basket_size || null,
        money_out_transaction_frequency: business.money_out_frequency || null,
        business_phone_country_code: business.phone_country_code || null,
        business_phone_number: business.phone_number || null,
        legal_entity_address: business.legal_entity_address || null,
        authorized_person_first_name: authorized.first_name || null,
        authorized_person_last_name: authorized.last_name || null,
        authorized_person_gender: authorized.gender || null,
        authorized_person_date_of_birth: authorized.date_of_birth || null,
        authorized_person_role: authorized.role || null,
        authorized_person_nationality: authorized.nationality || null,
        authorized_person_email: authorized.email || null,
        authorized_person_mobile_country_code: authorized.mobile_country_code || null,
        authorized_person_mobile_number: authorized.mobile_number || null,
        authorized_person_address: authorized.address || null,
        authorized_person_identification: (authorized.id_type || authorized.id_number)
            ? { type: authorized.id_type || null, number: authorized.id_number || null }
            : null,
        kyc_status: 'pending_review',
        kyc_rejection_reason: null,
        // New in the /account_verification API — see kyc-constants.
        business_description: business.business_description?.trim() || null,
        shareholders_include_corporate_entity:
            typeof business.shareholders_include_corporate_entity === 'boolean'
                ? business.shareholders_include_corporate_entity
                : null,
        // Who actually filled this in. A partner reading "submitted 14:32" needs to
        // know whether that was them or us, and a rejection six weeks later is much
        // easier to unpick when the record says who typed it.
        kyc_submitted_by_admin: actingAsAdmin,
        kyc_submitted_by: user.id,
        kyc_submitted_at: new Date().toISOString(),
    }

    // TIN gates the Xendit cards capability; blank means "leave what's there"
    // rather than wiping a value an admin may have filled in.
    if (business.tax_id?.trim()) updateData.tax_id = business.tax_id.trim()
    // business_registration_number is Required by /account_verification. The LEGACY
    // account_holders API rejected the field outright, which is why it was never
    // collected and is null on every partner today.
    if (business.registration_number?.trim()) updateData.registration_number = business.registration_number.trim()

    // Single-person entities: authorized person doubles as the contact person.
    if (isSinglePerson(entityType)) {
        updateData.contact_person_first_name = authorized.first_name || null
        updateData.contact_person_last_name = authorized.last_name || null
        updateData.contact_person_email = authorized.email || null
        updateData.contact_person_mobile_country_code = authorized.mobile_country_code || null
        updateData.contact_person_mobile_number = authorized.mobile_number || null
    } else {
        updateData.contact_person_first_name = contact.first_name || null
        updateData.contact_person_last_name = contact.last_name || null
        updateData.contact_person_email = contact.email || null
        updateData.contact_person_mobile_country_code = contact.mobile_country_code || null
        updateData.contact_person_mobile_number = contact.mobile_number || null
    }

    // Optional business address overwrite (registration already captured one)
    const ba = business.business_address
    if (ba && (ba.street_line1 || ba.city)) {
        updateData.street_line1 = ba.street_line1 || null
        updateData.street_line2 = ba.street_line2 || null
        updateData.city = ba.city || null
        updateData.province_state = ba.province_state || null
        updateData.postal_code = ba.postal_code || null
    }

    const { error: dbError } = await adminSupabase
        .from('partners')
        .update(updateData)
        .eq('id', partner.id)
    if (dbError) return { message: 'Database update failed: ' + dbError.message }

    // ── Reset normalized children for an idempotent (re)submission ───────────
    await adminSupabase.from('partner_stakeholders').delete().eq('partner_id', partner.id)
    await adminSupabase.from('partner_kyc_documents').delete().eq('partner_id', partner.id)

    // Insert stakeholders (corp/partnership), preserving order to map their docs.
    const stakeholderIds: string[] = []
    if (requiresStakeholders(entityType) && stakeholders.length) {
        const { data: inserted, error: shErr } = await adminSupabase
            .from('partner_stakeholders')
            .insert(stakeholders.map(s => ({
                partner_id: partner.id,
                roles: s.roles || [],
                first_name: s.first_name,
                last_name: s.last_name,
                nationality: s.nationality || null,
                date_of_birth: s.date_of_birth || null,
                is_authorized_person: !!s.is_authorized_person,
                address: s.address || null,
                identification: (s.id_type || s.id_number)
                    ? { type: s.id_type || null, number: s.id_number || null }
                    : null,
            })))
            .select('id')
        if (shErr) return { message: 'Failed to save stakeholders: ' + shErr.message }
        for (const row of inserted ?? []) stakeholderIds.push(row.id)
    }

    // ── Documents: upload new files + carry forward reused paths ──────────────
    const docRows: { partner_id: string; owner_kind: string; owner_id: string | null; doc_type: string; storage_path: string }[] = []

    const addDoc = (ownerKind: string, ownerId: string | null, docType: string, path: string) => {
        docRows.push({ partner_id: partner.id, owner_kind: ownerKind, owner_id: ownerId, doc_type: docType, storage_path: path })
    }

    // Both maps are "<scope>:<docType>[:<stakeholderIndex>]" -> storage_path.
    // Guard: only accept paths under the caller's own folder. RLS already enforces
    // this on write, but validate defensively so a client can't submit someone
    // else's file by passing an arbitrary path.
    const ownPrefix = `${user.id}/`
    const applyPathMap = (map: Record<string, string>) => {
        for (const [slot, path] of Object.entries(map)) {
            if (!path || !path.startsWith(ownPrefix)) continue
            const [scope, docType, idxRaw] = slot.split(':')
            if (scope === 'stakeholder') {
                const idx = Number(idxRaw)
                addDoc('stakeholder', stakeholderIds[idx] ?? null, docType, path)
            } else if (scope === 'authorized') {
                addDoc('authorized_person', null, docType, path)
            } else {
                addDoc('business', null, docType, path)
            }
        }
    }
    applyPathMap(uploaded)   // uploaded this session
    applyPathMap(reuse)      // carried forward from registration / prior submission

    if (docRows.length) {
        const { error: docErr } = await adminSupabase.from('partner_kyc_documents').insert(docRows)
        if (docErr) return { message: 'Failed to save documents: ' + docErr.message }
    }

    revalidatePath('/organizer/verification')
    return { message: 'Verification submitted successfully!', success: true }
}
