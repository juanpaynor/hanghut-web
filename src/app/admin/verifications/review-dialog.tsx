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
import { getDocumentUrl, reviewKYC } from '@/lib/admin/verification-actions'
import { FileText, CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react'

interface PartnerKYC {
    id: string
    business_name: string
    representative_name: string
    contact_number: string
    id_document_url: string
    business_document_url: string | null
    digital_signature_text: string
    terms_accepted_ip: string
    terms_accepted_at: string
}

export function ReviewDialog({ partner }: { partner: PartnerKYC }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [docs, setDocs] = useState<{ id?: string, biz?: string }>({})
    const [viewingDocs, setViewingDocs] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [actionState, setActionState] = useState<'idle' | 'rejecting'>('idle')

    // Load signed URLs only when dialog opens
    const loadDocs = async () => {
        if (viewingDocs) return
        setViewingDocs(true)
        try {
            const idUrl = await getDocumentUrl(partner.id_document_url)
            let bizUrl = undefined
            if (partner.business_document_url) {
                bizUrl = await getDocumentUrl(partner.business_document_url)
            }
            setDocs({ id: idUrl, biz: bizUrl })
        } catch (e) {
            console.error('Failed to sign URLs', e)
        }
    }

    const handleAction = async (action: 'approve' | 'reject') => {
        if (action === 'reject' && actionState !== 'rejecting') {
            setActionState('rejecting')
            return
        }

        setLoading(true)
        const result = await reviewKYC(partner.id, action, rejectReason)
        setLoading(false)

        if (result?.error) {
            alert(`Error: ${result.error}`)
            return // Don't close dialog on error
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
                        <Label>Documents</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                    <span className="text-sm font-medium">ID Document</span>
                                </div>
                                {docs.id ? (
                                    <Button variant="ghost" size="sm" asChild>
                                        <a href={docs.id} target="_blank" rel="noopener noreferrer">
                                            View <ExternalLink className="ml-1 h-3 w-3" />
                                        </a>
                                    </Button>
                                ) : (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                            </div>

                            {partner.business_document_url && (
                                <div className="border rounded p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-orange-500" />
                                        <span className="text-sm font-medium">Business Doc</span>
                                    </div>
                                    {docs.biz ? (
                                        <Button variant="ghost" size="sm" asChild>
                                            <a href={docs.biz} target="_blank" rel="noopener noreferrer">
                                                View <ExternalLink className="ml-1 h-3 w-3" />
                                            </a>
                                        </Button>
                                    ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                            )}
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
