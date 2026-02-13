import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { TransactionsHistory } from '@/components/organizer/payouts/transactions-history'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function PayoutDetailPage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: payout } = await supabase
        .from('payouts')
        .select('*')
        .eq('id', id)
        .single()

    if (!payout) {
        return <div>Payout not found</div>
    }

    // Fetch linked transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select(`
            *,
            event:events (
                title
            )
        `)
        .eq('payout_id', id)
        .order('created_at', { ascending: false })

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500/10 text-green-600'
            case 'pending_request': return 'bg-yellow-500/10 text-yellow-600'
            case 'approved': return 'bg-blue-500/10 text-blue-600'
            case 'processing': return 'bg-purple-500/10 text-purple-600'
            case 'rejected': return 'bg-red-500/10 text-red-600'
            default: return 'bg-slate-500/10 text-slate-600'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/organizer/payouts">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Payout Details</h1>
                    <p className="text-muted-foreground text-sm">
                        Requested on {format(new Date(payout.requested_at), 'MMM d, yyyy')}
                    </p>
                </div>
                <div className="ml-auto">
                    <Badge className={getStatusColor(payout.status)}>
                        {payout.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Payout Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Amount</span>
                            <span className="font-bold text-xl">₱{Number(payout.amount).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Bank Name</span>
                            <span className="font-medium">{payout.bank_name}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Account Name</span>
                            <span className="font-medium">{payout.bank_account_name}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Account Number</span>
                            <span className="font-medium font-mono text-sm">
                                •••• {payout.bank_account_number.slice(-4)}
                            </span>
                        </div>
                        {payout.xendit_disbursement_id && (
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Ref ID</span>
                                <span className="font-mono text-xs">{payout.xendit_disbursement_id}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Timeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                                <div>
                                    <p className="font-medium">Requested</p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(new Date(payout.requested_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                </div>
                            </div>
                            {payout.approved_at && (
                                <div className="flex gap-4">
                                    <div className="w-2 h-2 mt-2 rounded-full bg-purple-500" />
                                    <div>
                                        <p className="font-medium">Approved</p>
                                        <p className="text-sm text-muted-foreground">
                                            {format(new Date(payout.approved_at), 'MMM d, yyyy h:mm a')}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {payout.completed_at && (
                                <div className="flex gap-4">
                                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                                    <div>
                                        <p className="font-medium">Completed</p>
                                        <p className="text-sm text-muted-foreground">
                                            {format(new Date(payout.completed_at), 'MMM d, yyyy h:mm a')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Included Transactions
                </h2>
                {transactions && transactions.length > 0 ? (
                    <TransactionsHistory transactions={transactions} />
                ) : (
                    <Card className="p-8 text-center text-muted-foreground">
                        <p>No linked transactions found for this payout.</p>
                        <p className="text-sm mt-2 opacity-70">
                            (This feature requires payouts to be generated by the new accounting system)
                        </p>
                    </Card>
                )}
            </div>
        </div>
    )
}
