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
import { CheckCircle, XCircle, Ban, DollarSign } from 'lucide-react'
import { approvePartner, rejectPartner, setCustomPricing, suspendPartner, resetToStandardPricing } from '@/lib/admin/partner-actions'
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
    fixed_fee_per_ticket: number
    created_at: string
    approved_at: string | null
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
    const [customPercentage, setCustomPercentage] = useState(partner.custom_percentage?.toString() || '15') // Default custom to 15 if not set
    const [adminNotes, setAdminNotes] = useState('')

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

    const [passFeesToCustomer, setPassFeesToCustomer] = useState(partner.pass_fees_to_customer ?? true)
    const [fixedFeePerTicket, setFixedFeePerTicket] = useState(partner.fixed_fee_per_ticket?.toString() || '15.00')

    const handleUpdatePricing = async () => {
        setIsLoading(true)
        try {
            if (pricingModel === 'standard') {
                await resetToStandardPricing(partner.id)
                // Reset local state to defaults
                setPassFeesToCustomer(true)
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

                await setCustomPricing(partner.id, percentage, passFeesToCustomer, fixedFee)
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
                return <Badge className="bg-slate-500/10 text-slate-500">Suspended</Badge>
            default:
                return null
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-3">
                        {partner.business_name}
                        {getStatusBadge()}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Partner ID: {partner.id}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Business Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Business Information</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-400">Business Name</Label>
                                <p className="text-white">{partner.business_name}</p>
                            </div>
                            <div>
                                <Label className="text-slate-400">Business Type</Label>
                                <p className="text-white capitalize">{partner.business_type || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-slate-400">Owner</Label>
                                <p className="text-white">{partner.user?.display_name || 'Unknown'}</p>
                            </div>
                            <div>
                                <Label className="text-slate-400">Email</Label>
                                <p className="text-white">{partner.user?.email || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-slate-400">Joined</Label>
                                <p className="text-white">{format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
                            </div>
                            {partner.approved_at && (
                                <div>
                                    <Label className="text-slate-400">Approved</Label>
                                    <p className="text-white">{format(new Date(partner.approved_at), 'MMM d, yyyy')}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pricing Configuration */}
                    <div className="space-y-4 border-t border-slate-700 pt-6">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Pricing Configuration
                        </h3>
                        <div className="space-y-3">
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="pricing-model" className="text-slate-400 mb-2 block">Pricing Model</Label>
                                    <Select
                                        value={pricingModel}
                                        onValueChange={setPricingModel}
                                        disabled={partner.status !== 'approved'}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard (15%)</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {pricingModel === 'custom' && (
                                    <div className="space-y-4 border border-slate-700 rounded-md p-4 bg-slate-800/50">
                                        <div className="space-y-2">
                                            <Label htmlFor="custom-percentage" className="text-slate-400">Platform Fee Share (%)</Label>
                                            <Input
                                                id="custom-percentage"
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.5"
                                                value={customPercentage}
                                                onChange={(e) => setCustomPercentage(e.target.value)}
                                                className="bg-slate-800 border-slate-700 text-white"
                                                disabled={partner.status !== 'approved'}
                                                placeholder="e.g. 5.0"
                                            />
                                            <p className="text-xs text-slate-500">
                                                Percentage of ticket sales that goes to the platform.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="pass-fees" className="text-slate-400">Pass Fees to Customer</Label>
                                                <Switch
                                                    id="pass-fees"
                                                    checked={passFeesToCustomer}
                                                    onCheckedChange={setPassFeesToCustomer}
                                                    disabled={partner.status !== 'approved'}
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                If enabled, the customer pays the Platform Fee + Processing Fee on top of the ticket price.
                                                The organizer receives the full ticket price.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="fixed-fee" className="text-slate-400">Fixed Customer Fee (₱)</Label>
                                            <Input
                                                id="fixed-fee"
                                                type="number"
                                                min="0"
                                                step="1.00"
                                                value={fixedFeePerTicket}
                                                onChange={(e) => setFixedFeePerTicket(e.target.value)}
                                                className="bg-slate-800 border-slate-700 text-white"
                                                disabled={partner.status !== 'approved'}
                                                placeholder="e.g. 15.00"
                                            />
                                            <p className="text-xs text-slate-500">
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

                    {/* Admin Actions */}
                    {partner.status === 'pending' && (
                        <div className="space-y-4 border-t border-slate-700 pt-6">
                            <h3 className="text-lg font-semibold">Review Application</h3>
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="admin-notes" className="text-slate-400">Admin Notes</Label>
                                    <Textarea
                                        id="admin-notes"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Add notes about this application..."
                                        className="bg-slate-800 border-slate-700 text-white"
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
                        <div className="space-y-4 border-t border-slate-700 pt-6">
                            <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="suspend-reason" className="text-slate-400">Reason for Suspension</Label>
                                    <Textarea
                                        id="suspend-reason"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Required: Explain why you're suspending this partner..."
                                        className="bg-slate-800 border-slate-700 text-white"
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
                </div>
            </DialogContent>
        </Dialog>
    )
}
