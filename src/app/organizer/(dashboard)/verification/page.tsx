import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock, ShieldCheck, CreditCard, Wallet, Lock } from 'lucide-react'
import { KYCVerificationForm } from './kyc-form'
import { ServiceAgreementSign } from '@/components/organizer/service-agreement-sign'

/**
 * Verification intake.
 *
 * Normally scoped to the signed-in partner. An admin may append
 * `?partner_id=<uuid>` to open ANOTHER partner's verification and complete or
 * correct it on their behalf — KYC repeatedly stalls on fields a client can't
 * interpret, and the alternative is walking someone through their own tax
 * documents over a screen share.
 *
 * Deliberately the same form, not an admin copy: a second implementation would
 * drift from this one the first time Xendit changes a requirement, and the
 * divergence would only surface as a rejection weeks later.
 */
export default async function VerificationPage({
    searchParams,
}: {
    searchParams: Promise<{ partner_id?: string }>
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/organizer/login')
    }

    const { partner_id: requestedPartnerId } = await searchParams

    // Admin status is read server-side and never trusted from the URL.
    let isAdminActing = false
    if (requestedPartnerId) {
        const { data: caller } = await supabase
            .from('users').select('is_admin').eq('id', user.id).single()
        if (!caller?.is_admin) redirect('/organizer/verification')
        isAdminActing = true
    }

    const { data: partner } = await supabase
        .from('partners')
        .select(`
            id, kyc_status, kyc_rejection_reason, kyc_failure_reasons, business_name, business_type, xendit_cards_gcash_live,
            representative_name, contact_number, nationality, place_of_birth, work_email,
            street_line1, street_line2, city, province_state, postal_code,
            tax_id, registration_number, legal_entity_address,
            business_description, shareholders_include_corporate_entity, social_links,
            kyc_submitted_by_admin, kyc_submitted_at,
            business_industry_subcategory, business_establishment_date,
            business_intents, business_source_of_funds, business_average_monthly_basket_size,
            money_out_transaction_frequency, business_phone_country_code, business_phone_number,
            authorized_person_first_name, authorized_person_last_name, authorized_person_gender,
            authorized_person_date_of_birth, authorized_person_nationality, authorized_person_email,
            id_document_url, business_document_url, bir_2303_url,
            articles_of_incorporation_url, secretary_certificate_url, latest_gis_url
        `)
        .match(requestedPartnerId ? { id: requestedPartnerId } : { user_id: user.id })
        .single()

    if (!partner) {
        return <div>Error: Partner profile not found.</div>
    }

    const status = partner.kyc_status || 'not_started'

    // Per-document failures from the payment provider, when we have them.
    const kycReasons: { field?: string; message?: string }[] =
        Array.isArray(partner.kyc_failure_reasons) ? (partner.kyc_failure_reasons as any) : []

    // A partner may only edit while the form is actionable. An admin acting on
    // their behalf must be able to edit at ANY status — the case this exists for
    // is precisely a stuck 'submitted' record that Xendit has since bounced, which
    // the partner themselves can no longer touch.
    const partnerCanEdit = status === 'not_started' || status === 'rejected' || status === 'resubmission_required'
    const showForm = partnerCanEdit || isAdminActing

    // Build the existing-docs map (slot -> storage path) the form uses to offer
    // "previously uploaded" reuse. Prefer normalized rows; fall back to legacy columns.
    const existingDocs: Record<string, string> = {}
    const { data: docRows } = await supabase
        .from('partner_kyc_documents')
        .select('owner_kind, doc_type, storage_path')
        .eq('partner_id', partner.id)
        .eq('owner_kind', 'business')
    for (const d of docRows ?? []) existingDocs[`business:${d.doc_type}`] = d.storage_path
    const { data: authDocRows } = await supabase
        .from('partner_kyc_documents')
        .select('doc_type, storage_path')
        .eq('partner_id', partner.id)
        .eq('owner_kind', 'authorized_person')
    for (const d of authDocRows ?? []) existingDocs[`authorized:${d.doc_type}`] = d.storage_path
    // Legacy fallbacks (registration-era columns) keyed to current entity's slots.
    const regDocType = partner.business_type === 'sole_proprietorship'
        ? 'PH_DTI_CERTIFICATE_REGISTRATION' : 'PH_SEC_CERTIFICATE_REGISTRATION'
    const legacy: [string, string | null][] = [
        ['authorized:ID_FRONT', partner.id_document_url],
        [`business:${regDocType}`, partner.business_document_url],
        ['business:PH_BIR_2303', partner.bir_2303_url],
        ['business:PH_ARTICLES_OF_INCORPORATION', partner.articles_of_incorporation_url],
        ['business:PH_NOTARIZED_SECRETARY_CERTIFICATE', partner.secretary_certificate_url],
        ['business:PH_GIS', partner.latest_gis_url],
    ]
    for (const [slot, path] of legacy) if (path && !existingDocs[slot]) existingDocs[slot] = path

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Verification</h1>
                    <p className="text-muted-foreground">
                        Verify your identity to unlock payouts and public features.
                    </p>
                </div>
            </div>

            {/* Status Cards */}
            {status === 'verified' && (
                <Card className="bg-green-50 border-green-200">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <ShieldCheck className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <CardTitle className="text-green-800">Account Verified</CardTitle>
                            <CardDescription className="text-green-700">
                                You have full access to all HangHut organizer features.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {status === 'pending_review' && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle className="text-blue-800">Verification In Progress</CardTitle>
                            <CardDescription className="text-blue-700">
                                Our team is reviewing your documents. This usually takes 24-48 hours.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {status === 'submitted' && (
                <Card className="bg-indigo-50 border-indigo-200">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <CardTitle className="text-indigo-800">Verifying with payment provider</CardTitle>
                            <CardDescription className="text-indigo-700">
                                Your documents were submitted to our payment provider for verification.
                                GCash &amp; card payments unlock once approved — usually 1–3 business days.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {/* Xendit rejects PER DOCUMENT, so show it per document. Collapsing six
                distinct problems into one sentence is what left partners guessing
                which file to re-upload. Falls back to the sentence when the
                structured list is absent (older rejections, or a provider that
                only sent prose). */}
            {(() => {
                const reasons = kycReasons
                if (reasons.length === 0) return null
                if (status !== 'resubmission_required' && status !== 'rejected') return null
                return (
                    <Card className="bg-amber-50 border-amber-200 mb-6">
                        <CardHeader>
                            <CardTitle className="text-amber-900 text-base">
                                {reasons.length} {reasons.length === 1 ? 'item needs' : 'items need'} attention
                            </CardTitle>
                            <CardDescription className="text-amber-800">
                                Fix each of these, then submit again.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <ul className="space-y-3">
                                {reasons.map((r, i) => (
                                    <li key={i} className="text-sm">
                                        <span className="font-medium text-amber-900">
                                            {(r.field || 'Submission')
                                                .replace(/_DOCUMENT$/, '')
                                                .replace(/_/g, ' ')
                                                .replace(/\b\w/g, c => c.toUpperCase())}
                                        </span>
                                        <p className="text-amber-800 mt-0.5">{r.message}</p>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )
            })()}

            {status === 'resubmission_required' && (
                <Card className="bg-amber-50 border-amber-200 mb-6">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                            <CardTitle className="text-amber-800">Additional Information Needed</CardTitle>
                            <CardDescription className="text-amber-700">
                                Our payment provider needs more from your submission. {kycReasons.length > 0 ? 'The items above show exactly what to fix.' : (partner.kyc_rejection_reason || 'Please review and resubmit.')}
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {status === 'rejected' && (
                <Card className="bg-red-50 border-red-200 mb-6">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                            <CardTitle className="text-red-800">Verification Rejected</CardTitle>
                            <CardDescription className="text-red-700">
                                Please update your submission. {kycReasons.length > 0 ? 'The items above show exactly what to fix.' : `Reason: ${partner.kyc_rejection_reason || 'Document mismatch'}`}
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {/* Payment methods — what's accepted now vs. what needs verification */}
            {(() => {
                const cardsLive = partner.xendit_cards_gcash_live === true
                // State of the Cards + GCash capability:
                //   live      → active
                //   verified  → KYC passed, Xendit is still activating the capability
                //   otherwise → needs a completed & passed KYC first
                const gated: 'live' | 'activating' | 'needs_kyc' =
                    cardsLive ? 'live' : status === 'verified' ? 'activating' : 'needs_kyc'

                const baseChannels = ['Maya', 'GrabPay', 'Bank Direct Debit (BPI, UnionBank, RCBC)']

                return (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Payment Methods</CardTitle>
                            <CardDescription>What your customers can use to pay you.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Always available */}
                            <div className="flex items-start gap-3 rounded-lg border bg-green-50/50 border-green-200 p-3">
                                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-green-900">Active now</p>
                                    <p className="text-xs text-green-700/90">{baseChannels.join(' · ')}</p>
                                </div>
                            </div>

                            {/* Cards + GCash — capability-gated */}
                            <div className={
                                gated === 'live'
                                    ? 'flex items-start gap-3 rounded-lg border bg-green-50/50 border-green-200 p-3'
                                    : gated === 'activating'
                                    ? 'flex items-start gap-3 rounded-lg border bg-blue-50/60 border-blue-200 p-3'
                                    : 'flex items-start gap-3 rounded-lg border bg-amber-50/60 border-amber-200 p-3'
                            }>
                                {gated === 'live'
                                    ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                                    : gated === 'activating'
                                    ? <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                                    : <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                        <p className="text-sm font-medium">Cards &amp; GCash</p>
                                    </div>
                                    {gated === 'live' && (
                                        <p className="text-xs text-green-700/90 mt-0.5">
                                            Active — customers can pay with credit/debit cards and GCash.
                                        </p>
                                    )}
                                    {gated === 'activating' && (
                                        <p className="text-xs text-blue-700/90 mt-0.5">
                                            Your verification passed. Xendit is enabling Cards &amp; GCash for your account —
                                            this can take up to a few business days. We&apos;ll switch them on automatically once approved.
                                        </p>
                                    )}
                                    {gated === 'needs_kyc' && (
                                        <p className="text-xs text-amber-700/90 mt-0.5">
                                            Cards &amp; GCash require additional verification by our payment provider (Xendit).
                                            Complete your verification below — including your TIN and authorized person / owner IDs —
                                            and we&apos;ll request activation for you automatically once you&apos;re verified.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            })()}

            {/* E-sign the Xendit Service Agreement (self-rolled e-consent → SERVICE_AGREEMENT_DOCUMENT) */}
            {partnerCanEdit && !isAdminActing && (
                <div className="mb-6"><ServiceAgreementSign /></div>
            )}

            {/* Submission Form — hidden while awaiting admin review ('pending_review')
                or payment-provider verification ('submitted') */}
            {showForm && (
                <Card>
                    {isAdminActing && (
                        <div className="rounded-t-lg border-b bg-amber-50 px-6 py-3 text-sm text-amber-900">
                            <span className="font-semibold">Admin mode</span> — editing{' '}
                            <span className="font-semibold">{partner.business_name}</span> on their behalf.
                            Submitting records you as the submitter and sets their status to pending review.
                            {partner.kyc_submitted_at && (
                                <span className="block text-xs mt-0.5 opacity-80">
                                    Last submitted {new Date(partner.kyc_submitted_at).toLocaleString('en-PH')}
                                    {partner.kyc_submitted_by_admin ? ' by an admin' : ' by the partner'}.
                                </span>
                            )}
                        </div>
                    )}
                    <CardHeader>
                        <CardTitle>{isAdminActing ? 'Verification details' : 'Submit Verification'}</CardTitle>
                        <CardDescription>
                            {isAdminActing
                                ? 'Every field is editable. Values already on file are pre-filled.'
                                : 'Complete the form below to verify your identity and business.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <KYCVerificationForm
                            adminPartnerId={isAdminActing ? partner.id : undefined}
                            existingData={{
                                registration_number: partner.registration_number,
                                business_description: partner.business_description,
                                shareholders_include_corporate_entity: partner.shareholders_include_corporate_entity,
                                business_type: partner.business_type,
                                business_name: partner.business_name,
                                representative_name: partner.representative_name,
                                contact_number: partner.contact_number,
                                nationality: partner.nationality,
                                work_email: partner.work_email,
                                business_industry_subcategory: partner.business_industry_subcategory,
                                business_establishment_date: partner.business_establishment_date,
                                business_intents: partner.business_intents,
                                business_source_of_funds: partner.business_source_of_funds,
                                business_average_monthly_basket_size: partner.business_average_monthly_basket_size,
                                money_out_transaction_frequency: partner.money_out_transaction_frequency,
                                business_phone_country_code: partner.business_phone_country_code,
                                business_phone_number: partner.business_phone_number,
                                tax_id: partner.tax_id,
                                street_line1: partner.street_line1,
                                street_line2: partner.street_line2,
                                city: partner.city,
                                province_state: partner.province_state,
                                postal_code: partner.postal_code,
                                legal_entity_address: (partner as any).legal_entity_address,
                                authorized_person_first_name: partner.authorized_person_first_name,
                                authorized_person_last_name: partner.authorized_person_last_name,
                                authorized_person_gender: partner.authorized_person_gender,
                                authorized_person_date_of_birth: partner.authorized_person_date_of_birth,
                                authorized_person_nationality: partner.authorized_person_nationality,
                                authorized_person_email: partner.authorized_person_email,
                                existing_docs: existingDocs,
                            }}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
