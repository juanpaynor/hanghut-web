import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { DollarSign, TrendingUp, Users, CreditCard } from 'lucide-react'
import { TransactionsClient } from './transactions-client'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

async function getAccountingStats() {
    const supabase = await createClient()

    // Get total transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('gross_amount, platform_fee, organizer_payout, status')
        .eq('status', 'completed')

    const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.gross_amount), 0) || 0
    const platformFees = transactions?.reduce((sum, t) => sum + Number(t.platform_fee), 0) || 0
    const partnerPayouts = transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0

    // Get pending payouts
    const { data: pendingPayouts } = await supabase
        .from('payouts')
        .select('amount')
        .in('status', ['pending_request', 'approved'])

    const pendingPayoutsTotal = pendingPayouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return {
        totalRevenue,
        platformFees,
        partnerPayouts,
        pendingPayouts: pendingPayoutsTotal,
        transactionCount: transactions?.length || 0,
    }
}

async function getRecentTransactions() {
    const supabase = await createClient()

    const { data: transactions } = await supabase
        .from('transactions')
        .select(`
      *,
      event:events(title),
      partner:partners(business_name)
    `)
        .order('created_at', { ascending: false })
        .limit(20)

    return transactions || []
}

export default async function AccountingPage() {
    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">Accounting</h1>
                        <p className="text-slate-400">Financial overview and transaction management</p>
                    </div>
                    <Link href="/admin/accounting/payouts">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            Manage Payouts
                        </Button>
                    </Link>
                </div>

                <Suspense fallback={<div>Loading stats...</div>}>
                    <AccountingStatsWrapper />
                </Suspense>

                <div className="mt-8">
                    <h2 className="text-2xl font-bold mb-4">Recent Transactions</h2>
                    <Suspense fallback={<SkeletonTable rows={20} />}>
                        <TransactionsWrapper />
                    </Suspense>
                </div>
            </div>
        </div>
    )
}

async function AccountingStatsWrapper() {
    const stats = await getAccountingStats()

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6 bg-slate-800 border-slate-700">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Total Revenue</p>
                        <p className="text-3xl font-bold">₱{stats.totalRevenue.toLocaleString()}</p>
                        <p className="text-slate-500 text-xs mt-1">{stats.transactionCount} transactions</p>
                    </div>
                    <DollarSign className="h-10 w-10 text-green-500" />
                </div>
            </Card>

            <Card className="p-6 bg-slate-800 border-slate-700">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Platform Fees</p>
                        <p className="text-3xl font-bold">₱{stats.platformFees.toLocaleString()}</p>
                        <p className="text-slate-500 text-xs mt-1">HangHut revenue</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-blue-500" />
                </div>
            </Card>

            <Card className="p-6 bg-slate-800 border-slate-700">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Partner Payouts</p>
                        <p className="text-3xl font-bold">₱{stats.partnerPayouts.toLocaleString()}</p>
                        <p className="text-slate-500 text-xs mt-1">Paid to organizers</p>
                    </div>
                    <Users className="h-10 w-10 text-purple-500" />
                </div>
            </Card>

            <Card className="p-6 bg-slate-800 border-slate-700">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Pending Payouts</p>
                        <p className="text-3xl font-bold">₱{stats.pendingPayouts.toLocaleString()}</p>
                        <p className="text-slate-500 text-xs mt-1">Awaiting approval</p>
                    </div>
                    <CreditCard className="h-10 w-10 text-yellow-500" />
                </div>
            </Card>
        </div>
    )
}

async function TransactionsWrapper() {
    const transactions = await getRecentTransactions()

    return <TransactionsClient transactions={transactions} />
}
