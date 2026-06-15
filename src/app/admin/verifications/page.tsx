import { createClient } from '@/lib/supabase/server'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ReviewDialog } from './review-dialog'
import { redirect } from 'next/navigation'

export default async function AdminVerificationsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Verify Admin
    const { data: adminUser } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!adminUser?.is_admin) {
        return <div className="p-8">Access Denied. Admins only.</div>
    }

    // Fetch Pending Verifications
    const { data: partners, error } = await supabase
        .from('partners')
        .select(`id, business_name, business_type, representative_name, contact_number, kyc_status, terms_accepted_at,
            id_document_url, business_document_url, bir_2303_url, articles_of_incorporation_url, secretary_certificate_url, latest_gis_url,
            digital_signature_text, terms_accepted_ip,
            business_industry_subcategory, business_establishment_date, business_intents, business_source_of_funds,
            business_average_monthly_basket_size, money_out_transaction_frequency,
            authorized_person_first_name, authorized_person_last_name, authorized_person_gender,
            authorized_person_date_of_birth, authorized_person_nationality, authorized_person_email, authorized_person_role,
            contact_person_first_name, contact_person_last_name, contact_person_email`)
        .eq('kyc_status', 'pending_review')
        .order('terms_accepted_at', { ascending: false })

    if (error) {
        return <div className="p-8 text-red-500">Failed to load verifications: {error.message}</div>
    }

    // Pull normalized KYC docs + stakeholders for the pending partners and group by partner.
    const partnerIds = (partners ?? []).map(p => p.id)
    const docsByPartner: Record<string, any[]> = {}
    const stakeholdersByPartner: Record<string, any[]> = {}
    if (partnerIds.length) {
        const { data: allDocs } = await supabase
            .from('partner_kyc_documents')
            .select('partner_id, owner_kind, owner_id, doc_type, storage_path')
            .in('partner_id', partnerIds)
        for (const d of allDocs ?? []) (docsByPartner[d.partner_id] ||= []).push(d)
        const { data: allStakeholders } = await supabase
            .from('partner_stakeholders')
            .select('id, partner_id, roles, first_name, last_name, nationality, date_of_birth, is_authorized_person, identification')
            .in('partner_id', partnerIds)
        for (const s of allStakeholders ?? []) (stakeholdersByPartner[s.partner_id] ||= []).push(s)
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Pending Verifications</h1>
                    <p className="text-muted-foreground">
                        Review and approve partner identity documents.
                    </p>
                </div>
                <Badge variant="outline" className="text-lg px-4 py-1">
                    {partners?.length || 0} Pending
                </Badge>
            </div>

            <div className="border rounded-md bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Business Name</TableHead>
                            <TableHead>Representative</TableHead>
                            <TableHead>Submission Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {partners && partners.length > 0 ? (
                            partners.map((partner) => (
                                <TableRow key={partner.id}>
                                    <TableCell className="font-medium">
                                        {partner.business_name}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span>{partner.representative_name}</span>
                                            <span className="text-xs text-muted-foreground">{partner.contact_number}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(partner.terms_accepted_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 uppercase text-xs">
                                            Needs Review
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <ReviewDialog
                                            partner={partner}
                                            documents={docsByPartner[partner.id] || []}
                                            stakeholders={stakeholdersByPartner[partner.id] || []}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No pending verifications.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
