import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock, ShieldCheck } from 'lucide-react'
import { KYCVerificationForm } from './kyc-form'

export default async function VerificationPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select(`
            id, kyc_status, kyc_rejection_reason, business_name, business_type,
            representative_name, contact_number, nationality, place_of_birth, work_email,
            street_line1, street_line2, city, province_state, postal_code,
            tax_id, registration_number,
            business_industry_subcategory, business_establishment_date,
            business_intents, business_source_of_funds, business_average_monthly_basket_size,
            money_out_transaction_frequency, business_phone_country_code, business_phone_number,
            authorized_person_first_name, authorized_person_last_name, authorized_person_gender,
            authorized_person_date_of_birth, authorized_person_nationality, authorized_person_email,
            id_document_url, business_document_url, bir_2303_url,
            articles_of_incorporation_url, secretary_certificate_url, latest_gis_url
        `)
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        return <div>Error: Partner profile not found.</div>
    }

    const status = partner.kyc_status || 'not_started'

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

            {status === 'resubmission_required' && (
                <Card className="bg-amber-50 border-amber-200 mb-6">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                            <CardTitle className="text-amber-800">Additional Information Needed</CardTitle>
                            <CardDescription className="text-amber-700">
                                Our payment provider needs more from your submission. {partner.kyc_rejection_reason || 'Please review and resubmit.'}
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
                                Please update your submission. Reason: {partner.kyc_rejection_reason || 'Document mismatch'}
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {/* Submission Form — hidden while awaiting admin review ('pending_review')
                or payment-provider verification ('submitted') */}
            {(status === 'not_started' || status === 'rejected' || status === 'resubmission_required') && (
                <Card>
                    <CardHeader>
                        <CardTitle>Submit Verification</CardTitle>
                        <CardDescription>
                            Complete the form below to verify your identity and business.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <KYCVerificationForm
                            existingData={{
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
