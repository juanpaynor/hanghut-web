'use client'

import { useState } from 'react'
import { TransactionDetailDialog } from './transaction-detail-dialog'
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
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownLeft, ArrowUpRight, Check, Clock, Download, X, Wallet, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSettlementInfo, getPaymentChannel } from '@/lib/utils/settlement'

interface Transaction {
    id: string
    gross_amount: number
    platform_fee: number
    payment_processing_fee: number
    fixed_fee: number | null
    vat?: number | null
    organizer_payout: number
    status: string
    created_at: string
    event: { title: string } | null
    purchase_intent?: {
        payment_method: string | null
        settlement_status?: string | null
        estimated_settlement_time?: string | null
        settled_at?: string | null
        refunded_amount?: number | null
        refunded_at?: string | null
    } | null
    _type?: 'ticket' | 'topup' | 'experience'
}

interface TransactionsHistoryProps {
    transactions: Transaction[]
    totalCount: number
}

export function TransactionsHistory({ transactions, totalCount }: TransactionsHistoryProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const handleExport = () => {
        if (!transactions.length) return

        const headers = [
            'Date',
            'Event',
            'Channel',
            'Payment Method',
            'Amount',
            'Total Fees',
            'Net Payout',
            'Status',
            'Settlement Status',
            'Settlement ETA'
        ]

        const csvContent = [
            headers.join(','),
            ...transactions.map(t => {
                const settlement = getSettlementInfo(t.created_at, t.purchase_intent?.payment_method, {
                    status: t.purchase_intent?.settlement_status,
                    etaTime: t.purchase_intent?.estimated_settlement_time,
                    settledAt: t.purchase_intent?.settled_at,
                })
                return [
                    `"${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm:ss')}"`,
                    `"${t.event?.title || 'Unknown'}"`,
                    `"${getPaymentChannel(t.purchase_intent?.payment_method)}"`,
                    `"${t.purchase_intent?.payment_method?.toUpperCase() || 'UNKNOWN'}"`,
                    t.gross_amount,
                    (Number(t.gross_amount) - Number(t.organizer_payout)),
                    t.organizer_payout,
                    t.status,
                    settlement.status,
                    `"${format(settlement.etaDate, 'MMM d, yyyy')}"`,
                ].join(',')
            })
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

    // Exclude internal refund reversal rows (negative gross) from the sales view — the
    // refund is surfaced from the intent's refunded_amount instead, so nothing double-counts.
    const salesTx = transactions.filter(t => Number(t.gross_amount) >= 0)

    // Summary stats.
    //  - Incoming = gross sales (what customers paid).
    //  - Fees = Incoming − gross payout (what platform/processing took on the sale). Derived
    //    this way because organizer_payout used different fee rules across eras, so summing
    //    the raw fee columns didn't equal the real deduction.
    //  - Refunds = amounts returned to customers (organizer shoulders the full amount).
    //  - Net Earnings = gross payout − refunds (what the organizer actually nets).
    const totalIncoming = salesTx.reduce((sum, t) => sum + Number(t.gross_amount), 0)
    const grossPayout = salesTx.reduce((sum, t) => sum + Number(t.organizer_payout), 0)
    const totalRefunds = salesTx.reduce((sum, t) => sum + Number(t.purchase_intent?.refunded_amount || 0), 0)
    const totalFees = totalIncoming - grossPayout
    const totalNet = grossPayout - totalRefunds

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'completed':
                return {
                    label: 'Success',
                    icon: Check,
                    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    dotColor: 'bg-emerald-500',
                }
            case 'pending':
                return {
                    label: 'Pending',
                    icon: Clock,
                    className: 'bg-amber-50 text-amber-700 border-amber-200',
                    dotColor: 'bg-amber-500',
                }
            case 'failed':
                return {
                    label: 'Failed',
                    icon: X,
                    className: 'bg-red-50 text-red-700 border-red-200',
                    dotColor: 'bg-red-500',
                }
            case 'refunded':
                return {
                    label: 'Refunded',
                    icon: ArrowUpRight,
                    className: 'bg-slate-50 text-slate-600 border-slate-200',
                    dotColor: 'bg-slate-400',
                }
            default:
                return {
                    label: status,
                    icon: Clock,
                    className: 'bg-slate-50 text-slate-600 border-slate-200',
                    dotColor: 'bg-slate-400',
                }
        }
    }

    return (
        <div className="space-y-4">
            {/* Summary Cards - Xendit Style */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-emerald-50">
                                    <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Incoming</p>
                                    <p className="text-2xl font-bold">₱{totalIncoming.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Count</p>
                                <p className="text-lg font-semibold">{totalCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-blue-50">
                                    <ArrowUpRight className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Net Earnings</p>
                                    <p className="text-2xl font-bold">₱{totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    {totalRefunds > 0 && (
                                        <p className="text-[11px] text-muted-foreground">incl. −₱{totalRefunds.toLocaleString(undefined, { minimumFractionDigits: 2 })} refunded</p>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Fees</p>
                                <p className="text-lg font-semibold text-red-500">-₱{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Export Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleExport}
                    disabled={transactions.length === 0}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                </Button>
            </div>

            {/* Transaction Table */}
            <Card className="border-border/50 overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 w-[100px]">Status</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3">Event</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3">Channel</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 text-right">Amount</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 text-right">Fees</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 text-right">Net Payout</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3">Settlement</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 text-right">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salesTx.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="p-3 rounded-full bg-muted">
                                                <ArrowDownLeft className="w-6 h-6 opacity-40" />
                                            </div>
                                            <p className="text-sm">No transactions found</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                salesTx.map((transaction) => {
                                    const isTopUp = transaction._type === 'topup'
                                    const isEventTxn = !isTopUp && transaction._type !== 'experience'
                                    // A refund lives on the purchase_intent (refunded_amount), not on the
                                    // original sale row — surface it here so refunds are visible on the
                                    // transaction regardless of which refund path wrote them.
                                    const refundedAmt = isTopUp ? 0 : Number(transaction.purchase_intent?.refunded_amount || 0)
                                    const isRefunded = refundedAmt > 0
                                    const statusConfig = getStatusConfig(isRefunded ? 'refunded' : transaction.status)
                                    const StatusIcon = statusConfig.icon
                                    const paymentMethod = transaction.purchase_intent?.payment_method
                                    const channel = isTopUp ? 'Wallet' : getPaymentChannel(paymentMethod)
                                    // Fees = what was actually taken (Amount − Net Payout), so the
                                    // row reconciles even where the fee columns are historically off.
                                    const totalFees = isTopUp ? 0 : Number(transaction.gross_amount) - Number(transaction.organizer_payout)
                                    const settlement = isTopUp ? null : getSettlementInfo(transaction.created_at, paymentMethod, {
                                        status: transaction.purchase_intent?.settlement_status,
                                        etaTime: transaction.purchase_intent?.estimated_settlement_time,
                                        settledAt: transaction.purchase_intent?.settled_at,
                                    })

                                    return (
                                        <TableRow
                                            key={transaction.id}
                                            onClick={isEventTxn ? () => setSelectedId(transaction.id) : undefined}
                                            className={`border-border/50 hover:bg-muted/20 group ${isTopUp ? 'bg-purple-500/[0.03]' : ''} ${isEventTxn ? 'cursor-pointer' : ''}`}
                                        >
                                            {/* Status */}
                                            <TableCell>
                                                {isTopUp ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[11px] font-medium gap-1 bg-purple-50 text-purple-700 border-purple-200"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        Top Up
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[11px] font-medium gap-1 ${statusConfig.className}`}
                                                    >
                                                        <StatusIcon className="w-3 h-3" />
                                                        {statusConfig.label}
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            {/* Event / Description */}
                                            <TableCell>
                                                <span className={`font-medium text-sm ${isTopUp ? 'text-purple-700' : 'text-foreground'}`}>
                                                    {isTopUp ? 'Wallet Top-Up' : (transaction.event?.title || 'Unknown Event')}
                                                </span>
                                                {transaction._type === 'experience' && (
                                                    <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                        Experience
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            {/* Channel + Payment Method */}
                                            <TableCell>
                                                <div>
                                                    <span className="text-sm text-foreground flex items-center gap-1">
                                                        {isTopUp && <Wallet className="w-3 h-3 text-purple-500" />}
                                                        {channel}
                                                    </span>
                                                    <span className="block text-[11px] text-muted-foreground">
                                                        {isTopUp ? 'SELF-FUNDED' : (paymentMethod?.toUpperCase() || 'UNKNOWN')}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* Amount */}
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isTopUp ? (
                                                        <ArrowUpRight className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                                                    ) : (
                                                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                    )}
                                                    <span className={`font-medium text-sm ${isTopUp ? 'text-purple-700' : ''}`}>
                                                        ₱{Number(transaction.gross_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* Fees */}
                                            <TableCell className="text-right">
                                                {isTopUp ? (
                                                    <span className="text-sm text-muted-foreground">—</span>
                                                ) : (
                                                    <span className="text-sm text-red-500">
                                                        -₱{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                            </TableCell>

                                            {/* Net Payout */}
                                            <TableCell className="text-right">
                                                {isTopUp ? (
                                                    <span className="text-sm font-semibold text-purple-600">
                                                        +₱{Number(transaction.organizer_payout).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                ) : (
                                                    <div>
                                                        <span className={`text-sm font-semibold ${isRefunded ? 'text-muted-foreground line-through' : 'text-emerald-600'}`}>
                                                            ₱{Number(transaction.organizer_payout).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </span>
                                                        {isRefunded && (
                                                            <span className="block text-[11px] font-medium text-slate-500">
                                                                −₱{refundedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} refunded
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>

                                            {/* Settlement Status */}
                                            <TableCell>
                                                {isTopUp ? (
                                                    <span className="text-sm text-purple-600 font-medium">Instant</span>
                                                ) : settlement ? (
                                                    <div title={settlement.estimated ? 'Estimated from the payment method’s typical settlement time — confirm the exact date in Xendit.' : 'From Xendit settlement data.'}>
                                                        {settlement.status === 'settled' && !settlement.estimated ? (
                                                            // Confirmed by Xendit
                                                            <span className="text-sm text-emerald-600 font-medium">Settled</span>
                                                        ) : settlement.status === 'settled' && settlement.estimated ? (
                                                            // Our guess only — never present as confirmed
                                                            <>
                                                                <span className="text-sm text-muted-foreground font-medium">Est. settled</span>
                                                                <span className="block text-[11px] text-muted-foreground">~{format(settlement.etaDate, 'MMM d, yyyy')} · estimate</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-sm text-amber-600 font-medium">Pending</span>
                                                                <span className="block text-[11px] text-muted-foreground">
                                                                    {settlement.estimated ? 'Est. ' : 'ETA '}{format(settlement.etaDate, 'MMM d, yyyy')}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </TableCell>

                                            {/* Date */}
                                            <TableCell className="text-right">
                                                <div>
                                                    <span className="text-sm">{format(new Date(transaction.created_at), 'MMM d, yyyy')}</span>
                                                    <span className="block text-[11px] text-muted-foreground">
                                                        {format(new Date(transaction.created_at), 'h:mm a')}
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <TransactionDetailDialog
                transactionId={selectedId}
                open={!!selectedId}
                onOpenChange={(o) => { if (!o) setSelectedId(null) }}
            />
        </div>
    )
}
