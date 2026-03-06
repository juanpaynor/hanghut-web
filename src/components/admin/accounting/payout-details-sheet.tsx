'use client'

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useState, useEffect } from 'react'
import { getPayoutTransactions } from '@/lib/admin/payout-actions'
import { Loader2, Eye } from 'lucide-react'

interface Transaction {
    id: string
    created_at: string
    gross_amount: number
    platform_fee: number
    fixed_fee: number | null
    organizer_payout: number
    event: {
        title: string
    }
    user: {
        display_name: string
        email: string
    }
}

interface PayoutDetailsSheetProps {
    payoutId: string
    payoutAmount: number
    trigger?: React.ReactNode
}

export function PayoutDetailsSheet({ payoutId, payoutAmount, trigger }: PayoutDetailsSheetProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [transactions, setTransactions] = useState<Transaction[]>([])

    useEffect(() => {
        if (open && transactions.length === 0) {
            setLoading(true)
            getPayoutTransactions(payoutId)
                .then((data) => {
                    setTransactions(data as unknown as Transaction[])
                })
                .catch((err) => console.error(err))
                .finally(() => setLoading(false))
        }
    }, [open, payoutId, transactions.length])

    // Calculate totals from transactions
    const totalGross = transactions.reduce((sum, t) => sum + Number(t.gross_amount), 0)
    const totalFees = transactions.reduce((sum, t) => sum + Number(t.platform_fee) + Number(t.fixed_fee || 0), 0)
    const totalPayout = transactions.reduce((sum, t) => sum + Number(t.organizer_payout), 0)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <span className="sr-only">Open details</span>
                        <Eye className="h-4 w-4" />
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent className="w-[800px] sm:w-[540px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Payout Details</SheetTitle>
                    <SheetDescription>
                        Transaction breakdown for this payout request.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                        <div>
                            <p className="text-xs text-muted-foreground">Total Payout</p>
                            <p className="text-lg font-bold text-primary">₱{payoutAmount.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Linked Gross Sales</p>
                            <p className="text-lg font-bold">
                                {loading ? '...' : `₱${totalGross.toLocaleString()}`}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Platform Fees</p>
                            <p className="text-lg font-bold text-red-500">
                                {loading ? '...' : `-₱${totalFees.toLocaleString()}`}
                            </p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium mb-2">Included Transactions</h3>
                        <div className="rounded-md border border-border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-card/50">
                                        <TableHead>Event / User</TableHead>
                                        <TableHead className="text-right">Gross</TableHead>
                                        <TableHead className="text-right">Fee</TableHead>
                                        <TableHead className="text-right">Net</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                            </TableCell>
                                        </TableRow>
                                    ) : transactions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                No linked transactions found.
                                                <div className="text-xs mt-1">
                                                    (Payout might have been created before detailed tracking was enabled)
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        transactions.map((t) => (
                                            <TableRow key={t.id} className="border-border hover:bg-card/50 text-xs">
                                                <TableCell>
                                                    <div className="font-medium truncate max-w-[150px]">{t.event.title}</div>
                                                    <div className="text-muted-foreground truncate max-w-[150px]">{t.user.display_name}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {new Date(t.created_at).toLocaleDateString()}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    ₱{Number(t.gross_amount).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-red-400">
                                                    -₱{(Number(t.platform_fee) + Number(t.fixed_fee || 0)).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-green-500">
                                                    ₱{Number(t.organizer_payout).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
