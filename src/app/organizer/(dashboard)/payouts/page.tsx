import { getAuthUser, getPartnerId, getUserRole } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Clock, Settings, Wallet, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BankSettingsForm } from '@/components/organizer/payouts/bank-settings-form'
import { RequestPayoutCard } from '@/components/organizer/payouts/request-payout-card'
import { TransactionsHistory } from '@/components/organizer/payouts/transactions-history'
import { PayoutsDateFilter } from '@/components/organizer/payouts/payouts-date-filter'
import { WalletCard } from '@/components/organizer/payouts/wallet-card'
import { getWalletInfo } from '@/lib/organizer/wallet-actions'
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
        .select('id, amount, status, bank_name, requested_at, admin_notes, rejection_reason', { count: 'exact' })
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
            id,
            gross_amount,
            organizer_payout,
            platform_fee,
            payment_processing_fee,
            fixed_fee,
            status,
            created_at,
            payout_id,
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

// Helper to get wallet top-ups from the dedicated wallet_topups table
async function getWalletTopUps(partnerId: string) {
    const supabase = await createClient()

    const { data: topups } = await supabase
        .from('wallet_topups')
        .select('id, amount, status, payment_method, reference_id, created_at, completed_at')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50)

    // Normalize top-ups into the transaction shape for the unified list
    return (topups || []).map(t => ({
        id: t.id,
        gross_amount: t.amount,
        organizer_payout: t.amount,
        platform_fee: 0,
        payment_processing_fee: 0,
        fixed_fee: null,
        status: 'completed',
        created_at: t.created_at,
        payout_id: null,
        event: { title: 'Wallet Top-Up' },
        purchase_intent: { payment_method: t.payment_method },
        _type: 'topup' as const,
    }))
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
    const resolvedParams = await searchParams
    const from = resolvedParams.from
    const to = resolvedParams.to
    const search = resolvedParams.q
    const txPage = Number(resolvedParams.tx_page) || 1
    const payoutPage = Number(resolvedParams.payout_page) || 1

    // Cached — layout already resolved these
    const { user } = await getAuthUser()
    if (!user) return null

    // Only owner and finance roles can access payouts
    const userRole = await getUserRole(user.id)
    if (!userRole || !['owner', 'finance'].includes(userRole.role)) {
        redirect('/organizer')
    }

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return null

    // Parallel fetching
    const [stats, payoutsResult, bankAccounts, transactionsResult, periodEarnings, walletInfo, topups] = await Promise.all([
        getPayoutStats(partnerId),
        getPayoutHistory(partnerId, from, to, payoutPage, 5),
        getBankAccounts(partnerId),
        getTransactions(partnerId, from, to, search, txPage, 10),
        from && to ? getPeriodEarnings(partnerId, from, to) : Promise.resolve(null),
        getWalletInfo(partnerId),
        getWalletTopUps(partnerId),
    ])

    const { payouts, count: payoutCount } = payoutsResult
    const { transactions: ticketTransactions, count: transactionCount } = transactionsResult

    // Merge ticket transactions + wallet top-ups, sorted by date
    const transactions = [...ticketTransactions.map((t: any) => ({ ...t, _type: 'ticket' })), ...topups]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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

                <TabsContent value="overview" className="space-y-6">
                    {/* Hero Wallet Section */}
                    <WalletCard
                        xenditAccountId={walletInfo.xenditAccountId}
                        receivable={walletInfo.receivable}
                        kycStatus={walletInfo.kycStatus}
                        xenditAvailableBalance={walletInfo.xenditAvailableBalance}
                        pendingSettlement={walletInfo.pendingSettlement}
                    />

                    {/* Secondary Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="p-5 border-border/50 hover:border-border transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-blue-500/10">
                                    <TrendingUp className="h-5 w-5 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        {periodEarnings !== null ? 'Period Earnings' : 'Lifetime Earnings'}
                                    </p>
                                    <p className="text-xl font-bold">
                                        ₱{(periodEarnings !== null ? periodEarnings : stats.totalEarnings).toLocaleString()}
                                    </p>
                                    {periodEarnings !== null && (
                                        <p className="text-[10px] text-muted-foreground">
                                            Lifetime: ₱{stats.totalEarnings.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Card>

                        <Card className="p-5 border-border/50 hover:border-border transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-amber-500/10">
                                    <Clock className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pending Requests</p>
                                    <p className="text-xl font-bold">
                                        ₱{stats.pendingPayouts.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-5 border-border/50 hover:border-border transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-green-500/10">
                                    <DollarSign className="h-5 w-5 text-green-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Withdrawn</p>
                                    <p className="text-xl font-bold">
                                        ₱{stats.completedPayouts.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Request Payout */}
                    <RequestPayoutCard
                        balance={walletInfo.xenditAvailableBalance}
                        partnerId={partnerId}
                        hasBank={bankAccounts.some((b: any) => b.is_primary)}
                    />

                    {/* Withdrawal History */}
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-muted">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <h2 className="text-lg font-semibold">Withdrawal History</h2>
                            </div>
                            {from && to && (
                                <Badge variant="outline" className="text-muted-foreground font-normal text-xs">
                                    Filtered
                                </Badge>
                            )}
                        </div>
                        {payouts.length === 0 ? (
                            <div className="text-center py-10">
                                <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                                    <DollarSign className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">No withdrawal requests yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {payouts.map((payout: any) => (
                                    <Link
                                        key={payout.id}
                                        href={`/organizer/payouts/${payout.id}`}
                                        className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-border hover:bg-muted/30 transition-all block"
                                    >
                                        <div>
                                            <p className="font-semibold">₱{Number(payout.amount).toLocaleString()}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                <span>{format(new Date(payout.requested_at), 'MMM d, yyyy')}</span>
                                                <span className="opacity-40">•</span>
                                                <span>{payout.bank_name}</span>
                                            </div>
                                            {payout.admin_notes && (
                                                <p className="text-xs text-yellow-600 mt-1">{payout.admin_notes}</p>
                                            )}
                                            {payout.rejection_reason && (
                                                <p className="text-xs text-red-600 mt-1">Reason: {payout.rejection_reason}</p>
                                            )}
                                        </div>
                                        <Badge className={`text-[10px] ${getStatusColor(payout.status)}`}>
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
                        <div>
                            <h2 className="text-lg font-semibold">Transactions</h2>
                            <p className="text-sm text-muted-foreground">Each row represents a completed ticket sale with fees and settlement info</p>
                        </div>
                        <SearchInput placeholder="Search event or ID..." />
                    </div>
                    <TransactionsHistory transactions={transactions as any} totalCount={transactionCount} />
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {Math.min((txPage - 1) * 10 + 1, transactionCount)}–{Math.min(txPage * 10, transactionCount)} of {transactionCount} transactions
                        </p>
                        <PaginationControls totalCount={transactionCount} pageSize={10} paramName="tx_page" />
                    </div>
                </TabsContent>

                <TabsContent value="settings">
                    <BankSettingsForm accounts={bankAccounts} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
