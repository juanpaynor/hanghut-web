import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * submit-xendit-kyc  (v25 — truthful incorporator/PIC + ISO nationality; LEGACY API)
 *
 * Doc types + industry code aligned to Xendit's official PH requirements table,
 * VALIDATED against the Xendit dev sandbox (POST /account_holders → HTTP 200):
 *   - business_detail must NOT include business_registration_number (rejected
 *     with API_VALIDATION_ERROR). tax_identification_number + date_of_registration ok.
 *   - industry_category THEATRICAL_PRODUCERS_EXCEPT_MOTION_PICTURES_AND_TICKET_AGENCIES ok.
 *   - kyc_documents {type,country,file_id} with the PH legacy enums all accepted.
 *   - capabilities body {type:MONEY_IN, channel_code:PH_CARDS|GCASH} accepted (PATCH).
 *
 * Flow: ensure sub-account (POST /v2/accounts if missing) → upload docs to /files
 * (idempotent) → POST /account_holders → PATCH /v2/accounts/{sub}
 * { account_holder_id } (links + starts KYC) → kyc_status='submitted'.
 * Cards/GCash capabilities are requested later by xendit-webhook once KYC passes.
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

        if (partner.kyc_status === 'submitted' || partner.kyc_status === 'verified') {
            return json({ success: true, message: `KYC already ${partner.kyc_status}`, kyc_status: partner.kyc_status, already_submitted: true })
        }

        const authHeader = `Basic ${btoa(xenditKey + ':')}`

        // A missing sub-account used to be a hard 400 (NO_SUBACCOUNT) here, because the
        // sub-account is normally created in approvePartner() at approval time. Partners
        // approved before that step existed — or whose creation call failed — could fill
        // in the entire 4-entity form, upload every document and sign the agreement, then
        // hit this wall at the very last step with all their work stranded. So create it
        // on demand instead.
        //
        // This deliberately does NOT touch use_main_wallet. Having a sub-account and
        // settling through it are separate decisions: create-purchase-intent only routes
        // (`for-user-id`) and charges the inline PLATFORM fee when use_main_wallet is
        // false, so a main-wallet partner keeps settling to the main account exactly as
        // before. The sub-account is only the identity that KYC attaches to.
        let subAccountId = partner.xendit_account_id as string | null

        if (!subAccountId) {
            const subEmail = partner.work_email || user.email || `partner-${partner_id}@hanghut.com`
            console.log(`🏦 No sub-account for ${partner_id} — creating one before KYC`)

            const subRes = await fetch(`${XENDIT_API}/v2/accounts`, {
                method: 'POST',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: subEmail,
                    type: 'OWNED',
                    public_profile: {
                        business_name: partner.business_name || `HangHut Partner ${String(partner_id).substring(0, 8)}`,
                    },
                }),
            })
            const subData = await subRes.json()

            if (!subRes.ok) {
                console.error('❌ create sub-account failed:', JSON.stringify(subData))
                return json({
                    error: subData.message || 'Failed to create Xendit sub-account',
                    code: subData.error_code === 'DUPLICATE_ACCOUNT_ERROR' || subRes.status === 409
                        ? 'DUPLICATE_EMAIL'
                        : 'SUBACCOUNT_CREATE_FAILED',
                    details: subData,
                }, subRes.status)
            }

            subAccountId = subData.id as string

            // Persist BEFORE going any further. If the KYC calls below fail we must not
            // lose the account id — re-running would otherwise create a second orphaned
            // Xendit account under a different email.
            const { error: saveErr } = await supabaseAdmin
                .from('partners').update({ xendit_account_id: subAccountId }).eq('id', partner_id)
            if (saveErr) {
                console.error('🚨 CRITICAL: sub-account created but id not saved!', { partner_id, subAccountId, saveErr })
                return json({
                    error: 'Xendit sub-account created but could not be saved. Contact support before retrying.',
                    xendit_account_id: subAccountId, code: 'DB_SAVE_FAILED',
                }, 500)
            }
            console.log(`✅ sub-account created + stored: ${subAccountId}`)
        }

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

        // The form collects nationality as free text and defaults it to the demonym
        // "Filipino", while this file's own fallback is the ISO code 'PH' — so a single
        // payload could carry BOTH spellings for the same country. Normalize at the
        // boundary rather than changing the form, which is friendlier as typed.
        const toCountryCode = (raw: unknown): string => {
            const v = (typeof raw === 'string' ? raw : '').trim()
            if (!v) return 'PH'
            if (/^[a-z]{2}$/i.test(v)) return v.toUpperCase()
            const DEMONYMS: Record<string, string> = {
                filipino: 'PH', filipina: 'PH', pilipino: 'PH', philippine: 'PH', philippines: 'PH',
                american: 'US', british: 'GB', australian: 'AU', canadian: 'CA', chinese: 'CN',
                japanese: 'JP', korean: 'KR', indian: 'IN', singaporean: 'SG', malaysian: 'MY',
                indonesian: 'ID', thai: 'TH', vietnamese: 'VN', spanish: 'ES', german: 'DE', french: 'FR',
            }
            return DEMONYMS[v.toLowerCase()] || 'PH'
        }

        // A personal TIN is only the same as the business TIN when the business IS the
        // person. For a corporation/partnership, partner.tax_id is the COMPANY's — putting
        // it on an individual states something untrue. We never collect personal TINs, and
        // the company TIN already rides on business_detail where it belongs.
        const entityType = BUSINESS_TYPE_MAP[(partner.business_type || '').toLowerCase()] || 'CORPORATION'
        const personalTin = (entityType === 'INDIVIDUAL' || entityType === 'SOLE_PROPRIETORSHIP')
            ? (partner.tax_id || undefined)
            : undefined

        // PH_CARDS requires a minimum of 1 INCORPORATOR and 1 PIC in individual_details,
        // and (per Xendit's cards guide) an address on each individual.
        //
        // Who is which MATTERS — a reviewer cross-checks these against the GIS and
        // Secretary's Certificate. Stakeholders carry the recorded corporate roles, so
        // they decide ownership; the authorized person is whoever is authorised to
        // transact, which is a PIC, not automatically an owner. Previously the authorized
        // person was hardcoded to INCORPORATOR/owner, which declared (for example) an
        // Executive Assistant as a company owner and then bolted on a duplicate PIC.
        const individuals: any[] = []
        let hasIncorporator = false
        let hasPic = false

        for (const s of stakeholders ?? []) {
            const roles = s.roles || []
            const isOwner = roles.includes('BUSINESS_OWNER')
            const isDirector = roles.includes('BOARD_DIRECTOR')
            // Owners and directors are the incorporating parties; anyone else is a PIC.
            const t = (isOwner || isDirector) ? 'INCORPORATOR' : 'PIC'
            if (t === 'INCORPORATOR') hasIncorporator = true; else hasPic = true
            individuals.push({
                given_names: s.first_name,
                surname: s.last_name || '-',
                nationality: toCountryCode(s.nationality),
                date_of_birth: s.date_of_birth || undefined,
                address: mkAddr((s as any).address) || addr,
                // NOTE: s.identification.number is a PASSPORT/UMID/etc number, NOT a tax id.
                // Sending it as tax_identification_number was a straight mislabel.
                type: t,
                role: isOwner ? 'owner' : isDirector ? 'director' : 'stakeholder',
            })
        }

        if (partner.authorized_person_first_name || partner.representative_name) {
            const fallback = (partner.representative_name || '').trim().split(' ')
            // Only promote them to INCORPORATOR when no stakeholder already establishes
            // ownership — i.e. a sole proprietor / individual, where they ARE the owner.
            const authorizedIsOwner = !hasIncorporator
            individuals.push({
                given_names: partner.authorized_person_first_name || fallback[0] || 'Partner',
                surname: partner.authorized_person_last_name || (fallback.length > 1 ? fallback.slice(1).join(' ') : '-'),
                nationality: toCountryCode(partner.authorized_person_nationality || partner.nationality),
                date_of_birth: partner.authorized_person_date_of_birth || undefined,
                gender: partner.authorized_person_gender || undefined,
                place_of_birth: partner.place_of_birth || undefined,
                email: partner.authorized_person_email || partner.work_email || undefined,
                phone_number: partner.authorized_person_mobile_number
                    ? `${partner.authorized_person_mobile_country_code || ''}${partner.authorized_person_mobile_number}`
                    : (partner.contact_number || undefined),
                address: mkAddr(partner.authorized_person_address) || addr,
                tax_identification_number: personalTin,
                type: authorizedIsOwner ? 'INCORPORATOR' : 'PIC',
                role: authorizedIsOwner ? 'owner' : (partner.authorized_person_role || 'authorized person'),
            })
            if (authorizedIsOwner) hasIncorporator = true; else hasPic = true
        }

        if (individuals.length === 0) {
            individuals.push({ given_names: partner.business_name || 'Partner', surname: '-', address: addr, type: 'INCORPORATOR', role: 'owner' })
            hasIncorporator = true
        }
        if (!hasIncorporator) { individuals[0].type = 'INCORPORATOR'; individuals[0].role = 'owner'; hasIncorporator = true }
        // Backstop only — with the authorized person now defaulting to PIC this rarely
        // fires, so it no longer duplicates a person already listed above.
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

        // website_url is REQUIRED — Xendit accepts POST /account_holders without it, then
        // rejects the link step with INSUFFICIENT_ACCOUNT_HOLDER_DATA, so its absence only
        // shows up after an account holder already exists. Resolve it in preference order:
        //   1. the partner's own site (social_links.website) — what a reviewer expects
        //   2. their verified custom domain
        //   3. their HangHut storefront, which IS their public shopfront
        //   4. hanghut.com — last resort for a partner with no slug yet; still a page
        //      showing the platform they trade through, rather than sending nothing.
        // Stored values are user-typed and routinely lack a scheme ("thekoolpals.com"),
        // which would fail URL validation, so normalize before sending.
        const withScheme = (raw: unknown): string | null => {
            const v = typeof raw === 'string' ? raw.trim() : ''
            if (!v) return null
            const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
            try {
                const parsed = new URL(url)
                // Reject a bare token like "n/a" that normalizes to a hostname with no dot.
                return parsed.hostname.includes('.') ? parsed.toString() : null
            } catch {
                return null
            }
        }

        const socialWebsite = (partner.social_links as any)?.website
            ?? (partner.branding as any)?.social_links?.website

        const websiteUrl =
            withScheme(socialWebsite)
            ?? (partner.custom_domain_verified ? withScheme(partner.custom_domain) : null)
            ?? (partner.slug ? `https://hanghut.com/${partner.slug}` : null)
            ?? 'https://hanghut.com'

        console.log(`🌐 website_url for ${partner_id}: ${websiteUrl}`)

        const accountHolderPayload = {
            website_url: websiteUrl,
            business_detail: {
                type: entityType,
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

        // RETRY SAFETY. The link step can fail after the account holder exists (that is
        // exactly how the missing website_url surfaced), and we persist the id in that
        // branch. Re-POSTing here would mint a SECOND account holder at Xendit for the
        // same partner and abandon the first — unrecoverable from our side. So when we
        // already hold an id, PATCH it with the corrected payload and reuse it.
        const existingHolderId = partner.xendit_account_holder_id as string | null

        const holderRes = existingHolderId
            ? await fetch(`${XENDIT_API}/account_holders/${existingHolderId}`, {
                method: 'PATCH',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(accountHolderPayload),
            })
            : await fetch(`${XENDIT_API}/account_holders`, {
                method: 'POST',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(accountHolderPayload),
            })

        console.log(
            `🏢 ${existingHolderId ? `Updating account_holder ${existingHolderId}` : 'Creating account_holder'} for ${partner_id}:`,
            JSON.stringify(accountHolderPayload)
        )

        const holderData = await holderRes.json()
        if (!holderRes.ok) {
            console.error('❌ account_holder write failed:', JSON.stringify(holderData))
            await supabaseAdmin.from('partner_gateway_accounts').upsert({
                partner_id, provider: 'xendit', account_id: subAccountId, raw_response: holderData,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'partner_id,provider' })
            return json({ error: 'Failed to create Xendit account holder', details: holderData, code: 'XENDIT_KYC_ERROR' }, holderRes.status)
        }

        // On PATCH some responses echo no id — fall back to the one we already hold.
        const accountHolderId = holderData.id || existingHolderId
        console.log(`✅ account_holder ${existingHolderId ? 'updated' : 'created'}: ${accountHolderId}`)

        // Persist immediately on create too, not just in the link-failure branch — a crash
        // between here and the link would otherwise strand an unreferenced Xendit account.
        if (!existingHolderId && accountHolderId) {
            await supabaseAdmin.from('partners')
                .update({ xendit_account_holder_id: accountHolderId }).eq('id', partner_id)
        }

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
