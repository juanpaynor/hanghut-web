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
}

// KYC document fields in display order
const KYC_DOC_FIELDS: { key: keyof PartnerKYC; label: string }[] = [
    { key: 'id_document_url', label: 'Government ID' },
    { key: 'business_document_url', label: 'Business Registration (DTI/SEC)' },
    { key: 'bir_2303_url', label: 'BIR 2303' },
    { key: 'articles_of_incorporation_url', label: 'Articles of Incorporation' },
    { key: 'secretary_certificate_url', label: "Secretary's Certificate" },
    { key: 'latest_gis_url', label: 'Latest GIS' },
]

export function ReviewDialog({ partner }: { partner: PartnerKYC }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [docs, setDocs] = useState<Record<string, string>>({})
    const [viewingDocs, setViewingDocs] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [feePercentage, setFeePercentage] = useState(4)
    const [passFeesToCustomer, setPassFeesToCustomer] = useState(true)
    const [actionState, setActionState] = useState<'idle' | 'rejecting'>('idle')

    // Load signed URLs only when dialog opens (all uploaded KYC docs)
    const loadDocs = async () => {
        if (viewingDocs) return
        setViewingDocs(true)
        const signed: Record<string, string> = {}
        for (const { key } of KYC_DOC_FIELDS) {
            const path = partner[key] as string | null
            if (!path) continue
            try {
                signed[key] = await getDocumentUrl(path)
            } catch (e) {
                console.error(`Failed to sign URL for ${key}`, e)
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
        const result = await reviewKYC(partner.id, action, rejectReason, feePercentage, passFeesToCustomer)
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
                            {KYC_DOC_FIELDS.filter(({ key }) => partner[key]).map(({ key, label }) => (
                                <div key={key} className="border rounded p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-medium">{label}</span>
                                    </div>
                                    {docs[key] ? (
                                        <Button variant="ghost" size="sm" asChild>
                                            <a href={docs[key]} target="_blank" rel="noopener noreferrer">
                                                View <ExternalLink className="ml-1 h-3 w-3" />
                                            </a>
                                        </Button>
                                    ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                            ))}
                            {KYC_DOC_FIELDS.every(({ key }) => !partner[key]) && (
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

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="pass-fees"
                                checked={passFeesToCustomer}
                                onCheckedChange={(checked) => setPassFeesToCustomer(checked === true)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="pass-fees"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Pass fees to customer?
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Expected behavior: {passFeesToCustomer
                                        ? `Customer pays fee on top (e.g. ₱1,150 for ₱1,000 item)`
                                        : `Host absorbs fee (e.g. earns ₱850 on ₱1,000 item)`
                                    }
                                </p>
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
