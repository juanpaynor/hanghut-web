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
        .select('id, business_name, representative_name, contact_number, kyc_status, terms_accepted_at, id_document_url, business_document_url, digital_signature_text, terms_accepted_ip')
        .eq('kyc_status', 'pending_review')
        .order('terms_accepted_at', { ascending: false })

    if (error) {
        return <div className="p-8 text-red-500">Failed to load verifications: {error.message}</div>
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
                                        <ReviewDialog partner={partner} />
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
