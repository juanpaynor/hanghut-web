import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * submit-xendit-kyc  (v22 — LEGACY Account Holder API, PH doc spec aligned)
 *
 * Doc types + industry code aligned to Xendit's official PH requirements table,
 * VALIDATED against the Xendit dev sandbox (POST /account_holders → HTTP 200):
 *   - business_detail must NOT include business_registration_number (rejected
 *     with API_VALIDATION_ERROR). tax_identification_number + date_of_registration ok.
 *   - industry_category THEATRICAL_PRODUCERS_EXCEPT_MOTION_PICTURES_AND_TICKET_AGENCIES ok.
 *   - kyc_documents {type,country,file_id} with the PH legacy enums all accepted.
 *   - capabilities body {type:MONEY_IN, channel_code:PH_CARDS|GCASH} accepted (PATCH).
 *
 * Flow: upload docs to /files (idempotent) → POST /account_holders →
 * PATCH /v2/accounts/{sub} { account_holder_id } (links + starts KYC) →
 * kyc_status='submitted'. Cards/GCash capabilities are requested later by
 * xendit-webhook once KYC passes.
 */

const KYC_BUCKET = 'kyc-documents'
const XENDIT_API = 'https://api.xendit.co'
// Must be one of Xendit's accepted industry_category enums. HangHut = ticketing.
const DEFAULT_INDUSTRY = Deno.env.get('XENDIT_DEFAULT_INDUSTRY_CODE') || 'THEATRICAL_PRODUCERS_EXCEPT_MOTION_PICTURES_AND_TICKET_AGENCIES'

const BUSINESS_TYPE_MAP: Record<string, string> = {
    individual: 'INDIVIDUAL',
    sole_proprietorship: 'SOLE_PROPRIETORSHIP',
    corporation: 'CORPORATION',
    partnership: 'PARTNERSHIP',
}

// our internal business doc_type -> Xendit legacy kyc_documents type
const LEGACY_DOC_TYPE: Record<string, string> = {
    PH_SEC_CERTIFICATE_REGISTRATION: 'SEC_CERTIFICATE_REGISTRATION_DOCUMENT',
    PH_DTI_CERTIFICATE_REGISTRATION: 'DTI_REGISTRATION_DOCUMENT',
    PH_BIR_2303: 'BIR_2303_DOCUMENT',
    PH_ARTICLES_OF_INCORPORATION: 'ARTICLES_OF_INCORPORATION_DOCUMENT',
    PH_ARTICLES_OF_PARTNERSHIP: 'ARTICLES_OF_PARTNERSHIP_DOCUMENT',
    PH_NOTARIZED_SECRETARY_CERTIFICATE: 'NOTARIZED_SECRETARY_CERTIFICATE_DOCUMENT',
    PH_NOTARIZED_PARTNER_CERTIFICATE: 'NOTARIZED_PARTNER_CERTIFICATE_DOCUMENT',
    PH_GIS: 'LATEST_GIS_DOCUMENT',
    SERVICE_AGREEMENT: 'SERVICE_AGREEMENT_DOCUMENT',
}

// authorized person's selected ID type -> Xendit primary ID document type
// (legacy account_holder enums, per Xendit's official PH requirements table)
const PRIMARY_ID_DOC: Record<string, string> = {
    PASSPORT: 'AUTHORIZED_PERSON_PASSPORT_DOCUMENT',
    DRIVING_LICENSE: 'DRIVER_LICENCE_DOCUMENT',
    PHILSYS_ID: 'PHILSYS_DOCUMENT',
    UMID: 'UMID_DOCUMENT',
    SSS: 'SSS_OR_GSIS_DOCUMENT',
    PRC: 'PRC_LICENSE_DOCUMENT',
    POSTAL_ID: 'POSTAL_ID_DOCUMENT',
    VOTER_ID: 'VOTER_ID_DOCUMENT',
    ACR: 'ACR_OR_IMMIGRANT_COR_DOCUMENT',
}

function toStoragePath(stored: string): string {
    if (stored.startsWith('http')) {
        const marker = `/${KYC_BUCKET}/`
        const idx = stored.indexOf(marker)
        if (idx !== -1) return stored.slice(idx + marker.length).split('?')[0]
    }
    return stored
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
    })
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('Missing XENDIT_SECRET_KEY')

        const supabaseClient = createClient(sbUrl, sbAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } },
        })
        const supabaseAdmin = createClient(sbUrl, sbServiceKey)

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) return json({ error: 'Unauthorized' }, 401)

        const { partner_id } = await req.json()
        if (!partner_id) return json({ error: 'Missing partner_id' }, 400)

        const { data: partner, error: partnerError } = await supabaseAdmin
            .from('partners').select('*').eq('id', partner_id).single()
        if (partnerError || !partner) return json({ error: 'Partner not found' }, 404)

        let isAdmin = user.app_metadata?.role === 'admin' ||
            user.app_metadata?.role === 'service_role' ||
            user.user_metadata?.is_admin === true
        if (!isAdmin) {
            const { data: dbUser } = await supabaseAdmin
                .from('users').select('is_admin').eq('id', user.id).single()
            if (dbUser?.is_admin === true) isAdmin = true
        }
        if (!isAdmin && partner.user_id !== user.id) return json({ error: 'Unauthorized' }, 403)

        if (!partner.xendit_account_id) {
            return json({ error: 'Partner has no Xendit sub-account. Create one first.', code: 'NO_SUBACCOUNT' }, 400)
        }
        if (partner.kyc_status === 'submitted' || partner.kyc_status === 'verified') {
            return json({ success: true, message: `KYC already ${partner.kyc_status}`, kyc_status: partner.kyc_status, already_submitted: true })
        }

        const subAccountId = partner.xendit_account_id as string
        const authHeader = `Basic ${btoa(xenditKey + ':')}`

        const { data: docs } = await supabaseAdmin
            .from('partner_kyc_documents')
            .select('owner_kind, owner_id, doc_type, storage_path')
            .eq('partner_id', partner_id)
        const { data: stakeholders } = await supabaseAdmin
            .from('partner_stakeholders').select('*').eq('partner_id', partner_id)
            .order('created_at', { ascending: true })

        if (!docs || docs.length === 0) {
            return json({ error: 'No KYC documents found for this partner', code: 'MISSING_DOCUMENTS' }, 400)
        }

        const { data: gateway } = await supabaseAdmin
            .from('partner_gateway_accounts').select('*')
            .eq('partner_id', partner_id).eq('provider', 'xendit').maybeSingle()
        const fileIds: Record<string, string> = (gateway?.file_ids as Record<string, string>) || {}

        // Upload every stored doc to the Xendit File API (idempotent).
        for (const doc of docs) {
            const path = toStoragePath(doc.storage_path)
            if (fileIds[path]) continue
            const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(KYC_BUCKET).download(path)
            if (dlErr || !blob) throw new Error(`Failed to download ${doc.doc_type} (${path}): ${dlErr?.message || 'not found'}`)
            const filename = path.split('/').pop() || `${doc.doc_type}.pdf`
            const form = new FormData()
            form.append('purpose', 'KYC_DOCUMENT')
            form.append('file', blob, filename)
            const up = await fetch(`${XENDIT_API}/files`, { method: 'POST', headers: { Authorization: authHeader }, body: form })
            if (!up.ok) throw new Error(`File upload failed for ${doc.doc_type}: ${await up.text()}`)
            fileIds[path] = (await up.json()).id
            console.log(`  ✅ uploaded ${doc.doc_type}: ${fileIds[path]}`)
        }

        await supabaseAdmin.from('partner_gateway_accounts').upsert({
            partner_id, provider: 'xendit', account_id: subAccountId, file_ids: fileIds,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'partner_id,provider' })

        const fid = (ownerKind: string, docType: string): string | undefined => {
            const row = docs.find(d => d.owner_kind === ownerKind && d.doc_type === docType)
            return row ? fileIds[toStoragePath(row.storage_path)] : undefined
        }

        // ── Build kyc_documents per the PH spec ───────────────────────────────
        const kycDocuments: { type: string; country: string; file_id: string }[] = []

        // Business documents (entity-specific), mapped to legacy enums.
        for (const d of docs.filter(d => d.owner_kind === 'business')) {
            const t = LEGACY_DOC_TYPE[d.doc_type]
            const f = fileIds[toStoragePath(d.storage_path)]
            if (t && f) kycDocuments.push({ type: t, country: 'PH', file_id: f })
        }

        // Authorized person's primary ID (typed by their selected ID) + selfie-with-ID.
        const idType = (partner.authorized_person_identification as any)?.type as string | undefined
        const primaryIdType = (idType && PRIMARY_ID_DOC[idType]) || 'AUTHORIZED_PERSON_PASSPORT_DOCUMENT'
        const idFront = fid('authorized_person', 'ID_FRONT')
        if (idFront) kycDocuments.push({ type: primaryIdType, country: 'PH', file_id: idFront })
        const selfie = fid('authorized_person', 'SELFIE')
        if (selfie) kycDocuments.push({ type: 'SELFIE_WITH_PRIMARY_ID_DOCUMENT', country: 'PH', file_id: selfie })

        const addr = (partner.street_line1 || partner.city) ? {
            street_line1: partner.street_line1 || undefined,
            street_line2: partner.street_line2 || undefined,
            city: partner.city || undefined,
            province_state: partner.province_state || undefined,
            postal_code: partner.postal_code || undefined,
            country: 'PH',
        } : undefined

        // Normalize a collected StructuredAddress into a Xendit address object.
        // Used to give each individual their OWN residential address (required for
        // PH_CARDS), falling back to the business address when a person didn't fill one.
        const mkAddr = (a: any) => (a && (a.street_line1 || a.city)) ? {
            street_line1: a.street_line1 || undefined,
            street_line2: a.street_line2 || undefined,
            city: a.city || undefined,
            province_state: a.province_state || undefined,
            postal_code: a.postal_code || undefined,
            country: 'PH',
        } : undefined

        // PH_CARDS requires a minimum of 1 INCORPORATOR and 1 PIC in individual_details,
        // and (per Xendit's cards guide) an address on each individual. The base KYC
        // accepts these too, so we set them unconditionally.
        const individuals: any[] = []
        let hasIncorporator = false
        let hasPic = false
        if (partner.authorized_person_first_name || partner.representative_name) {
            const fallback = (partner.representative_name || '').trim().split(' ')
            individuals.push({
                given_names: partner.authorized_person_first_name || fallback[0] || 'Partner',
                surname: partner.authorized_person_last_name || (fallback.length > 1 ? fallback.slice(1).join(' ') : '-'),
                nationality: partner.authorized_person_nationality || partner.nationality || 'PH',
                date_of_birth: partner.authorized_person_date_of_birth || undefined,
                gender: partner.authorized_person_gender || undefined,
                place_of_birth: partner.place_of_birth || undefined,
                email: partner.authorized_person_email || partner.work_email || undefined,
                phone_number: partner.authorized_person_mobile_number
                    ? `${partner.authorized_person_mobile_country_code || ''}${partner.authorized_person_mobile_number}`
                    : (partner.contact_number || undefined),
                address: mkAddr(partner.authorized_person_address) || addr,
                tax_identification_number: partner.tax_id || undefined,
                type: 'INCORPORATOR',
                role: 'owner',
            })
            hasIncorporator = true
        }
        for (const s of stakeholders ?? []) {
            const isOwner = (s.roles || []).includes('BUSINESS_OWNER')
            const isDirector = (s.roles || []).includes('BOARD_DIRECTOR')
            const t = isOwner ? 'INCORPORATOR' : 'PIC'
            if (t === 'INCORPORATOR') hasIncorporator = true; else hasPic = true
            individuals.push({
                given_names: s.first_name,
                surname: s.last_name || '-',
                nationality: s.nationality || 'PH',
                date_of_birth: s.date_of_birth || undefined,
                address: mkAddr((s as any).address) || addr,
                tax_identification_number: (s.identification as any)?.number || undefined,
                type: t,
                role: isOwner ? 'owner' : isDirector ? 'director' : 'stakeholder',
            })
        }
        if (individuals.length === 0) {
            individuals.push({ given_names: partner.business_name || 'Partner', surname: '-', address: addr, type: 'INCORPORATOR', role: 'owner' })
            hasIncorporator = true
        }
        if (!hasIncorporator) { individuals[0].type = 'INCORPORATOR'; individuals[0].role = 'owner'; hasIncorporator = true }
        // Guarantee at least one PIC (Person In Charge / contact person).
        if (!hasPic) {
            individuals.push({
                given_names: partner.contact_person_first_name || partner.authorized_person_first_name || (partner.representative_name || 'Contact').split(' ')[0] || 'Contact',
                surname: partner.contact_person_last_name || partner.authorized_person_last_name || '-',
                email: partner.contact_person_email || partner.authorized_person_email || partner.work_email || undefined,
                phone_number: partner.authorized_person_mobile_number
                    ? `${partner.authorized_person_mobile_country_code || ''}${partner.authorized_person_mobile_number}`
                    : (partner.contact_number || undefined),
                address: addr,
                type: 'PIC',
                role: 'contact person',
            })
            hasPic = true
        }

        const accountHolderPayload = {
            business_detail: {
                type: BUSINESS_TYPE_MAP[(partner.business_type || '').toLowerCase()] || 'CORPORATION',
                legal_name: partner.business_name,
                trading_name: partner.business_name,
                description: partner.description || `HangHut partner: ${partner.business_name}`,
                industry_category: DEFAULT_INDUSTRY,
                country_of_operation: 'PH',
                tax_identification_number: partner.tax_id || undefined,
                date_of_registration: partner.business_establishment_date || undefined,
            },
            individual_details: individuals,
            address: addr,
            kyc_documents: kycDocuments,
            email: partner.work_email || partner.authorized_person_email || undefined,
            phone_number: partner.business_phone_number
                ? `${partner.business_phone_country_code || ''}${partner.business_phone_number}`
                : (partner.contact_number || undefined),
        }

        console.log(`🏢 Creating account_holder for ${partner_id}:`, JSON.stringify(accountHolderPayload))

        const holderRes = await fetch(`${XENDIT_API}/account_holders`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(accountHolderPayload),
        })
        const holderData = await holderRes.json()
        if (!holderRes.ok) {
            console.error('❌ create account_holder failed:', JSON.stringify(holderData))
            await supabaseAdmin.from('partner_gateway_accounts').upsert({
                partner_id, provider: 'xendit', account_id: subAccountId, raw_response: holderData,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'partner_id,provider' })
            return json({ error: 'Failed to create Xendit account holder', details: holderData, code: 'XENDIT_KYC_ERROR' }, holderRes.status)
        }

        const accountHolderId = holderData.id
        console.log(`✅ account_holder created: ${accountHolderId}`)

        const linkRes = await fetch(`${XENDIT_API}/v2/accounts/${subAccountId}`, {
            method: 'PATCH',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_holder_id: accountHolderId }),
        })
        const linkData = await linkRes.json()
        if (!linkRes.ok) {
            console.error('❌ link account_holder failed:', JSON.stringify(linkData))
            await supabaseAdmin.from('partners').update({ xendit_account_holder_id: accountHolderId }).eq('id', partner_id)
            return json({ error: 'Account holder created but link failed', account_holder_id: accountHolderId, details: linkData, code: 'LINK_FAILED' }, linkRes.status)
        }

        await supabaseAdmin.from('partners').update({
            kyc_status: 'submitted',
            xendit_account_holder_id: accountHolderId,
        }).eq('id', partner_id)

        await supabaseAdmin.from('partner_gateway_accounts').upsert({
            partner_id, provider: 'xendit', account_id: subAccountId,
            account_holder_id: accountHolderId, kyc_status: holderData.kyc?.status || 'PENDING',
            file_ids: fileIds, raw_response: holderData, updated_at: new Date().toISOString(),
        }, { onConflict: 'partner_id,provider' })

        return json({
            success: true,
            kyc_status: 'submitted',
            account_holder_id: accountHolderId,
            message: 'KYC submitted to Xendit (legacy account holder). Cards/GCash capabilities are requested once verification passes.',
        })
    } catch (error: any) {
        console.error('CRITICAL ERROR:', error)
        return json({ error: 'Internal Server Error', message: error.message }, 500)
    }
})
