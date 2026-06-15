'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
    requiresStakeholders,
    isSinglePerson,
    type StructuredAddress,
} from './kyc-constants'

/**
 * Upload a KYC document to the private kyc-documents bucket (system of record).
 * Returns the bucket-relative storage path.
 */
async function uploadKYCDocument(
    adminSupabase: any,
    userId: string,
    file: File,
    docType: string
): Promise<string | null> {
    if (!file || file.size === 0) return null
    if (file.size > 10 * 1024 * 1024) throw new Error(`${docType} file too large (max 10MB)`)

    const ext = file.name.split('.').pop() || 'file'
    const fileName = `${userId}/${docType.toLowerCase()}-${Date.now()}.${ext}`

    const { data, error } = await adminSupabase.storage
        .from('kyc-documents')
        .upload(fileName, file, { upsert: true, contentType: file.type })

    if (error) throw new Error(`Failed to upload ${docType}: ${error.message}`)
    return data.path
}

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

    const { data: partner } = await adminSupabase
        .from('partners')
        .select('id, business_type')
        .eq('user_id', user.id)
        .single()
    if (!partner) return { message: 'Partner profile not found.' }

    // ── Parse submission ─────────────────────────────────────────────────────
    const entityType = (formData.get('entityType') as string) || partner.business_type || ''
    const authorized = parseJSON<PersonProfile>(formData.get('authorizedPerson'), {})
    const contact = parseJSON<ContactProfile>(formData.get('contactPerson'), {})
    const business = parseJSON<BusinessProfile>(formData.get('business'), {})
    const stakeholders = parseJSON<StakeholderInput[]>(formData.get('stakeholders'), [])
    // reuse: map of "<scope>:<doc_type>[:<stakeholderIndex>]" -> existing storage path
    const reuse = parseJSON<Record<string, string>>(formData.get('reuse'), {})

    // ── Validate per entity type ─────────────────────────────────────────────
    const errors: Record<string, string[]> = {}
    if (!entityType) errors.entityType = ['Business type is required']
    if (!authorized.first_name?.trim() || !authorized.last_name?.trim())
        errors.authorizedPerson = ['Authorized person full name is required']
    if (!authorized.date_of_birth) errors.authorizedDob = ['Authorized person date of birth is required']
    if (!business.intents?.length) errors.intents = ['Select at least one business intent']
    if (!business.source_of_funds?.length) errors.sourceOfFunds = ['Select at least one source of funds']
    if (!business.money_out_frequency) errors.moneyOut = ['Money-out frequency is required']

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
    }

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

    try {
        // New file uploads. Form keys: "<scope>:<docType>[:<stakeholderIndex>]"
        for (const [key, value] of formData.entries()) {
            if (!key.startsWith('file:')) continue
            const file = value as File
            if (!file || typeof file === 'string' || file.size === 0) continue
            const [, scope, docType, idxRaw] = key.split(':') // file:business:PH_BIR_2303 | file:authorized:ID_FRONT | file:stakeholder:ID_FRONT:0
            const path = await uploadKYCDocument(adminSupabase, user.id, file, docType)
            if (!path) continue
            if (scope === 'stakeholder') {
                const idx = Number(idxRaw)
                addDoc('stakeholder', stakeholderIds[idx] ?? null, docType, path)
            } else if (scope === 'authorized') {
                addDoc('authorized_person', null, docType, path)
            } else {
                addDoc('business', null, docType, path)
            }
        }

        // Reused docs (already in the bucket from registration / prior submission).
        for (const [slot, path] of Object.entries(reuse)) {
            if (!path) continue
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
    } catch (e: any) {
        return { message: e.message || 'File upload failed.' }
    }

    if (docRows.length) {
        const { error: docErr } = await adminSupabase.from('partner_kyc_documents').insert(docRows)
        if (docErr) return { message: 'Failed to save documents: ' + docErr.message }
    }

    revalidatePath('/organizer/verification')
    return { message: 'Verification submitted successfully!', success: true }
}
