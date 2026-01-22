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

    return (
        <div className="space-y-6">
            <div className="text-sm text-slate-400">
                {payouts.length} pending payout request{payouts.length !== 1 ? 's' : ''}
            </div>

            <div className="rounded-md border border-slate-700">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-slate-800/50">
                            <TableHead className="text-slate-400">Partner</TableHead>
                            <TableHead className="text-slate-400">Amount</TableHead>
                            <TableHead className="text-slate-400">Bank Details</TableHead>
                            <TableHead className="text-slate-400">Requested</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-slate-400">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payouts.length === 0 ? (
                            <TableRow className="border-slate-700">
                                <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                                    No pending payout requests
                                </TableCell>
                            </TableRow>
                        ) : (
                            payouts.map((payout) => (
                                <TableRow key={payout.id} className="border-slate-700 hover:bg-slate-800/50">
                                    <TableCell>
                                        <div>
                                            <p className="text-slate-300 font-medium">
                                                {payout.partner?.business_name || 'Unknown'}
                                            </p>
                                            <p className="text-slate-500 text-sm">
                                                {payout.partner?.user?.email}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-300 font-bold text-lg">
                                        ₱{Number(payout.amount).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            <p className="text-slate-300">{payout.bank_name}</p>
                                            <p className="text-slate-500">{payout.bank_account_number}</p>
                                            <p className="text-slate-500">{payout.bank_account_name}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-400 text-sm">
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
        </div>
    )
}
