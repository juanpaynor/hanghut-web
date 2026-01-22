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

interface Transaction {
    id: string
    gross_amount: number
    platform_fee: number
    organizer_payout: number
    status: string
    created_at: string
    event: { title: string } | null
    partner: { business_name: string } | null
}

interface TransactionsClientProps {
    transactions: Transaction[]
}

export function TransactionsClient({ transactions }: TransactionsClientProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-500/10 text-green-500'
            case 'pending':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'failed':
                return 'bg-red-500/10 text-red-500'
            case 'refunded':
                return 'bg-slate-500/10 text-slate-500'
            default:
                return 'bg-slate-500/10 text-slate-500'
        }
    }

    return (
        <div className="rounded-md border border-slate-700">
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-800/50">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Event</TableHead>
                        <TableHead className="text-slate-400">Partner</TableHead>
                        <TableHead className="text-slate-400">Gross Amount</TableHead>
                        <TableHead className="text-slate-400">Platform Fee</TableHead>
                        <TableHead className="text-slate-400">Partner Payout</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.length === 0 ? (
                        <TableRow className="border-slate-700">
                            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                                No transactions found
                            </TableCell>
                        </TableRow>
                    ) : (
                        transactions.map((transaction) => (
                            <TableRow key={transaction.id} className="border-slate-700 hover:bg-slate-800/50">
                                <TableCell className="text-slate-400 text-sm">
                                    {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                                </TableCell>
                                <TableCell className="text-slate-300">
                                    {transaction.event?.title || 'Unknown Event'}
                                </TableCell>
                                <TableCell className="text-slate-300">
                                    {transaction.partner?.business_name || 'Unknown Partner'}
                                </TableCell>
                                <TableCell className="text-slate-300 font-medium">
                                    ₱{Number(transaction.gross_amount).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-green-400">
                                    ₱{Number(transaction.platform_fee).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-slate-300">
                                    ₱{Number(transaction.organizer_payout).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={getStatusColor(transaction.status)}>
                                        {transaction.status.toUpperCase()}
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
