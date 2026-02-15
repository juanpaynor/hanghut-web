import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Clock, Settings, Wallet, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BankSettingsForm } from '@/components/organizer/payouts/bank-settings-form'
import { RequestPayoutCard } from '@/components/organizer/payouts/request-payout-card'
import { TransactionsHistory } from '@/components/organizer/payouts/transactions-history'
import { PayoutsDateFilter } from '@/components/organizer/payouts/payouts-date-filter'
import Link from 'next/link'
import { SearchInput } from '@/components/ui/search-input'
import { PaginationControls } from '@/components/ui/pagination-controls'

export const dynamic = 'force-dynamic'

async function getPayoutStats(partnerId: string) {
    const supabase = await createClient()

    // Get all completed transactions (Lifetime for Balance)
    const { data: transactions } = await supabase
        .from('transactions')
        .select('organizer_payout')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')

    const totalEarnings = transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0

    // Get all payouts (Lifetime for Balance)
    const { data: payouts } = await supabase
        .from('payouts')
        .select('amount, status')
        .eq('partner_id', partnerId)

    const completedPayouts = payouts?.filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0

    const pendingPayouts = payouts?.filter(p => ['pending_request', 'processing', 'approved'].includes(p.status))
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return {
        totalEarnings,
        completedPayouts,
        pendingPayouts,
        availableBalance: totalEarnings - completedPayouts - pendingPayouts,
    }
}

async function getPayoutHistory(partnerId: string, from?: string, to?: string, page: number = 1, pageSize: number = 5) {
    const supabase = await createClient()

    let query = supabase
        .from('payouts')
        .select('*', { count: 'exact' })
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', `${to}T23:59:59`)

    const { data: payouts, count } = await query

    return { payouts: payouts || [], count: count || 0 }
}

async function getBankAccounts(partnerId: string) {
    const supabase = await createClient()
    const { data } = await supabase.from('bank_accounts').select('*').eq('partner_id', partnerId).order('is_primary', { ascending: false }).order('created_at', { ascending: false })
    return data || []
}

async function getTransactions(partnerId: string, from?: string, to?: string, search?: string, page: number = 1, pageSize: number = 10) {
    const supabase = await createClient()

    let queryBuilder = supabase
        .from('transactions')
        .select(`
            *,
            event:events!inner (
                title
            ),
            purchase_intent:purchase_intents (
                payment_method
            )
        `, { count: 'exact' })
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

    if (from) queryBuilder = queryBuilder.gte('created_at', from)
    if (to) queryBuilder = queryBuilder.lte('created_at', `${to}T23:59:59`)

    if (search) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)
        if (isUUID) {
            queryBuilder = queryBuilder.eq('id', search)
        } else {
            queryBuilder = queryBuilder.ilike('event.title', `%${search}%`)
        }
    }

    const { data: transactions, count } = await queryBuilder

    return { transactions: transactions || [], count: count || 0 }
}

// Helper to get Period Earnings
async function getPeriodEarnings(partnerId: string, from?: string, to?: string) {
    if (!from || !to) return null
    const supabase = await createClient()
    const { data: transactions } = await supabase
        .from('transactions')
        .select('organizer_payout')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')
        .gte('created_at', from)
        .lte('created_at', `${to}T23:59:59`)

    return transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0
}

interface PageProps {
    searchParams: Promise<{ from?: string; to?: string; q?: string; tx_page?: string; payout_page?: string }>
}

export default async function OrganizerPayoutsPage({ searchParams }: PageProps) {
    const supabase = await createClient()
    const resolvedParams = await searchParams
    const from = resolvedParams.from
    const to = resolvedParams.to
    const search = resolvedParams.q
    const txPage = Number(resolvedParams.tx_page) || 1
    const payoutPage = Number(resolvedParams.payout_page) || 1

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (!partner) return null

    // Parallel fetching
    const [stats, payoutsResult, bankAccounts, transactionsResult, periodEarnings] = await Promise.all([
        getPayoutStats(partner.id),
        getPayoutHistory(partner.id, from, to, payoutPage, 5),
        getBankAccounts(partner.id),
        getTransactions(partner.id, from, to, search, txPage, 10),
        from && to ? getPeriodEarnings(partner.id, from, to) : Promise.resolve(null)
    ])

    const { payouts, count: payoutCount } = payoutsResult
    const { transactions, count: transactionCount } = transactionsResult

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
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold mb-2">Payouts</h1>
                    <p className="text-muted-foreground">Manage your earnings, banks, and payout requests</p>
                </div>
                <div className="flex items-center gap-2">
                    <PayoutsDateFilter />
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3 max-w-[600px] mb-8">
                    <TabsTrigger value="overview" className="flex items-center gap-2">
                        <Wallet className="w-4 h-4" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Transactions
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Bank Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-8">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                                    <p className="text-3xl font-bold text-green-600">
                                        ₱{stats.availableBalance.toLocaleString()}
                                    </p>
                                </div>
                                <DollarSign className="h-10 w-10 text-green-500 opacity-80" />
                            </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">
                                        {periodEarnings !== null ? 'Period Earnings' : 'Total Earnings'}
                                    </p>
                                    <p className="text-3xl font-bold text-blue-600">
                                        ₱{(periodEarnings !== null ? periodEarnings : stats.totalEarnings).toLocaleString()}
                                    </p>
                                    {periodEarnings !== null && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Total Lifetime: ₱{stats.totalEarnings.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                <TrendingUp className="h-10 w-10 text-blue-500 opacity-80" />
                            </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Pending Requests</p>
                                    <p className="text-3xl font-bold text-yellow-600">
                                        ₱{stats.pendingPayouts.toLocaleString()}
                                    </p>
                                </div>
                                <Clock className="h-10 w-10 text-yellow-500 opacity-80" />
                            </div>
                        </Card>
                    </div>

                    {/* Request Payout Logic */}
                    <RequestPayoutCard
                        balance={stats.availableBalance}
                        partnerId={partner.id}
                        hasBank={bankAccounts.some((b: any) => b.is_primary)}
                    />

                    {/* Withdrawal History */}
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">Withdrawal History</h2>
                            {from && to && (
                                <Badge variant="outline" className="text-muted-foreground font-normal">
                                    Filtered by Date
                                </Badge>
                            )}
                        </div>
                        {payouts.length === 0 ? (
                            <div className="text-center py-12">
                                <DollarSign className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                                <p className="text-muted-foreground">No payout requests found in this period</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {payouts.map((payout: any) => (
                                    <Link
                                        key={payout.id}
                                        href={`/organizer/payouts/${payout.id}`}
                                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors block"
                                    >
                                        <div>
                                            <p className="font-semibold text-lg">₱{Number(payout.amount).toLocaleString()}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{format(new Date(payout.requested_at), 'MMM d, yyyy')}</span>
                                                <span>•</span>
                                                <span>{payout.bank_name}</span>
                                            </div>
                                            {payout.admin_notes && (
                                                <p className="text-xs text-yellow-600 mt-1">{payout.admin_notes}</p>
                                            )}
                                            {payout.rejection_reason && (
                                                <p className="text-xs text-red-600 mt-1">Reason: {payout.rejection_reason}</p>
                                            )}
                                        </div>
                                        <Badge className={getStatusColor(payout.status)}>
                                            {payout.status.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                    </Link>
                                ))}
                            </div>
                        )}
                        <PaginationControls totalCount={payoutCount} pageSize={5} paramName="payout_page" />
                    </Card>
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">Transactions</h2>
                        <SearchInput placeholder="Search event or ID..." />
                    </div>
                    <TransactionsHistory transactions={transactions} />
                    <PaginationControls totalCount={transactionCount} pageSize={10} paramName="tx_page" />
                </TabsContent>

                <TabsContent value="settings">
                    <BankSettingsForm accounts={bankAccounts} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
