'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { approveAppeal, denyAppeal, respondToTicket } from '@/lib/admin/ticket-actions'
import { format } from 'date-fns'
import { User, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

interface Ticket {
    id: string
    subject: string
    message: string
    status: string
    priority: string
    ticket_type: string
    user_display_name: string
    user_email: string
    user_id: string
    account_status: string
    account_status_reason: string | null
    admin_response: string | null
    created_at: string
    updated_at: string
    resolved_at: string | null
    admin: { display_name: string } | null
}

interface TicketDetailModalProps {
    ticket: Ticket
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function TicketDetailModal({ ticket, open, onOpenChange }: TicketDetailModalProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [adminResponse, setAdminResponse] = useState(ticket.admin_response || '')
    const [loading, setLoading] = useState(false)
    const [denyReason, setDenyReason] = useState('')
    const [showDenyInput, setShowDenyInput] = useState(false)

    // Get admin ID from somewhere (you'll need to pass this or get it from context)
    const adminId = '12f3de21-914a-4967-bbe6-2913790a2aa1' // TODO: Get from session

    const handleApproveAppeal = async () => {
        if (!confirm('Are you sure you want to approve this appeal and reactivate the user?')) {
            return
        }

        setLoading(true)
        const result = await approveAppeal(ticket.id, ticket.user_id, adminId)
        setLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
                description: result.message,
            })
            onOpenChange(false)
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to approve appeal',
                variant: 'destructive',
            })
        }
    }

    const handleDenyAppeal = async () => {
        if (!denyReason.trim()) {
            toast({
                title: 'Reason required',
                description: 'Please provide a reason for denying the appeal',
                variant: 'destructive',
            })
            return
        }

        setLoading(true)
        const result = await denyAppeal(ticket.id, adminId, denyReason)
        setLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
                description: result.message,
            })
            onOpenChange(false)
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to deny appeal',
                variant: 'destructive',
            })
        }
    }

    const handleAddResponse = async () => {
        if (!adminResponse.trim()) {
            toast({
                title: 'Response required',
                description: 'Please enter a response',
                variant: 'destructive',
            })
            return
        }

        setLoading(true)
        const result = await respondToTicket(ticket.id, adminId, adminResponse, 'in_progress')
        setLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
                description: result.message,
            })
            onOpenChange(false)
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to add response',
                variant: 'destructive',
            })
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'suspended':
                return 'bg-orange-500/10 text-orange-500'
            case 'banned':
                return 'bg-red-500/10 text-red-500'
            case 'active':
                return 'bg-green-500/10 text-green-500'
            default:
                return 'bg-slate-500/10 text-slate-500'
        }
    }

    const isAccountAppeal = ticket.ticket_type === 'account_appeal'
    const canApprove = isAccountAppeal && ticket.status !== 'resolved'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">{ticket.subject}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Ticket ID: {ticket.id}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* User Info */}
                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-400">User Information</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-slate-500">Name</p>
                                <p className="text-white">{ticket.user_display_name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Email</p>
                                <p className="text-white">{ticket.user_email}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">User ID</p>
                                <p className="text-white font-mono text-xs">{ticket.user_id}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Account Status</p>
                                <Badge variant="outline" className={getStatusColor(ticket.account_status)}>
                                    {ticket.account_status.toUpperCase()}
                                </Badge>
                            </div>
                        </div>
                        {ticket.account_status_reason && (
                            <div>
                                <p className="text-xs text-slate-500">Original Reason</p>
                                <p className="text-slate-300 text-sm italic">"{ticket.account_status_reason}"</p>
                            </div>
                        )}
                    </div>

                    {/* Ticket Details */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-400">Ticket Details</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-slate-500">Type</p>
                                <p className="text-white capitalize">{ticket.ticket_type.replace('_', ' ')}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Priority</p>
                                <Badge variant="outline" className="capitalize">
                                    {ticket.priority}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Created</p>
                                <p className="text-white text-sm">
                                    {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Status</p>
                                <Badge variant="outline" className="capitalize">
                                    {ticket.status.replace('_', ' ')}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* User's Message */}
                    <div className="space-y-2">
                        <Label className="text-slate-400">User's Message</Label>
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <p className="text-white whitespace-pre-wrap">{ticket.message}</p>
                        </div>
                    </div>

                    {/* Admin Response */}
                    <div className="space-y-2">
                        <Label className="text-slate-400">Admin Response</Label>
                        {ticket.admin_response && ticket.status === 'resolved' ? (
                            <div className="p-4 bg-slate-900/50 rounded-lg">
                                <p className="text-white whitespace-pre-wrap">{ticket.admin_response}</p>
                                {ticket.admin && (
                                    <p className="text-xs text-slate-500 mt-2">
                                        - {ticket.admin.display_name} on{' '}
                                        {ticket.resolved_at && format(new Date(ticket.resolved_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <Textarea
                                value={adminResponse}
                                onChange={(e) => setAdminResponse(e.target.value)}
                                placeholder="Enter your response to the user..."
                                className="bg-slate-900 border-slate-700 text-white min-h-[120px]"
                                disabled={ticket.status === 'resolved'}
                            />
                        )}
                    </div>

                    {/* Deny Reason Input (shown when denying) */}
                    {showDenyInput && (
                        <div className="space-y-2">
                            <Label className="text-slate-400">Denial Reason *</Label>
                            <Textarea
                                value={denyReason}
                                onChange={(e) => setDenyReason(e.target.value)}
                                placeholder="Explain why the appeal is being denied..."
                                className="bg-slate-900 border-slate-700 text-white min-h-[100px]"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    {ticket.status !== 'resolved' && (
                        <>
                            {canApprove && !showDenyInput && (
                                <>
                                    <Button
                                        onClick={handleApproveAppeal}
                                        disabled={loading}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        {loading ? 'Processing...' : 'Approve & Reactivate'}
                                    </Button>
                                    <Button
                                        onClick={() => setShowDenyInput(true)}
                                        disabled={loading}
                                        variant="destructive"
                                    >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Deny Appeal
                                    </Button>
                                </>
                            )}

                            {showDenyInput && (
                                <>
                                    <Button onClick={() => setShowDenyInput(false)} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button onClick={handleDenyAppeal} disabled={loading} variant="destructive">
                                        {loading ? 'Processing...' : 'Confirm Denial'}
                                    </Button>
                                </>
                            )}

                            {!showDenyInput && (
                                <Button onClick={handleAddResponse} disabled={loading} variant="outline">
                                    {loading ? 'Saving...' : 'Add Response'}
                                </Button>
                            )}
                        </>
                    )}

                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
