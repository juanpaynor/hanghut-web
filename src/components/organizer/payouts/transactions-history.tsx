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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Transaction {
    id: string
    gross_amount: number
    platform_fee: number
    payment_processing_fee: number
    fixed_fee: number | null
    organizer_payout: number
    status: string
    created_at: string
    event: { title: string } | null
}

interface TransactionsHistoryProps {
    transactions: Transaction[]
}

export function TransactionsHistory({ transactions }: TransactionsHistoryProps) {
    const handleExport = () => {
        if (!transactions.length) return

        const headers = [
            'Date',
            'Event',
            'Gross Amount',
            'Customer Fee',
            'Platform Fee',
            'Processing Fee',
            'Fixed Fee',
            'Organizer Payout',
            'Status'
        ]

        const csvContent = [
            headers.join(','),
            ...transactions.map(t => [
                `"${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm:ss')}"`,
                `"${t.event?.title || 'Unknown'}"`,
                t.gross_amount,
                t.fixed_fee || 0,
                t.platform_fee,
                t.payment_processing_fee || 0, // Fallback if missing
                t.fixed_fee || 0,
                t.organizer_payout,
                t.status
            ].join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20'
            case 'pending':
                return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20'
            case 'failed':
                return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20'
            case 'refunded':
                return 'bg-slate-500/10 text-muted-foreground hover:bg-slate-500/20 border-slate-500/20'
            default:
                return 'bg-slate-500/10 text-muted-foreground border-slate-500/20'
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Transaction History
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Detailed breakdown of all ticket sales and fees
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={transactions.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-muted/50">
                            <TableHead className="w-[150px]">Date</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead className="text-right">Total Paid</TableHead>
                            <TableHead className="text-right text-muted-foreground">Cust. Fee</TableHead>
                            <TableHead className="text-right text-red-500">Org. Fees</TableHead>
                            <TableHead className="text-right font-bold">Net Payout</TableHead>
                            <TableHead className="text-right w-[100px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <DollarSign className="w-8 h-8 opacity-20" />
                                        <p>No transactions found</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((transaction) => {
                                const customerFee = transaction.fixed_fee || 0
                                const organizerFees = (transaction.platform_fee || 0) + (transaction.payment_processing_fee || 0)

                                return (
                                    <TableRow key={transaction.id} className="border-border hover:bg-muted/50 group">
                                        <TableCell className="font-medium text-muted-foreground">
                                            {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                                            <div className="text-xs opacity-50 font-normal">
                                                {format(new Date(transaction.created_at), 'h:mm a')}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-medium text-foreground">
                                                {transaction.event?.title || 'Unknown Event'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            ₱{Number(transaction.gross_amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground text-sm">
                                            {customerFee > 0 ? `-₱${customerFee.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-red-500/80 text-sm">
                                            -₱{organizerFees.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-green-600">
                                            ₱{Number(transaction.organizer_payout).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="outline" className={getStatusColor(transaction.status)}>
                                                {transaction.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
