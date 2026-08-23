import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * xendit-account-status (v1) — READ-ONLY diagnostic. Admin only.
 *
 * Answers "what does Xendit actually think of this partner?" without changing
 * anything on either side. Exists because XENDIT_SECRET_KEY lives only in the
 * edge-function secrets, so the admin UI cannot query Xendit directly.
 *
 * Performs ONLY GETs:
 *   GET /v2/accounts/{sub_account_id}   → sub-account + linked account_holder_id
 *   GET /account_holders/{holder_id}    → KYC status + capabilities (when linked)
 *   GET /account_verification           → the NEW verification API, via for-user-id.
 *       The legacy account_holder object exposes only kyc.status with no reason,
 *       so AWAITING_RESUBMISSION and the per-field kyc_details are visible ONLY here.
 *
 * It deliberately does NOT write to Xendit or to our DB. Where our stored state
 * disagrees with Xendit's, it reports the drift as a `discrepancies[]` entry so
 * an admin decides what to do — silently "repairing" payment state is how you
 * end up trusting a value nobody verified.
 */

const XENDIT_API = 'https://api.xendit.co'

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
        if (!xenditKey) return json({ error: 'Missing XENDIT_SECRET_KEY' }, 500)

        const supabaseClient = createClient(sbUrl, sbAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } },
        })
        const supabaseAdmin = createClient(sbUrl, sbServiceKey)

        // A service-role bearer is already omnipotent against this project, so
        // accepting it here grants nothing new — it just lets the check be run
        // from a trusted backend/CLI context without an admin browser session.
        const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
        const isServiceRole = !!sbServiceKey && bearer === sbServiceKey

        let isAdmin = isServiceRole
        if (!isAdmin) {
            const { data: { user } } = await supabaseClient.auth.getUser()
            if (!user) return json({ error: 'Unauthorized' }, 401)

            isAdmin = user.app_metadata?.role === 'admin' ||
                user.app_metadata?.role === 'service_role' ||
                user.user_metadata?.is_admin === true
            if (!isAdmin) {
                const { data: dbUser } = await supabaseAdmin
                    .from('users').select('is_admin').eq('id', user.id).single()
                if (dbUser?.is_admin === true) isAdmin = true
            }
        }
        if (!isAdmin) return json({ error: 'Forbidden' }, 403)

        const { partner_id } = await req.json()
        if (!partner_id) return json({ error: 'Missing partner_id' }, 400)

        const { data: partner, error: partnerError } = await supabaseAdmin
            .from('partners')
            .select('id, business_name, kyc_status, kyc_rejection_reason, xendit_account_id, xendit_account_holder_id, xendit_cards_gcash_live, tax_id, street_line1, city')
            .eq('id', partner_id).single()
        if (partnerError || !partner) return json({ error: 'Partner not found' }, 404)

        const { data: gateway } = await supabaseAdmin
            .from('partner_gateway_accounts').select('*')
            .eq('partner_id', partner_id).eq('provider', 'xendit').maybeSingle()

        const { count: docCount } = await supabaseAdmin
            .from('partner_kyc_documents')
            .select('id', { count: 'exact', head: true })
            .eq('partner_id', partner_id)

        const authHeader = `Basic ${btoa(xenditKey + ':')}`
        const discrepancies: string[] = []

        const local = {
            business_name: partner.business_name,
            kyc_status: partner.kyc_status,
            kyc_rejection_reason: partner.kyc_rejection_reason,
            sub_account_id: partner.xendit_account_id,
            account_holder_id: partner.xendit_account_holder_id,
            cards_gcash_live: partner.xendit_cards_gcash_live,
            kyc_documents_uploaded: docCount ?? 0,
            gateway_row_exists: !!gateway,
            has_tax_id: !!partner.tax_id,
            has_business_address: !!(partner.street_line1 || partner.city),
        }

        if (!partner.xendit_account_id) {
            discrepancies.push('No Xendit sub-account on file — nothing to look up. Create the sub-account first.')
            return json({ ok: false, stage: 'no_subaccount', local, discrepancies })
        }

        // ── Sub-account ───────────────────────────────────────────────────────
        const acctRes = await fetch(`${XENDIT_API}/v2/accounts/${partner.xendit_account_id}`, {
            headers: { Authorization: authHeader },
        })
        const acctBody = await acctRes.json().catch(() => ({}))
        if (!acctRes.ok) {
            discrepancies.push(`Xendit rejected the sub-account lookup (HTTP ${acctRes.status}). The stored sub-account id may be wrong or belong to another environment.`)
            return json({ ok: false, stage: 'subaccount_lookup_failed', local, xendit: { account: acctBody }, discrepancies })
        }

        // Xendit is the authority on whether a holder is actually linked. Scan a few
        // shapes rather than one key, and return the raw account body below so a
        // "no holder" verdict can be checked against the payload instead of trusted.
        const remoteHolderId: string | null =
            acctBody.account_holder_id ||
            acctBody.account_holder?.id ||
            acctBody.data?.account_holder_id ||
            acctBody.public_profile?.account_holder_id ||
            null

        if (remoteHolderId && !partner.xendit_account_holder_id) {
            discrepancies.push(`Xendit has account_holder ${remoteHolderId} linked, but our partners.xendit_account_holder_id is empty — our record is stale.`)
        }
        if (!remoteHolderId && partner.xendit_account_holder_id) {
            discrepancies.push(`We store account_holder ${partner.xendit_account_holder_id} but Xendit shows none linked to this sub-account.`)
        }
        if (!remoteHolderId && !partner.xendit_account_holder_id) {
            discrepancies.push('No account_holder exists on Xendit for this partner — KYC has never been submitted.')
        }
        // Whether documents reached Xendit is recorded by the /files upload loop as
        // partner_gateway_accounts.file_ids — it has nothing to do with whether a holder
        // is LINKED to the sub-account. Inferring it from remoteHolderId reported
        // "never sent to Xendit" for documents that had in fact all uploaded
        // successfully, which points the reader at the wrong problem.
        const uploadedFileIds = Object.keys((gateway?.file_ids as Record<string, string>) ?? {}).length
        if ((docCount ?? 0) > uploadedFileIds) {
            discrepancies.push(
                uploadedFileIds === 0
                    ? `${docCount} KYC document(s) are stored locally but none have been uploaded to Xendit yet.`
                    : `${docCount} KYC document(s) stored locally but only ${uploadedFileIds} uploaded to Xendit.`
            )
        }

        const holderId = remoteHolderId || partner.xendit_account_holder_id
        let holderBody: unknown = null
        let kycStatusRemote: string | null = null
        let capabilities: unknown = null

        if (holderId) {
            const holderRes = await fetch(`${XENDIT_API}/account_holders/${holderId}`, {
                headers: { Authorization: authHeader },
            })
            holderBody = await holderRes.json().catch(() => ({}))
            if (!holderRes.ok) {
                discrepancies.push(`Account holder lookup failed (HTTP ${holderRes.status}).`)
            } else {
                const h = holderBody as any
                kycStatusRemote = h?.kyc?.status ?? h?.status ?? null
                capabilities = h?.capabilities ?? null
                if (kycStatusRemote && String(kycStatusRemote).toLowerCase().includes('pass') && partner.kyc_status !== 'verified') {
                    discrepancies.push(`Xendit reports KYC "${kycStatusRemote}" but our kyc_status is "${partner.kyc_status}" — the webhook may not have been delivered.`)
                }
            }
        }

        // ── Account verification (the NEW KYC API) ────────────────────────────
        // We submit through the LEGACY /account_holders endpoint, whose object only
        // exposes kyc.status ("NOT_VERIFIED") and carries no reason. Xendit's newer
        // verification API is where AWAITING_RESUBMISSION and the per-field kyc_details
        // actually live — so "what do they want resubmitted?" is unanswerable without
        // this call. Read-only GET, keyed by sub-account via for-user-id.
        let verification: unknown = null
        let verificationStatus: string | null = null
        let verificationHttp = 0
        try {
            const verRes = await fetch(`${XENDIT_API}/account_verification`, {
                headers: { Authorization: authHeader, 'for-user-id': partner.xendit_account_id },
            })
            verificationHttp = verRes.status
            const verText = await verRes.text()
            try { verification = JSON.parse(verText) } catch { verification = verText.slice(0, 2000) }
            if (verRes.ok) {
                verificationStatus = (verification as any)?.status ?? null
                if (verificationStatus === 'AWAITING_RESUBMISSION') {
                    discrepancies.push('Xendit is AWAITING_RESUBMISSION on this sub-account — inspect xendit.verification.kyc_details for which fields/documents it is missing.')
                }
                if (verificationStatus && verificationStatus !== 'PASSED' && partner.kyc_status === 'verified') {
                    discrepancies.push(`Verification reports "${verificationStatus}" but our kyc_status is "verified".`)
                }
            } else if (verRes.status === 404) {
                discrepancies.push('No verification request exists on the new account_verification API for this sub-account — the KYC we sent went only to the legacy /account_holders endpoint.')
            } else {
                discrepancies.push(`Account verification lookup failed (HTTP ${verRes.status}).`)
            }
        } catch (e: any) {
            discrepancies.push(`Account verification lookup threw: ${e.message}`)
        }

        // Which uploaded files never made it into the account_holder payload. The
        // submission attaches only the authorized person's ID_FRONT and SELFIE, so
        // ID_BACK and every stakeholder ID are uploaded and then silently dropped.
        const attachedFileIds = new Set(
            (((holderBody as any)?.kyc_documents ?? []) as any[]).map(d => d?.file_id).filter(Boolean)
        )
        const orphanedFiles = Object.entries((gateway?.file_ids as Record<string, string>) ?? {})
            .filter(([, fileId]) => !attachedFileIds.has(fileId))
            .map(([path, fileId]) => ({ path, file_id: fileId }))
        if (orphanedFiles.length > 0) {
            discrepancies.push(`${orphanedFiles.length} file(s) uploaded to Xendit but NOT attached to the account holder — see xendit.orphaned_files.`)
        }

        // ── Channel probe ─────────────────────────────────────────────────────
        // The question this answers: does an OWNED sub-account already have Cards
        // and GCash available (i.e. inherited from the master), or does it still
        // need its own verification? Compare what Xendit offers the MASTER against
        // what it offers this sub-account via for-user-id. Read-only.
        const probeChannels = async (label: string, forUserId?: string, path = '/payment_channels') => {
            try {
                const headers: Record<string, string> = { Authorization: authHeader }
                if (forUserId) headers['for-user-id'] = forUserId
                const res = await fetch(`${XENDIT_API}${path}`, { headers })
                const text = await res.text()
                let body: any = null
                try { body = JSON.parse(text) } catch { /* non-JSON */ }
                const list = Array.isArray(body) ? body : (body?.data ?? [])
                const codes: string[] = Array.isArray(list)
                    ? list.map((c: any) => c?.channel_code || c?.code || c?.name).filter(Boolean)
                    : []
                return {
                    label,
                    path,
                    http: res.status,
                    count: codes.length,
                    has_cards: codes.some(c => /CARD/i.test(c)),
                    has_gcash: codes.some(c => /GCASH/i.test(c)),
                    codes,
                    raw_snippet: text.slice(0, 900),
                }
            } catch (e: any) {
                return { label, path, http: 0, count: 0, has_cards: false, has_gcash: false, codes: [], raw_snippet: e.message }
            }
        }

        const channelProbe = {
            master: await probeChannels('master'),
            sub_account: await probeChannels('sub_account', partner.xendit_account_id),
            master_v2: await probeChannels('master', undefined, '/v2/payment_channels'),
            sub_account_v2: await probeChannels('sub_account', partner.xendit_account_id, '/v2/payment_channels'),
        }

        // Requirements the submission would omit today (surfaced before a retry,
        // not after a rejection).
        const blockers: string[] = []
        if (!local.has_business_address) blockers.push('No business address on the partner record — the account_holder payload will omit `address`.')
        // Per Xendit's account-holder docs the TIN is mandatory for USD / recurring
        // card capabilities; local PHP cards don't strictly require it.
        if (!local.has_tax_id) blockers.push('No tax_id (TIN) on the partner record — required for USD or recurring card capabilities.')
        if ((docCount ?? 0) === 0) blockers.push('No KYC documents uploaded.')

        return json({
            ok: discrepancies.length === 0,
            stage: holderId ? (kycStatusRemote || 'holder_linked') : 'not_submitted',
            local,
            xendit: {
                sub_account: {
                    id: acctBody.id ?? null,
                    email: acctBody.email ?? null,
                    type: acctBody.type ?? null,
                    status: acctBody.status ?? null,
                    account_holder_id: remoteHolderId,
                    // Proof the lookup resolved: HTTP 200 for this exact sub-account id.
                    lookup_http_status: acctRes.status,
                },
                raw_account: acctBody,
                channel_probe: channelProbe,
                // The id we actually queried. It may be OURS (fallback) rather than one
                // Xendit linked — surfacing it under "Xendit says" without that
                // distinction made an unlinked holder look confirmed. account_holder_linked
                // is the honest signal: true only when the SUB-ACCOUNT carries the link.
                account_holder_id: holderId,
                account_holder_linked: !!remoteHolderId,
                account_holder_id_source: remoteHolderId ? 'xendit' : (holderId ? 'local_fallback' : null),
                // Confirms the holder object itself exists at Xendit even when unlinked.
                account_holder_exists: holderBody ? !!(holderBody as any)?.id : false,
                kyc_status: kycStatusRemote,
                capabilities,
                raw_account_holder: holderBody,
                // The new verification API — the only place a resubmission reason exists.
                verification_status: verificationStatus,
                verification_lookup_http: verificationHttp,
                verification,
                orphaned_files: orphanedFiles,
            },
            discrepancies,
            blockers,
        })
    } catch (error: any) {
        console.error('xendit-account-status error:', error)
        return json({ error: 'Internal Server Error', message: error.message }, 500)
    }
})
