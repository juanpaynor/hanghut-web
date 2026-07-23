'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { getDocumentUrl, reviewKYC } from '@/lib/admin/verification-actions'
import { FileText, CheckCircle, ExternalLink, Loader2 } from 'lucide-react'

interface PartnerKYC {
    id: string
    business_name: string
    business_type: string | null
    representative_name: string
    contact_number: string
    id_document_url: string | null
    business_document_url: string | null
    bir_2303_url: string | null
    articles_of_incorporation_url: string | null
    secretary_certificate_url: string | null
    latest_gis_url: string | null
    digital_signature_text: string
    terms_accepted_ip: string
    terms_accepted_at: string
    // Business profile (account_verification)
    business_industry_subcategory?: string | null
    business_establishment_date?: string | null
    business_intents?: string[] | null
    business_source_of_funds?: string[] | null
    business_average_monthly_basket_size?: string | null
    money_out_transaction_frequency?: string | null
    authorized_person_first_name?: string | null
    authorized_person_last_name?: string | null
    authorized_person_gender?: string | null
    authorized_person_date_of_birth?: string | null
    authorized_person_nationality?: string | null
    authorized_person_email?: string | null
    authorized_person_role?: string | null
    contact_person_first_name?: string | null
    contact_person_last_name?: string | null
    contact_person_email?: string | null
}

interface KycDoc {
    owner_kind: string
    owner_id: string | null
    doc_type: string
    storage_path: string
}
interface Stakeholder {
    id: string
    roles: string[] | null
    first_name: string
    last_name: string
    nationality: string | null
    date_of_birth: string | null
    is_authorized_person: boolean
    identification: { type?: string; number?: string } | null
}

// Legacy *_url fallbacks (pre-normalized partners)
const LEGACY_DOC_FIELDS: { key: keyof PartnerKYC; label: string }[] = [
    { key: 'id_document_url', label: 'Government ID' },
    { key: 'business_document_url', label: 'Business Registration (DTI/SEC)' },
    { key: 'bir_2303_url', label: 'BIR 2303' },
    { key: 'articles_of_incorporation_url', label: 'Articles of Incorporation' },
    { key: 'secretary_certificate_url', label: "Secretary's Certificate" },
    { key: 'latest_gis_url', label: 'Latest GIS' },
]

export function ReviewDialog({ partner, documents = [], stakeholders = [] }: {
    partner: PartnerKYC; documents?: KycDoc[]; stakeholders?: Stakeholder[]
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [docs, setDocs] = useState<Record<string, string>>({}) // storage_path | legacy:key -> signed url
    const [viewingDocs, setViewingDocs] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [feePercentage, setFeePercentage] = useState(4)
    const [fixedFeePerTicket, setFixedFeePerTicket] = useState(15)
    // Defaults for a new partner: pass the ₱15 booking fee, absorb the 2% commission.
    const [passFixedToCustomer, setPassFixedToCustomer] = useState(true)
    const [passPercentageToCustomer, setPassPercentageToCustomer] = useState(false)
    const [actionState, setActionState] = useState<'idle' | 'rejecting'>('idle')

    const useNormalized = documents.length > 0
    const stakeholderName = (id: string | null) => {
        const s = stakeholders.find(x => x.id === id)
        return s ? `${s.first_name} ${s.last_name}` : 'Stakeholder'
    }
    const docLabel = (d: KycDoc) => {
        const who = d.owner_kind === 'authorized_person' ? 'Authorized' : d.owner_kind === 'stakeholder' ? stakeholderName(d.owner_id) : 'Business'
        return `${who} — ${d.doc_type.replace(/_/g, ' ')}`
    }

    // Load signed URLs only when dialog opens.
    const loadDocs = async () => {
        if (viewingDocs) return
        setViewingDocs(true)
        const signed: Record<string, string> = {}
        if (useNormalized) {
            for (const d of documents) {
                try { signed[d.storage_path] = await getDocumentUrl(d.storage_path) }
                catch (e) { console.error(`Failed to sign URL for ${d.doc_type}`, e) }
            }
        } else {
            for (const { key } of LEGACY_DOC_FIELDS) {
                const path = partner[key] as string | null
                if (!path) continue
                try { signed[`legacy:${key}`] = await getDocumentUrl(path) }
                catch (e) { console.error(`Failed to sign URL for ${key}`, e) }
            }
        }
        setDocs(signed)
    }

    const handleAction = async (action: 'approve' | 'reject') => {
        if (action === 'reject' && actionState !== 'rejecting') {
            setActionState('rejecting')
            return
        }

        setLoading(true)
        const result = await reviewKYC(partner.id, action, rejectReason, feePercentage, passFixedToCustomer, fixedFeePerTicket, passPercentageToCustomer)
        setLoading(false)

        if (result?.error) {
            alert(`Error: ${result.error}`)
            return // Don't close dialog on error
        }

        if (result?.warning) {
            alert(result.warning)
        }

        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (val) loadDocs()
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Review</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Review Verification: {partner.business_name}</DialogTitle>
                    <DialogDescription>
                        Submitted by {partner.representative_name} on {new Date(partner.terms_accepted_at).toLocaleDateString()}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Contact Info */}
                    <div className="grid grid-cols-2 gap-4 border-b pb-4">
                        <div>
                            <Label className="text-muted-foreground">Representative</Label>
                            <p className="font-medium">{partner.representative_name}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Phone</Label>
                            <p className="font-medium">{partner.contact_number}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Signed As</Label>
                            <p className="font-mono text-sm bg-muted inline-block px-1 rounded">
                                {partner.digital_signature_text}
                            </p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">IP Address</Label>
                            <p className="font-mono text-sm">{partner.terms_accepted_ip || 'N/A'}</p>
                        </div>
                    </div>

                    {/* Business profile */}
                    {(partner.business_intents?.length || partner.business_source_of_funds?.length || partner.business_establishment_date) && (
                        <div className="space-y-2 border-b pb-4 text-sm">
                            <Label>Business Profile</Label>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {partner.business_industry_subcategory && <p><span className="text-muted-foreground">Industry:</span> {partner.business_industry_subcategory}</p>}
                                {partner.business_establishment_date && <p><span className="text-muted-foreground">Established:</span> {partner.business_establishment_date}</p>}
                                {partner.business_intents?.length ? <p className="col-span-2"><span className="text-muted-foreground">Intents:</span> {partner.business_intents.join(', ')}</p> : null}
                                {partner.business_source_of_funds?.length ? <p className="col-span-2"><span className="text-muted-foreground">Source of funds:</span> {partner.business_source_of_funds.join(', ')}</p> : null}
                                {partner.business_average_monthly_basket_size && <p><span className="text-muted-foreground">Basket size:</span> {partner.business_average_monthly_basket_size}</p>}
                                {partner.money_out_transaction_frequency && <p><span className="text-muted-foreground">Payout freq:</span> {partner.money_out_transaction_frequency}</p>}
                            </div>
                        </div>
                    )}

                    {/* Authorized & contact person */}
                    {(partner.authorized_person_first_name || partner.contact_person_first_name) && (
                        <div className="space-y-2 border-b pb-4 text-sm">
                            <Label>People</Label>
                            {partner.authorized_person_first_name && (
                                <p><span className="text-muted-foreground">Authorized:</span> {partner.authorized_person_first_name} {partner.authorized_person_last_name}
                                    {partner.authorized_person_role ? ` (${partner.authorized_person_role})` : ''}
                                    {partner.authorized_person_date_of_birth ? ` · DOB ${partner.authorized_person_date_of_birth}` : ''}
                                    {partner.authorized_person_email ? ` · ${partner.authorized_person_email}` : ''}</p>
                            )}
                            {partner.contact_person_first_name && (
                                <p><span className="text-muted-foreground">Contact:</span> {partner.contact_person_first_name} {partner.contact_person_last_name}
                                    {partner.contact_person_email ? ` · ${partner.contact_person_email}` : ''}</p>
                            )}
                        </div>
                    )}

                    {/* Stakeholders */}
                    {stakeholders.length > 0 && (
                        <div className="space-y-2 border-b pb-4 text-sm">
                            <Label>Stakeholders ({stakeholders.length})</Label>
                            {stakeholders.map(s => (
                                <div key={s.id} className="rounded border p-2">
                                    <p className="font-medium">{s.first_name} {s.last_name}
                                        {s.roles?.length ? <span className="text-muted-foreground font-normal"> — {s.roles.join(', ')}</span> : null}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {[s.nationality, s.date_of_birth, s.identification?.type, s.identification?.number].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Documents */}
                    <div className="space-y-3 border-b pb-4">
                        <div className="flex items-center justify-between">
                            <Label>Documents</Label>
                            {partner.business_type && (
                                <span className="text-xs text-muted-foreground capitalize">
                                    {partner.business_type.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {useNormalized ? documents.map((d, i) => (
                                <div key={`${d.storage_path}-${i}`} className="border rounded p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                                        <span className="text-sm font-medium truncate capitalize">{docLabel(d)}</span>
                                    </div>
                                    {docs[d.storage_path] ? (
                                        <Button variant="ghost" size="sm" asChild>
                                            <a href={docs[d.storage_path]} target="_blank" rel="noopener noreferrer">View <ExternalLink className="ml-1 h-3 w-3" /></a>
                                        </Button>
                                    ) : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                </div>
                            )) : LEGACY_DOC_FIELDS.filter(({ key }) => partner[key]).map(({ key, label }) => (
                                <div key={key} className="border rounded p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-medium">{label}</span>
                                    </div>
                                    {docs[`legacy:${key}`] ? (
                                        <Button variant="ghost" size="sm" asChild>
                                            <a href={docs[`legacy:${key}`]} target="_blank" rel="noopener noreferrer">View <ExternalLink className="ml-1 h-3 w-3" /></a>
                                        </Button>
                                    ) : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                </div>
                            ))}
                            {!useNormalized && LEGACY_DOC_FIELDS.every(({ key }) => !partner[key]) && (
                                <p className="text-sm text-muted-foreground col-span-2">No documents uploaded.</p>
                            )}
                        </div>
                    </div>

                    {/* Verification Settings */}
                    <div className="bg-slate-50 p-4 rounded-md space-y-4 border border-slate-100">
                        <div className="space-y-2">
                            <Label>Platform Fee (%)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={feePercentage}
                                    onChange={(e) => setFeePercentage(Number(e.target.value))}
                                    className="bg-white max-w-[120px]"
                                />
                                <span className="text-sm text-muted-foreground">Default: 4%</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Fixed Booking Fee (₱ per ticket)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    value={fixedFeePerTicket}
                                    onChange={(e) => setFixedFeePerTicket(Number(e.target.value))}
                                    className="bg-white max-w-[120px]"
                                />
                                <span className="text-sm text-muted-foreground">Default: ₱15</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="pass-fixed"
                                    checked={passFixedToCustomer}
                                    onCheckedChange={(checked) => setPassFixedToCustomer(checked === true)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor="pass-fixed" className="text-sm font-medium leading-none">
                                        Pass ₱{fixedFeePerTicket || 15} booking fee to customer?
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        {passFixedToCustomer
                                            ? 'Added to the buyer’s total at checkout.'
                                            : 'Absorbed by the host (deducted from payout).'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="pass-pct"
                                    checked={passPercentageToCustomer}
                                    onCheckedChange={(checked) => setPassPercentageToCustomer(checked === true)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor="pass-pct" className="text-sm font-medium leading-none">
                                        Pass {feePercentage || 2}% commission to customer?
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        {passPercentageToCustomer
                                            ? 'Added to the buyer’s total at checkout.'
                                            : 'Absorbed by the host (deducted from payout).'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rejection Handling */}
                    {actionState === 'rejecting' && (
                        <div className="bg-red-50 p-4 rounded-md space-y-2 animate-in slide-in-from-top-2">
                            <Label className="text-red-800">Reason for Rejection</Label>
                            <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="e.g. ID is blurry, Name mismatch..."
                                className="bg-white"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:justify-end">
                    {actionState === 'idle' ? (
                        <>
                            <Button
                                variant="destructive"
                                onClick={() => handleAction('reject')}
                                disabled={loading}
                            >
                                Reject
                            </Button>
                            <Button
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleAction('approve')}
                                disabled={loading}
                            >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Approve & Verify
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                onClick={() => setActionState('idle')}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => handleAction('reject')}
                                disabled={loading || !rejectReason}
                            >
                                {loading ? 'Rejecting...' : 'Confirm Rejection'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
