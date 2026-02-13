import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { DollarSign, TrendingUp, Users, CreditCard } from 'lucide-react'
import { TransactionsClient } from './transactions-client'
import { SalesVelocityChart } from '@/components/admin/accounting/sales-velocity-chart'
import { PayoutsHistoryTable } from '@/components/admin/accounting/payouts-history-table'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

async function getAccountingStats() {
    const supabase = await createClient()

    const { data: statsData, error: statsError } = await supabase.rpc('get_admin_accounting_stats')

    if (statsError) {
        console.error('Error fetching admin stats:', statsError)
    }

    const stats = statsData?.[0] || {}

    // Get daily sales for chart
    const { data: dailyData, error: dailyError } = await supabase.rpc('get_daily_sales_stats')

    if (dailyError) {
        console.error('Error fetching daily sales:', dailyError)
    }

    return {
        stats: {
            totalRevenue: Number(stats.total_revenue || 0),
            platformFees: Number(stats.platform_fees || 0),
            partnerPayouts: Number(stats.partner_payouts || 0),
            pendingPayouts: Number(stats.pending_payouts || 0),
            transactionCount: Number(stats.transaction_count || 0),
        },
        dailySales: dailyData || []
    }
}

async function getRecentTransactions() {
    const supabase = await createClient()

    const { data: transactions } = await supabase
        .from('transactions')
        .select(`
      *,
      event:events(title),
      partner:partners(business_name),
      fixed_fee
    `)
        .order('created_at', { ascending: false })
        .limit(50)

    return transactions || []
}

async function getAllPayouts() {
    const supabase = await createClient()

    const { data: payouts } = await supabase
        .from('payouts')
        .select(`
      *,
      partner:partners(business_name)
    `)
        .order('requested_at', { ascending: false })
        .limit(50)

    return payouts || []
}

export default async function AccountingPage() {
    const { stats, dailySales } = await getAccountingStats()

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">Accounting</h1>
                        <p className="text-muted-foreground">Financial overview, transactions, and payouts.</p>
                    </div>
                    <Link href="/admin/accounting/payouts">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            Review Pending Payouts
                        </Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card className="p-6 bg-card border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-muted-foreground text-sm mb-1">Total Revenue</p>
                                <p className="text-3xl font-bold">₱{stats.totalRevenue.toLocaleString()}</p>
                                <p className="text-muted-foreground text-xs mt-1">{stats.transactionCount} transactions</p>
                            </div>
                            <DollarSign className="h-10 w-10 text-green-500" />
                        </div>
                    </Card>

                    <Card className="p-6 bg-card border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-muted-foreground text-sm mb-1">Platform Fees</p>
                                <p className="text-3xl font-bold">₱{stats.platformFees.toLocaleString()}</p>
                                <p className="text-muted-foreground text-xs mt-1">HangHut revenue</p>
                            </div>
                            <TrendingUp className="h-10 w-10 text-blue-500" />
                        </div>
                    </Card>

                    <Card className="p-6 bg-card border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-muted-foreground text-sm mb-1">Partner Payouts</p>
                                <p className="text-3xl font-bold">₱{stats.partnerPayouts.toLocaleString()}</p>
                                <p className="text-muted-foreground text-xs mt-1">Paid to organizers</p>
                            </div>
                            <Users className="h-10 w-10 text-purple-500" />
                        </div>
                    </Card>

                    <Card className="p-6 bg-card border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-muted-foreground text-sm mb-1">Pending Payouts</p>
                                <p className="text-3xl font-bold">₱{stats.pendingPayouts.toLocaleString()}</p>
                                <p className="text-muted-foreground text-xs mt-1">Awaiting approval</p>
                            </div>
                            <CreditCard className="h-10 w-10 text-yellow-500" />
                        </div>
                    </Card>
                </div>

                <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="transactions">Transactions</TabsTrigger>
                        <TabsTrigger value="payouts">Payout History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <SalesVelocityChart data={dailySales} />

                        <div className="mt-8">
                            <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
                            <Suspense fallback={<SkeletonTable rows={5} />}>
                                <TransactionsWrapper limit={5} />
                            </Suspense>
                        </div>
                    </TabsContent>

                    <TabsContent value="transactions">
                        <div className="mt-2">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">All Transactions</h2>
                            </div>
                            <Suspense fallback={<SkeletonTable rows={20} />}>
                                <TransactionsWrapper limit={50} />
                            </Suspense>
                        </div>
                    </TabsContent>

                    <TabsContent value="payouts">
                        <div className="mt-2">
                            <h2 className="text-xl font-bold mb-4">Payout History</h2>
                            <Suspense fallback={<SkeletonTable rows={20} />}>
                                <PayoutsHistoryWrapper />
                            </Suspense>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

async function TransactionsWrapper({ limit = 20 }: { limit?: number }) {
    const supabase = await createClient()
    const { data: transactions } = await supabase
        .from('transactions')
        .select(`
        *,
        event:events(title),
        partner:partners(business_name),
        fixed_fee
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

    return <TransactionsClient transactions={transactions || []} />
}

async function PayoutsHistoryWrapper() {
    const payouts = await getAllPayouts()
    return <PayoutsHistoryTable payouts={payouts} />
}

