'use client'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface Payout {
    id: string
    amount: number
    bank_name: string
    bank_account_number: string
    bank_account_name: string
    status: string
    requested_at: string
    processed_at?: string
    partner: {
        id: string
        business_name: string
    } | null
}

interface PayoutsHistoryTableProps {
    payouts: Payout[]
}

export function PayoutsHistoryTable({ payouts }: PayoutsHistoryTableProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved':
            case 'completed':
                return 'bg-green-500/10 text-green-500'
            case 'pending_request':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'rejected':
                return 'bg-red-500/10 text-red-500'
            default:
                return 'bg-slate-500/10 text-muted-foreground'
        }
    }

    return (
        <div className="rounded-md border border-border">
            <Table>
                <TableHeader>
                    <TableRow className="border-border hover:bg-card/50">
                        <TableHead className="text-muted-foreground w-[100px]">Date</TableHead>
                        <TableHead className="text-muted-foreground">Partner</TableHead>
                        <TableHead className="text-muted-foreground">Amount</TableHead>
                        <TableHead className="text-muted-foreground">Bank Details</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {payouts.length === 0 ? (
                        <TableRow className="border-border">
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No payouts found
                            </TableCell>
                        </TableRow>
                    ) : (
                        payouts.map((payout) => (
                            <TableRow key={payout.id} className="border-border hover:bg-card/50">
                                <TableCell className="text-muted-foreground text-sm font-mono">
                                    {format(new Date(payout.requested_at), 'MMM d, yyyy')}
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-slate-300">
                                        {payout.partner?.business_name || 'Unknown'}
                                    </div>
                                </TableCell>
                                <TableCell className="text-slate-300 font-bold">
                                    ₱{Number(payout.amount).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        <span className="text-slate-300">{payout.bank_name}</span>
                                        <span className="text-muted-foreground text-xs ml-2">
                                            {payout.bank_account_number}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {payout.bank_account_name}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={getStatusColor(payout.status)}>
                                        {payout.status.replace('_', ' ').toUpperCase()}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
