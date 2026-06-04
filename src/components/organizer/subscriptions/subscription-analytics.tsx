'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Users, DollarSign, UserMinus, BarChart2 } from 'lucide-react'
import { format, startOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'

interface Payment {
    amount: number
    platform_fee: number
    created_at: string
    billing_period_start: string
}

interface Subscription {
    id: string
    status: string
    created_at: string
    cancelled_at: string | null
    current_period_end: string
    subscription_tiers: { name: string; price_monthly: number } | null
}

interface Props {
    payments: Payment[]
    subscriptions: Subscription[]
}

export function SubscriptionAnalytics({ payments, subscriptions }: Props) {
    const now = new Date()

    // ── Build last 6 months of MRR data ──────────────────────────
    const months = eachMonthOfInterval({
        start: subMonths(startOfMonth(now), 5),
        end: startOfMonth(now),
    })

    const mrrData = months.map(month => {
        const monthStr = format(month, 'yyyy-MM')
        const monthPayments = payments.filter(p =>
            format(new Date(p.billing_period_start), 'yyyy-MM') === monthStr
        )
        const revenue = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0)
        const fees = monthPayments.reduce((sum, p) => sum + Number(p.platform_fee), 0)
        return {
            month: format(month, 'MMM'),
            revenue,
            payout: revenue - fees,
        }
    })

    // ── Key metrics ───────────────────────────────────────────────
    const active = subscriptions.filter(s => s.status === 'active' || s.status === 'grace_period')
    const cancelled = subscriptions.filter(s => s.status === 'cancelled' || s.status === 'expired')

    const currentMrr = active.reduce((sum, s) => sum + Number((s.subscription_tiers as any)?.price_monthly || 0), 0)
    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const totalPayout = totalRevenue - payments.reduce((sum, p) => sum + Number(p.platform_fee), 0)

    // Churn rate this month: cancelled this month / active last month
    const thisMonthCancelled = subscriptions.filter(s =>
        s.cancelled_at && format(new Date(s.cancelled_at), 'yyyy-MM') === format(now, 'yyyy-MM')
    ).length
    const lastMonthActive = subscriptions.filter(s => {
        const created = new Date(s.created_at)
        return created < startOfMonth(now)
    }).length
    const churnRate = lastMonthActive > 0
        ? Math.round((thisMonthCancelled / lastMonthActive) * 100)
        : 0

    // MRR trend: compare current vs last month
    const currentMonthRevenue = mrrData[mrrData.length - 1]?.revenue || 0
    const prevMonthRevenue = mrrData[mrrData.length - 2]?.revenue || 0
    const mrrTrend = prevMonthRevenue > 0
        ? Math.round(((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
        : 0

    // Tier breakdown
    const tierMap = new Map<string, { count: number; mrr: number }>()
    active.forEach(s => {
        const tier = (s.subscription_tiers as any)
        if (!tier) return
        const existing = tierMap.get(tier.name) || { count: 0, mrr: 0 }
        tierMap.set(tier.name, { count: existing.count + 1, mrr: existing.mrr + Number(tier.price_monthly) })
    })
    const tiers = Array.from(tierMap.entries()).sort((a, b) => b[1].mrr - a[1].mrr)

    if (subscriptions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <BarChart2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="font-semibold text-foreground">No data yet</p>
                <p className="text-sm mt-1">Analytics will appear once you have subscribers.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    {
                        label: 'Monthly Recurring Revenue',
                        value: `₱${currentMrr.toLocaleString()}`,
                        icon: DollarSign,
                        sub: mrrTrend !== 0 ? (
                            <span className={`flex items-center gap-0.5 text-xs ${mrrTrend > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                {mrrTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {Math.abs(mrrTrend)}% vs last month
                            </span>
                        ) : null,
                    },
                    {
                        label: 'Active Subscribers',
                        value: active.length,
                        icon: Users,
                        sub: <span className="text-xs text-muted-foreground">{subscriptions.length} total all-time</span>,
                    },
                    {
                        label: 'Churn Rate',
                        value: `${churnRate}%`,
                        icon: UserMinus,
                        sub: <span className="text-xs text-muted-foreground">This month</span>,
                    },
                    {
                        label: 'Total Payout',
                        value: `₱${totalPayout.toLocaleString()}`,
                        icon: TrendingUp,
                        sub: <span className="text-xs text-muted-foreground">All-time net</span>,
                    },
                ].map(stat => {
                    const Icon = stat.icon
                    return (
                        <Card key={stat.label} className="p-5">
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">{stat.label}</p>
                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            </div>
                            <p className="text-2xl font-bold">{stat.value}</p>
                            {stat.sub}
                        </Card>
                    )
                })}
            </div>

            {/* MRR chart */}
            <Card className="p-5">
                <h3 className="font-semibold mb-4">Revenue (last 6 months)</h3>
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={mrrData}>
                        <defs>
                            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={v => v === 0 ? '₱0' : `₱${(v / 1000).toFixed(0)}k`}
                            width={48}
                        />
                        <Tooltip
                            formatter={(v: number) => [`₱${v.toLocaleString()}`, 'Revenue']}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            fill="url(#revenueGrad)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </Card>

            {/* Tier breakdown */}
            {tiers.length > 0 && (
                <Card className="p-5">
                    <h3 className="font-semibold mb-4">Active Subscribers by Tier</h3>
                    <div className="space-y-3">
                        {tiers.map(([name, data]) => (
                            <div key={name}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium">{name}</span>
                                    <span className="text-muted-foreground">
                                        {data.count} subscriber{data.count !== 1 ? 's' : ''} · ₱{data.mrr.toLocaleString()}/mo
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.round((data.count / active.length) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Recent payments */}
            <Card className="p-5">
                <h3 className="font-semibold mb-4">Recent Payments</h3>
                {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                    <div className="space-y-2">
                        {payments.slice(-10).reverse().map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                                <span className="text-muted-foreground">
                                    {format(new Date(p.created_at), 'MMM d, yyyy')}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">
                                        Platform: ₱{Number(p.platform_fee).toLocaleString()}
                                    </span>
                                    <span className="font-medium text-green-600">
                                        +₱{Number(p.amount).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    )
}
