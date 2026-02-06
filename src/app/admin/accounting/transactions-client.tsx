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
                return 'bg-slate-500/10 text-muted-foreground'
            default:
                return 'bg-slate-500/10 text-muted-foreground'
        }
    }

    return (
        <div className="rounded-md border border-border">
            <Table>
                <TableHeader>
                    <TableRow className="border-border hover:bg-card/50">
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">Event</TableHead>
                        <TableHead className="text-muted-foreground">Partner</TableHead>
                        <TableHead className="text-muted-foreground">Gross Amount</TableHead>
                        <TableHead className="text-muted-foreground">Platform Fee</TableHead>
                        <TableHead className="text-muted-foreground">Partner Payout</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.length === 0 ? (
                        <TableRow className="border-border">
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                No transactions found
                            </TableCell>
                        </TableRow>
                    ) : (
                        transactions.map((transaction) => (
                            <TableRow key={transaction.id} className="border-border hover:bg-card/50">
                                <TableCell className="text-muted-foreground text-sm">
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
