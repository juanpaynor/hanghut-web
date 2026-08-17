'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Ban, DollarSign, ExternalLink, Phone, MapPin, FileText, ShieldCheck } from 'lucide-react'
import { approvePartner, rejectPartner, setCustomPricing, suspendPartner, reactivatePartner, resetToStandardPricing, setAutoApprovePayouts, setPartnerCapabilities, setSubscriptionsEnabled, setMerchEnabled, setPartnerWalletMode, getXenditAccountStatus, createPartnerXenditSubaccount, submitPartnerKycToXendit, updatePartnerKycDetails, getPartnerKycDocuments, type XenditStatusReport, type PartnerKycDoc } from '@/lib/admin/partner-actions'
import { useRouter } from 'next/navigation'

interface Partner {
    id: string
    user_id: string
    business_name: string
    business_type: string | null
    status: string
    verified: boolean
    pricing_model: string
    custom_percentage: number | null
    pass_fees_to_customer: boolean
    pass_fixed_to_customer: boolean
    pass_percentage_to_customer: boolean
    fixed_fee_per_ticket: number
    auto_approve_payouts: boolean
    created_at: string
    approved_at: string | null
    xendit_account_id: string | null
    kyc_status: string | null
    kyc_rejection_reason: string | null
    slug: string | null
    // Contact & representative
    contact_number: string | null
    representative_name: string | null
    work_email: string | null
    nationality: string | null
    place_of_birth: string | null
    tax_id: string | null
    // Address
    street_line1: string | null
    street_line2: string | null
    city: string | null
    province_state: string | null
    postal_code: string | null
    // Bank info
    bank_name: string | null
    bank_account_number: string | null
    bank_account_name: string | null
    // KYC documents
    id_document_url: string | null
    business_document_url: string | null
    bir_2303_url: string | null
    articles_of_incorporation_url: string | null
    secretary_certificate_url: string | null
    latest_gis_url: string | null
    // Capabilities
    capabilities: string[] | null
    // Admin notes
    admin_notes: string | null
    user: {
        id: string
        display_name: string
        email: string
    } | null
}

interface PartnerDetailModalProps {
    partner: Partner
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function PartnerDetailModal({ partner, open, onOpenChange }: PartnerDetailModalProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [pricingModel, setPricingModel] = useState(partner.pricing_model || 'standard')
    const [customPercentage, setCustomPercentage] = useState(partner.custom_percentage?.toString() || '2')
    const [adminNotes, setAdminNotes] = useState('')
    const [autoApprovePayouts, setAutoApprovePayoutsState] = useState(partner.auto_approve_payouts || false)
    const [subscriptionsEnabled, setSubscriptionsEnabledState] = useState<boolean>((partner as any).subscriptions_enabled ?? false)
    const [merchEnabled, setMerchEnabledState] = useState<boolean>((partner as any).merch_enabled ?? false)
    const [useMainWallet, setUseMainWalletState] = useState<boolean>((partner as any).use_main_wallet ?? false)
    const [xenditReport, setXenditReport] = useState<XenditStatusReport | null>(null)
    const [xenditChecking, setXenditChecking] = useState(false)
    const [xenditSubmitting, setXenditSubmitting] = useState(false)
    const [xenditCreatingSub, setXenditCreatingSub] = useState(false)
    const [xenditError, setXenditError] = useState<string | null>(null)
    const [kycTaxId, setKycTaxId] = useState(partner.tax_id || '')
    const [kycStreet1, setKycStreet1] = useState(partner.street_line1 || '')
    const [kycStreet2, setKycStreet2] = useState(partner.street_line2 || '')
    const [kycCity, setKycCity] = useState(partner.city || '')
    const [kycProvince, setKycProvince] = useState(partner.province_state || '')
    const [kycPostal, setKycPostal] = useState(partner.postal_code || '')
    const [kycSaving, setKycSaving] = useState(false)
    const [kycSaved, setKycSaved] = useState<string | null>(null)
    const [kycDocs, setKycDocs] = useState<PartnerKycDoc[] | null>(null)
    const [docsLoading, setDocsLoading] = useState(false)
    const [docsError, setDocsError] = useState<string | null>(null)

    const handleApprove = async () => {
        setIsLoading(true)
        try {
            await approvePartner(partner.id)
            router.refresh()
            onOpenChange(false)
        } catch (error) {
            console.error('Error approving partner:', error)
            alert('Failed to approve partner')
        } finally {
            setIsLoading(false)
        }
    }

    const handleReject = async () => {
        if (!adminNotes.trim()) {
            alert('Please provide a reason for rejection')
            return
        }

        setIsLoading(true)
        try {
            await rejectPartner(partner.id, adminNotes)
            router.refresh()
            onOpenChange(false)
        } catch (error) {
            console.error('Error rejecting partner:', error)
            alert('Failed to reject partner')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSuspend = async () => {
        if (!adminNotes.trim()) {
            alert('Please provide a reason for suspension')
            return
        }

        setIsLoading(true)
        try {
            await suspendPartner(partner.id, adminNotes)
            router.refresh()
            onOpenChange(false)
        } catch (error) {
            console.error('Error suspending partner:', error)
            alert('Failed to suspend partner')
        } finally {
            setIsLoading(false)
        }
    }

    const handleReactivate = async () => {
        if (!confirm(`Are you sure you want to reinstate ${partner.business_name}?`)) return

        setIsLoading(true)
        try {
            await reactivatePartner(partner.id)
            router.refresh()
            onOpenChange(false)
        } catch (error) {
            console.error('Error reactivating partner:', error)
            alert('Failed to reinstate partner')
        } finally {
            setIsLoading(false)
        }
    }

    const [capabilities, setCapabilities] = useState<string[]>(partner.capabilities ?? ['organizer'])

    const toggleCapability = (cap: string) => {
        setCapabilities(prev =>
            prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
        )
    }

    const handleSaveCapabilities = async () => {
        if (capabilities.length === 0) return
        setIsLoading(true)
        try {
            await setPartnerCapabilities(partner.id, capabilities)
            router.refresh()
        } catch {
            alert('Failed to update capabilities')
        } finally {
            setIsLoading(false)
        }
    }

    const [passFixedToCustomer, setPassFixedToCustomer] = useState(partner.pass_fixed_to_customer ?? true)
    const [passPercentageToCustomer, setPassPercentageToCustomer] = useState(partner.pass_percentage_to_customer ?? false)
    const [fixedFeePerTicket, setFixedFeePerTicket] = useState(partner.fixed_fee_per_ticket?.toString() || '15.00')

    const handleUpdatePricing = async () => {
        setIsLoading(true)
        try {
            if (pricingModel === 'standard') {
                await resetToStandardPricing(partner.id)
                // Reset local state to defaults
                setPassFixedToCustomer(true)
                setPassPercentageToCustomer(false)
                setFixedFeePerTicket('15.00')
            } else {
                const percentage = parseFloat(customPercentage)
                if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                    alert('Please enter a valid percentage between 0 and 100')
                    setIsLoading(false)
                    return
                }

                const fixedFee = parseFloat(fixedFeePerTicket)
                if (isNaN(fixedFee) || fixedFee < 0) {
                    alert('Please enter a valid fixed fee amount')
                    setIsLoading(false)
                    return
                }

                await setCustomPricing(partner.id, percentage, passFixedToCustomer, passPercentageToCustomer, fixedFee)
            }
            router.refresh()
            onOpenChange(false)
        } catch (error) {
            console.error('Error updating pricing:', error)
            alert('Failed to update pricing')
        } finally {
            setIsLoading(false)
        }
    }

    const getStatusBadge = () => {
        switch (partner.status) {
            case 'pending':
                return <Badge className="bg-yellow-500/10 text-yellow-500">Pending Approval</Badge>
            case 'approved':
                return <Badge className="bg-green-500/10 text-green-500">Approved</Badge>
            case 'rejected':
                return <Badge className="bg-red-500/10 text-red-500">Rejected</Badge>
            case 'suspended':
                return <Badge className="bg-muted text-muted-foreground">Suspended</Badge>
            default:
                return null
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-3">
                        {partner.business_name}
                        {getStatusBadge()}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Partner ID: {partner.id}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Business Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Business Information</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-muted-foreground">Business Name</Label>
                                <p className="text-foreground">{partner.business_name}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Business Type</Label>
                                <p className="text-foreground capitalize">{partner.business_type || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Owner</Label>
                                <p className="text-foreground">{partner.user?.display_name || 'Unknown'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Email</Label>
                                <p className="text-foreground">{partner.user?.email || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Joined</Label>
                                <p className="text-foreground">{format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
                            </div>
                            {partner.approved_at && (
                                <div>
                                    <Label className="text-muted-foreground">Approved</Label>
                                    <p className="text-foreground">{format(new Date(partner.approved_at), 'MMM d, yyyy')}</p>
                                </div>
                            )}
                            {partner.xendit_account_id && (
                                <div>
                                    <Label className="text-muted-foreground">Xendit Sub-Account</Label>
                                    <p className="text-foreground font-mono text-xs">{partner.xendit_account_id}</p>
                                </div>
                            )}
                            <div>
                                <Label className="text-muted-foreground">KYC Status</Label>
                                <Badge variant="outline" className={
                                    partner.kyc_status === 'verified' ? 'bg-green-500/10 text-green-500' :
                                    partner.kyc_status === 'submitted' ? 'bg-yellow-500/10 text-yellow-500' :
                                    partner.kyc_status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                                    'bg-muted text-muted-foreground'
                                }>
                                    {(partner.kyc_status || 'not_started').toUpperCase().replace('_', ' ')}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Xendit / KYC verification — the only place our stored state can be
                        checked against what Xendit actually holds. */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" />
                                Xendit Verification
                            </h3>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-border bg-muted text-foreground hover:bg-muted hover:text-foreground"
                                    disabled={xenditChecking}
                                    onClick={async () => {
                                        setXenditChecking(true)
                                        setXenditError(null)
                                        setXenditReport(null)
                                        const { report, error } = await getXenditAccountStatus(partner.id)
                                        if (error) setXenditError(error)
                                        else setXenditReport(report ?? null)
                                        setXenditChecking(false)
                                    }}
                                >
                                    {xenditChecking ? 'Checking…' : 'Check Xendit status'}
                                </Button>
                                {!partner.xendit_account_id && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={xenditCreatingSub}
                                        onClick={async () => {
                                            if (!confirm(
                                                `Create a Xendit sub-account for ${partner.business_name}?\n\n` +
                                                `This creates a real account at Xendit and cannot be undone.\n\n` +
                                                `It does NOT change their wallet mode — they keep settling exactly as they do now.`
                                            )) return
                                            setXenditCreatingSub(true)
                                            setXenditError(null)
                                            const { error, message } = await createPartnerXenditSubaccount(partner.id)
                                            if (error) setXenditError(error)
                                            else {
                                                alert(message)
                                                router.refresh()
                                            }
                                            setXenditCreatingSub(false)
                                        }}
                                    >
                                        {xenditCreatingSub ? 'Creating…' : 'Create Xendit sub-account'}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={xenditSubmitting || !partner.xendit_account_id}
                                    title={!partner.xendit_account_id
                                        ? 'Needs a Xendit sub-account first — create one with the button on the left.'
                                        : undefined}
                                    onClick={async () => {
                                        if (!confirm(
                                            `Send ${partner.business_name}'s KYC documents and personal details to Xendit?\n\n` +
                                            `This starts a real verification review and cannot be undone.`
                                        )) return
                                        setXenditSubmitting(true)
                                        setXenditError(null)
                                        const { error, message } = await submitPartnerKycToXendit(partner.id)
                                        if (error) setXenditError(error)
                                        else {
                                            setXenditError(null)
                                            alert(message)
                                            router.refresh()
                                        }
                                        setXenditSubmitting(false)
                                    }}
                                >
                                    {xenditSubmitting ? 'Submitting…' : 'Submit KYC to Xendit'}
                                </Button>
                            </div>
                        </div>

                        {xenditError && (
                            <p className="text-sm text-red-400 bg-red-500/10 rounded p-3">{xenditError}</p>
                        )}

                        {xenditReport && (
                            <div className="space-y-3 text-sm">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-muted-foreground">Our record</Label>
                                        <p className="text-foreground">
                                            KYC {String(xenditReport.local.kyc_status || 'not_started').replace('_', ' ')}
                                            {' · '}{xenditReport.local.kyc_documents_uploaded} doc(s)
                                        </p>
                                        <p className="text-muted-foreground font-mono text-xs break-all">
                                            holder: {xenditReport.local.account_holder_id || '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Xendit says</Label>
                                        <p className="text-foreground">{xenditReport.xendit?.kyc_status || xenditReport.stage.replace('_', ' ')}</p>
                                        <p className="text-muted-foreground font-mono text-xs break-all">
                                            holder: {xenditReport.xendit?.account_holder_id || '—'}
                                        </p>
                                        {/* Proof the sub-account itself resolved, so "no holder"
                                            reads as Xendit's answer and not a failed lookup. */}
                                        {xenditReport.xendit?.sub_account?.id && (
                                            <p className="text-muted-foreground font-mono text-[11px] break-all">
                                                sub-account {xenditReport.xendit.sub_account.id} found
                                                {xenditReport.xendit.sub_account.status ? ` · ${xenditReport.xendit.sub_account.status}` : ''}
                                                {` · HTTP ${xenditReport.xendit.sub_account.lookup_http_status ?? 200}`}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {xenditReport.discrepancies.length > 0 && (
                                    <div className="bg-amber-500/10 rounded p-3 space-y-1">
                                        <p className="text-amber-400 font-medium">Mismatches</p>
                                        {xenditReport.discrepancies.map((d, i) => (
                                            <p key={i} className="text-amber-200/90 text-xs">• {d}</p>
                                        ))}
                                    </div>
                                )}

                                {xenditReport.blockers.length > 0 && (
                                    <div className="bg-muted rounded p-3 space-y-1">
                                        <p className="text-foreground font-medium">Missing before submitting</p>
                                        {xenditReport.blockers.map((b, i) => (
                                            <p key={i} className="text-muted-foreground text-xs">• {b}</p>
                                        ))}
                                    </div>
                                )}

                                {xenditReport.ok && xenditReport.discrepancies.length === 0 && (
                                    <p className="text-green-400 text-xs">Our record matches Xendit.</p>
                                )}

                                {/* Uploaded documents. The verifications queue only lists
                                    partners at 'pending_review', so this is the only way to
                                    reach documents for anyone in another state. */}
                                <div className="rounded border border-border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-foreground font-medium">Uploaded documents</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-border bg-muted text-foreground hover:bg-muted hover:text-foreground"
                                            disabled={docsLoading}
                                            onClick={async () => {
                                                setDocsLoading(true)
                                                const { docs, error } = await getPartnerKycDocuments(partner.id)
                                                setKycDocs(error ? [] : (docs ?? []))
                                                setDocsError(error ?? null)
                                                setDocsLoading(false)
                                            }}
                                        >
                                            {docsLoading ? 'Loading…' : 'Load documents'}
                                        </Button>
                                    </div>
                                    {docsError && <p className="text-xs text-red-400">{docsError}</p>}
                                    {kycDocs !== null && kycDocs.length === 0 && !docsError && (
                                        <p className="text-xs text-muted-foreground">No documents uploaded.</p>
                                    )}
                                    {kycDocs && kycDocs.length > 0 && (
                                        <div className="space-y-1">
                                            {kycDocs.map((d, i) => (
                                                <div key={i} className="flex items-center justify-between gap-3 text-xs border-b border-border py-1.5 last:border-0">
                                                    <div className="min-w-0">
                                                        <p className="text-foreground truncate">{d.doc_type.replace(/_/g, ' ')}</p>
                                                        <p className="text-muted-foreground">
                                                            {d.owner_kind.replace(/_/g, ' ')}
                                                            {d.owner_name ? ` · ${d.owner_name}` : ''}
                                                        </p>
                                                    </div>
                                                    {d.url ? (
                                                        <a
                                                            href={d.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-400 hover:underline whitespace-nowrap"
                                                        >
                                                            View ↗
                                                        </a>
                                                    ) : (
                                                        <span className="text-muted-foreground whitespace-nowrap">unavailable</span>
                                                    )}
                                                </div>
                                            ))}
                                            <p className="text-[11px] text-muted-foreground pt-1">
                                                Links are signed and expire after 1 hour.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Fill the gaps here rather than sending the partner back
                                    through the whole verification form. */}
                                <div className="rounded border border-border p-3 space-y-3">
                                    <p className="text-foreground font-medium">Business details for Xendit</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <Label className="text-muted-foreground text-xs">TIN</Label>
                                            <Input
                                                value={kycTaxId}
                                                onChange={(e) => setKycTaxId(e.target.value)}
                                                placeholder="000-000-000-000"
                                                className="bg-card border-border"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-muted-foreground text-xs">Street address</Label>
                                            <Input
                                                value={kycStreet1}
                                                onChange={(e) => setKycStreet1(e.target.value)}
                                                className="bg-card border-border"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-muted-foreground text-xs">Unit / floor / building (optional)</Label>
                                            <Input
                                                value={kycStreet2}
                                                onChange={(e) => setKycStreet2(e.target.value)}
                                                className="bg-card border-border"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-muted-foreground text-xs">City</Label>
                                            <Input
                                                value={kycCity}
                                                onChange={(e) => setKycCity(e.target.value)}
                                                className="bg-card border-border"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-muted-foreground text-xs">Province / region</Label>
                                            <Input
                                                value={kycProvince}
                                                onChange={(e) => setKycProvince(e.target.value)}
                                                className="bg-card border-border"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-muted-foreground text-xs">Postal code</Label>
                                            <Input
                                                value={kycPostal}
                                                onChange={(e) => setKycPostal(e.target.value)}
                                                className="bg-card border-border"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            size="sm"
                                            disabled={kycSaving}
                                            onClick={async () => {
                                                setKycSaving(true)
                                                setKycSaved(null)
                                                const { error } = await updatePartnerKycDetails(partner.id, {
                                                    tax_id: kycTaxId,
                                                    street_line1: kycStreet1,
                                                    street_line2: kycStreet2,
                                                    city: kycCity,
                                                    province_state: kycProvince,
                                                    postal_code: kycPostal,
                                                })
                                                setKycSaved(error ? `Error: ${error}` : 'Saved. Re-check status to confirm.')
                                                setKycSaving(false)
                                                if (!error) router.refresh()
                                            }}
                                        >
                                            {kycSaving ? 'Saving…' : 'Save business details'}
                                        </Button>
                                        {kycSaved && <span className="text-xs text-muted-foreground">{kycSaved}</span>}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Blank fields are left untouched, so a partial save won&apos;t erase what the partner already entered.
                                    </p>
                                </div>

                                {xenditReport.xendit?.raw_account && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            Raw Xendit response
                                        </summary>
                                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-[11px] text-foreground">
{JSON.stringify({ account: xenditReport.xendit.raw_account, account_holder: xenditReport.xendit.raw_account_holder }, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Contact & Representative Info */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Phone className="h-5 w-5" />
                            Contact & Representative
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-muted-foreground">Contact Number</Label>
                                <p className="text-foreground">{partner.contact_number || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Work Email</Label>
                                <p className="text-foreground">{partner.work_email || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Representative Name</Label>
                                <p className="text-foreground">{partner.representative_name || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Nationality</Label>
                                <p className="text-foreground capitalize">{partner.nationality || 'N/A'}</p>
                            </div>
                            {partner.place_of_birth && (
                                <div>
                                    <Label className="text-muted-foreground">Place of Birth</Label>
                                    <p className="text-foreground">{partner.place_of_birth}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Address */}
                    {(partner.street_line1 || partner.city) && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                Address
                            </h3>
                            <div className="text-foreground space-y-0.5">
                                {partner.street_line1 && <p>{partner.street_line1}</p>}
                                {partner.street_line2 && <p>{partner.street_line2}</p>}
                                {(partner.city || partner.province_state || partner.postal_code) && (
                                    <p>{[partner.city, partner.province_state, partner.postal_code].filter(Boolean).join(', ')}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bank Information */}
                    {(partner.bank_name || partner.bank_account_number) && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                Bank Information
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">Bank Name</Label>
                                    <p className="text-foreground">{partner.bank_name || 'N/A'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Account Name</Label>
                                    <p className="text-foreground">{partner.bank_account_name || 'N/A'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Account Number</Label>
                                    <p className="text-foreground font-mono">{partner.bank_account_number || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* KYC Documents */}
                    {(partner.id_document_url || partner.business_document_url || partner.bir_2303_url || partner.articles_of_incorporation_url || partner.secretary_certificate_url || partner.latest_gis_url) && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                KYC Documents
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {partner.id_document_url && (
                                    <a href={partner.id_document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Government ID
                                    </a>
                                )}
                                {partner.business_document_url && (
                                    <a href={partner.business_document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Business Document
                                    </a>
                                )}
                                {partner.bir_2303_url && (
                                    <a href={partner.bir_2303_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> BIR Form 2303
                                    </a>
                                )}
                                {partner.articles_of_incorporation_url && (
                                    <a href={partner.articles_of_incorporation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Articles of Incorporation
                                    </a>
                                )}
                                {partner.secretary_certificate_url && (
                                    <a href={partner.secretary_certificate_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Secretary Certificate
                                    </a>
                                )}
                                {partner.latest_gis_url && (
                                    <a href={partner.latest_gis_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Latest GIS
                                    </a>
                                )}
                            </div>
                            {partner.kyc_rejection_reason && (
                                <div className="mt-3 p-3 rounded-md bg-red-500/10 border border-red-500/20">
                                    <p className="text-xs text-red-400 font-medium">KYC Rejection Reason</p>
                                    <p className="text-sm text-red-300 mt-1">{partner.kyc_rejection_reason}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Previous Admin Notes */}
                    {partner.admin_notes && (
                        <div className="space-y-2 border-t border-border pt-6">
                            <h3 className="text-base font-semibold text-foreground">Previous Admin Notes</h3>
                            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">{partner.admin_notes}</p>
                        </div>
                    )}

                    {/* Partner Type / Capabilities */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <h3 className="text-lg font-semibold">Partner Type</h3>
                        <p className="text-sm text-muted-foreground">Controls which dashboard sections this partner can access.</p>
                        <div className="flex gap-3">
                            {[
                                { value: 'organizer', label: 'Event Organizer', desc: 'Events, tickets, campaigns' },
                                { value: 'experience_host', label: 'Experience Host', desc: 'Experiences, calendar, bookings' },
                            ].map(({ value, label, desc }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => toggleCapability(value)}
                                    className={`flex-1 p-3 rounded-xl border text-left transition-colors ${
                                        capabilities.includes(value)
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-muted text-muted-foreground hover:border-border'
                                    }`}
                                >
                                    <p className="font-semibold text-sm">{label}</p>
                                    <p className="text-xs mt-0.5 opacity-70">{desc}</p>
                                </button>
                            ))}
                        </div>
                        <Button
                            onClick={handleSaveCapabilities}
                            disabled={isLoading || capabilities.length === 0}
                            className="w-full bg-primary hover:bg-primary/90"
                        >
                            Save Partner Type
                        </Button>
                    </div>

                    {/* Pricing Configuration */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Pricing Configuration
                        </h3>
                        <div className="space-y-3">
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="pricing-model" className="text-muted-foreground mb-2 block">Pricing Model</Label>
                                    <Select
                                        value={pricingModel}
                                        onValueChange={setPricingModel}
                                        disabled={partner.status !== 'approved'}
                                    >
                                        <SelectTrigger className="bg-muted border-border text-foreground">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard (2%)</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {pricingModel === 'custom' && (
                                    <div className="space-y-4 border border-border rounded-md p-4 bg-muted/50">
                                        <div className="space-y-2">
                                            <Label htmlFor="custom-percentage" className="text-muted-foreground">Platform Fee Share (%)</Label>
                                            <Input
                                                id="custom-percentage"
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.5"
                                                value={customPercentage}
                                                onChange={(e) => setCustomPercentage(e.target.value)}
                                                className="bg-muted border-border text-foreground"
                                                disabled={partner.status !== 'approved'}
                                                placeholder="e.g. 5.0"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Percentage of ticket sales that goes to the platform.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="pass-fixed" className="text-muted-foreground">Pass ₱ booking fee to customer</Label>
                                                <Switch
                                                    id="pass-fixed"
                                                    checked={passFixedToCustomer}
                                                    onCheckedChange={setPassFixedToCustomer}
                                                    disabled={partner.status !== 'approved'}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="pass-pct" className="text-muted-foreground">Pass % commission to customer</Label>
                                                <Switch
                                                    id="pass-pct"
                                                    checked={passPercentageToCustomer}
                                                    onCheckedChange={setPassPercentageToCustomer}
                                                    disabled={partner.status !== 'approved'}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Each fee that&apos;s passed is added to the customer&apos;s total on top of the ticket price;
                                                whatever isn&apos;t passed comes out of the organizer&apos;s payout. Both are HangHut&apos;s
                                                platform fee. The payment processing fee is always absorbed by the organizer. Organizers can
                                                also flip these themselves on their Payouts page.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="fixed-fee" className="text-muted-foreground">Fixed Customer Fee (₱)</Label>
                                            <Input
                                                id="fixed-fee"
                                                type="number"
                                                min="0"
                                                step="1.00"
                                                value={fixedFeePerTicket}
                                                onChange={(e) => setFixedFeePerTicket(e.target.value)}
                                                className="bg-muted border-border text-foreground"
                                                disabled={partner.status !== 'approved'}
                                                placeholder="e.g. 15.00"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                A fixed amount added to the ticket price, paid by the customer to the platform.
                                                Default is ₱15.00.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <Button
                                    onClick={handleUpdatePricing}
                                    disabled={isLoading || partner.status !== 'approved'}
                                    className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
                                >
                                    Save Configuration
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Payout Configuration */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Payout Configuration
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between border border-border rounded-md p-4 bg-muted/50">
                                <div className="space-y-1">
                                    <Label htmlFor="auto-approve-payouts" className="text-foreground font-medium">
                                        Auto-Approve Payouts
                                    </Label>
                                    <p className="text-xs text-muted-foreground max-w-md">
                                        When enabled, payout requests from this partner bypass manual admin review and are disbursed immediately via Xendit.
                                    </p>
                                </div>
                                <Switch
                                    id="auto-approve-payouts"
                                    checked={autoApprovePayouts}
                                    onCheckedChange={async (checked) => {
                                        setIsLoading(true)
                                        // Optimistically update
                                        setAutoApprovePayoutsState(checked)
                                        try {
                                            await setAutoApprovePayouts(partner.id, checked)
                                            router.refresh()
                                        } catch (error) {
                                            console.error('Error updating auto-approve setting:', error)
                                            alert('Failed to update payout configuration')
                                            // Revert on failure
                                            setAutoApprovePayoutsState(!checked)
                                        } finally {
                                            setIsLoading(false)
                                        }
                                    }}
                                    disabled={isLoading || partner.status !== 'approved'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Feature Access */}
                    <div className="space-y-4 border-t border-border pt-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Feature Access
                        </h3>
                        <div className="flex items-center justify-between border border-border rounded-md p-4 bg-muted/50">
                            <div className="space-y-1">
                                <Label htmlFor="subscriptions-enabled" className="text-foreground font-medium">
                                    Subscriptions / Memberships
                                </Label>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    Gated off for new partners while recurring billing is finalized. Turn on to give this org early access to membership tiers and subscriber posts.
                                </p>
                            </div>
                            <Switch
                                id="subscriptions-enabled"
                                checked={subscriptionsEnabled}
                                onCheckedChange={async (checked) => {
                                    setIsLoading(true)
                                    setSubscriptionsEnabledState(checked)
                                    try {
                                        await setSubscriptionsEnabled(partner.id, checked)
                                        router.refresh()
                                    } catch (error) {
                                        console.error('Error updating subscriptions access:', error)
                                        alert('Failed to update subscriptions access')
                                        setSubscriptionsEnabledState(!checked)
                                    } finally {
                                        setIsLoading(false)
                                    }
                                }}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="flex items-center justify-between border border-border rounded-md p-4 bg-muted/50">
                            <div className="space-y-1">
                                <Label htmlFor="merch-enabled" className="text-foreground font-medium">
                                    Merch selling
                                </Label>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    Off by default (controlled rollout). Turn on to let this org create merch products and sell them on their event pages, with claim-at-event or shipped fulfillment.
                                </p>
                            </div>
                            <Switch
                                id="merch-enabled"
                                checked={merchEnabled}
                                onCheckedChange={async (checked) => {
                                    setIsLoading(true)
                                    setMerchEnabledState(checked)
                                    try {
                                        await setMerchEnabled(partner.id, checked)
                                        router.refresh()
                                    } catch (error) {
                                        console.error('Error updating merch access:', error)
                                        alert('Failed to update merch access')
                                        setMerchEnabledState(!checked)
                                    } finally {
                                        setIsLoading(false)
                                    }
                                }}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="flex items-center justify-between border border-border rounded-md p-4 bg-muted/50">
                            <div className="space-y-1">
                                <Label htmlFor="main-wallet" className="text-foreground font-medium">
                                    Settle to HangHut main wallet
                                </Label>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    Their sales land in the platform account instead of their own Xendit
                                    sub-wallet. Balance is tracked in the transactions ledger and paid out
                                    by disbursement. Also unlocks Cards/GCash without per-sub-account
                                    capability onboarding.
                                    {partner.xendit_account_id && (
                                        <span className="mt-1 block font-medium text-amber-600">
                                            This partner has a sub-account — switching strands any balance held in it.
                                        </span>
                                    )}
                                </p>
                            </div>
                            <Switch
                                id="main-wallet"
                                checked={useMainWallet}
                                onCheckedChange={async (checked) => {
                                    setIsLoading(true)
                                    setUseMainWalletState(checked)
                                    try {
                                        let res = await setPartnerWalletMode(partner.id, checked)
                                        if (!res.success) {
                                            // Sub-account present — make the consequence explicit
                                            // before overriding.
                                            if (confirm(`${res.reason}\n\nSwitch anyway?`)) {
                                                res = await setPartnerWalletMode(partner.id, checked, true)
                                            }
                                        }
                                        if (res.success) {
                                            router.refresh()
                                        } else {
                                            setUseMainWalletState(!checked)
                                        }
                                    } catch (error) {
                                        console.error('Error updating wallet mode:', error)
                                        alert('Failed to update wallet mode')
                                        setUseMainWalletState(!checked)
                                    } finally {
                                        setIsLoading(false)
                                    }
                                }}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* Admin Actions */}
                    {partner.status === 'pending' && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold">Review Application</h3>
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="admin-notes" className="text-muted-foreground">Admin Notes</Label>
                                    <Textarea
                                        id="admin-notes"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Add notes about this application..."
                                        className="bg-muted border-border text-foreground"
                                        rows={3}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        onClick={handleApprove}
                                        disabled={isLoading}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Approve Partner
                                    </Button>
                                    <Button
                                        onClick={handleReject}
                                        disabled={isLoading}
                                        variant="destructive"
                                        className="flex-1"
                                    >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Reject Application
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Suspend Partner */}
                    {partner.status === 'approved' && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="suspend-reason" className="text-muted-foreground">Reason for Suspension</Label>
                                    <Textarea
                                        id="suspend-reason"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Required: Explain why you're suspending this partner..."
                                        className="bg-muted border-border text-foreground"
                                        rows={3}
                                    />
                                </div>
                                <Button
                                    onClick={handleSuspend}
                                    disabled={isLoading}
                                    variant="destructive"
                                    className="w-full"
                                >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Suspend Partner
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Reinstate Suspended Partner */}
                    {partner.status === 'suspended' && (
                        <div className="space-y-4 border-t border-border pt-6">
                            <h3 className="text-lg font-semibold text-yellow-400">Partner Suspended</h3>
                            <p className="text-sm text-muted-foreground">
                                This partner is currently suspended. You can reinstate them to restore access to their storefront and event management.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleReactivate}
                                    disabled={isLoading}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Reinstate Partner
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
