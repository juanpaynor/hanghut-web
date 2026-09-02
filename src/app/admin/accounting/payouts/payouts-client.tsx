'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CheckCircle, XCircle } from 'lucide-react'
import { approvePayout, rejectPayout } from '@/lib/admin/payout-actions'

interface Payout {
    id: string
    amount: number
    bank_name: string
    bank_account_number: string
    bank_account_name: string
    status: string
    requested_at: string
    approved_at?: string | null
    xendit_disbursement_id?: string | null
    partner: {
        id: string
        business_name: string
        user: {
            display_name: string
            email: string
        } | null
    } | null
}

interface PayoutsClientProps {
    payouts: Payout[]
}

export function PayoutsClient({ payouts }: PayoutsClientProps) {
    const router = useRouter()
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const handleApprove = async (payoutId: string) => {
        setLoadingId(payoutId)
        try {
            await approvePayout(payoutId)
            router.refresh()
        } catch (error) {
            console.error('Error approving payout:', error)
            alert('Failed to approve payout')
        } finally {
            setLoadingId(null)
        }
    }

    const handleReject = async (payoutId: string) => {
        const reason = prompt('Please provide a reason for rejection:')
        if (!reason) return

        setLoadingId(payoutId)
        try {
            await rejectPayout(payoutId, reason)
            router.refresh()
        } catch (error) {
            console.error('Error rejecting payout:', error)
            alert('Failed to reject payout')
        } finally {
            setLoadingId(null)
        }
    }

    // Only a pending_request is actionable. An 'approved'/'processing' payout already
    // has a live Xendit disbursement against it, so it must not sit in the approval
    // queue offering Approve/Reject — Approve would be rejected by the edge function,
    // and Reject would unlink its transactions and hand the money back to the
    // organizer's available balance while Xendit is still sending it.
    const actionable = payouts.filter((p) => p.status === 'pending_request')
    const inFlight = payouts.filter((p) => p.status !== 'pending_request')

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground">
                {actionable.length} awaiting approval
                {inFlight.length > 0 && ` · ${inFlight.length} in flight with Xendit`}
            </div>

            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="text-muted-foreground">Partner</TableHead>
                            <TableHead className="text-muted-foreground">Amount</TableHead>
                            <TableHead className="text-muted-foreground">Bank Details</TableHead>
                            <TableHead className="text-muted-foreground">Requested</TableHead>
                            <TableHead className="text-muted-foreground">Status</TableHead>
                            <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {actionable.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    No pending payout requests
                                </TableCell>
                            </TableRow>
                        ) : (
                            actionable.map((payout) => (
                                <TableRow key={payout.id} className="border-border hover:bg-card/50">
                                    <TableCell>
                                        <div>
                                            <p className="text-slate-700 font-medium">
                                                {payout.partner?.business_name || 'Unknown'}
                                            </p>
                                            <p className="text-muted-foreground text-sm">
                                                {payout.partner?.user?.email}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-700 font-bold text-lg">
                                        ₱{Number(payout.amount).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            <p className="text-slate-700">{payout.bank_name}</p>
                                            <p className="text-muted-foreground">{payout.bank_account_number}</p>
                                            <p className="text-muted-foreground">{payout.bank_account_name}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(payout.requested_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                payout.status === 'pending_request'
                                                    ? 'bg-yellow-500/10 text-yellow-500'
                                                    : 'bg-blue-500/10 text-blue-500'
                                            }
                                        >
                                            {payout.status.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleApprove(payout.id)}
                                                disabled={loadingId === payout.id}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-1" />
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleReject(payout.id)}
                                                disabled={loadingId === payout.id}
                                            >
                                                <XCircle className="h-4 w-4 mr-1" />
                                                Reject
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Already disbursed — visible for tracking, deliberately not actionable. */}
            {inFlight.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-sm font-semibold">In flight with Xendit</h2>
                    <p className="text-sm text-muted-foreground">
                        Already approved and sent. These settle on Xendit&apos;s side — there is nothing to
                        approve, and rejecting one would release the money back to the partner&apos;s balance
                        while the transfer is still running.
                    </p>
                    <div className="rounded-md border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground">Partner</TableHead>
                                    <TableHead className="text-muted-foreground">Amount</TableHead>
                                    <TableHead className="text-muted-foreground">Approved</TableHead>
                                    <TableHead className="text-muted-foreground">Disbursement</TableHead>
                                    <TableHead className="text-muted-foreground">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inFlight.map((payout) => (
                                    <TableRow key={payout.id} className="border-border hover:bg-card/50">
                                        <TableCell>
                                            <p className="text-slate-700 font-medium">
                                                {payout.partner?.business_name || 'Unknown'}
                                            </p>
                                            <p className="text-muted-foreground text-sm">
                                                {payout.partner?.user?.email}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-slate-700 font-bold">
                                            ₱{Number(payout.amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {payout.approved_at
                                                ? format(new Date(payout.approved_at), 'MMM d, yyyy')
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {payout.xendit_disbursement_id || '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                                                {payout.status.replace('_', ' ').toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    )
}
