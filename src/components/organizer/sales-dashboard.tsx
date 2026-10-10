'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Ticket, DollarSign, Calendar, Users, TrendingUp } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
    SalesTrendCard,
    RecentActivityCard,
    SellingNowCard,
    LeadTimeCard,
} from '@/components/organizer/dashboard-insights'

interface SalesDashboardProps {
    data: {
        metrics: {
            totalRevenue: number
            netRevenue: number
            totalPlatformFees: number
            totalPaymentFees: number
            totalTicketsSold: number
            upcomingTicketsSold: number
            upcomingCapacity: number
            activeEventsCount: number
            avgOrderValue: number
        }
        velocityData: any[]
        paceData: any[]
        trend: { date: string; label: string; revenue: number; tickets: number }[]
        leadTime: { label: string; tickets: number; revenue: number; share: number }[]
        leadTotal: number
        sellingNow: { id: string; title: string; startDatetime: string; sold: number; capacity: number; revenue: number }[]
        currentEventName: string
        benchmarkEventName: string
        activeEvents: any[]
        recentActivity: any[]
    }
}

export function SalesDashboardClient({ data }: SalesDashboardProps) {
    const { metrics, recentActivity } = data

    // Sell-through is about inventory still on sale, so it uses the upcoming pair —
    // measuring lifetime sales against upcoming capacity would run past 100%.
    const percentSold = metrics.upcomingCapacity > 0
        ? Math.round((metrics.upcomingTicketsSold / metrics.upcomingCapacity) * 100)
        : 0

    return (
        <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {/* Net Earnings — the money you keep, promoted as the hero stat */}
                <Card className="relative overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-primary/80">Net Earnings</span>
                            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
                                <DollarSign className="h-4 w-4" />
                            </span>
                        </div>
                        <div className="mt-2 font-headline text-2xl font-bold tracking-tight text-primary">
                            ₱{metrics.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            After ₱{(metrics.totalPlatformFees + metrics.totalPaymentFees).toLocaleString(undefined, { maximumFractionDigits: 0 })} in fees
                        </p>
                    </CardContent>
                </Card>

                <StatCard label="Gross Revenue" icon={TrendingUp} tint="emerald"
                    value={`₱${metrics.totalRevenue.toLocaleString()}`} sub="Before fees" />

                <Card className="rounded-2xl">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tickets Sold</span>
                            <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/10 text-violet-600">
                                <Ticket className="h-4 w-4" />
                            </span>
                        </div>
                        <div className="mt-2 font-headline text-2xl font-bold tracking-tight">{metrics.totalTicketsSold.toLocaleString()}</div>
                        {metrics.upcomingCapacity > 0 ? (
                            <>
                                <div className="mt-2 flex items-center gap-2">
                                    <Progress value={percentSold} className="h-1.5 flex-1" />
                                    <span className="text-xs text-muted-foreground tabular-nums">{percentSold}%</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {metrics.upcomingTicketsSold.toLocaleString()} of {metrics.upcomingCapacity.toLocaleString()} on sale now
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-xs text-muted-foreground">All time</p>
                        )}
                    </CardContent>
                </Card>

                <StatCard label="Avg. Order" icon={Users} tint="amber"
                    value={`₱${metrics.avgOrderValue.toFixed(0)}`} sub="Per transaction" />

                <StatCard label="Upcoming Events" icon={Calendar} tint="sky"
                    value={`${metrics.activeEventsCount}`} sub="Still to happen" />
            </div>

            {/* ── Lower dashboard ─────────────────────────────────────────
                The chart leads because "how are we doing" is why the page gets
                opened; the feed sits beside it because it is read at a glance,
                not studied. Selling now and lead time go underneath: both are
                reference, consulted when a decision is being made. */}
            <div className="grid gap-4 lg:grid-cols-7">
                <div className="lg:col-span-4">
                    <SalesTrendCard trend={data.trend} />
                </div>
                <div className="lg:col-span-3">
                    <RecentActivityCard activity={recentActivity} />
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <SellingNowCard events={data.sellingNow} />
                <LeadTimeCard leadTime={data.leadTime} total={data.leadTotal} />
            </div>
        </div>
    )
}

const TINTS: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600',
    violet: 'bg-violet-500/10 text-violet-600',
    amber: 'bg-amber-500/10 text-amber-600',
    sky: 'bg-sky-500/10 text-sky-600',
}

function StatCard({ label, value, sub, icon: Icon, tint }: {
    label: string
    value: string
    sub: string
    icon: React.ComponentType<{ className?: string }>
    tint: keyof typeof TINTS
}) {
    return (
        <Card className="rounded-2xl">
            <CardContent className="p-5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                    <span className={`grid h-8 w-8 place-items-center rounded-xl ${TINTS[tint]}`}>
                        <Icon className="h-4 w-4" />
                    </span>
                </div>
                <div className="mt-2 font-headline text-2xl font-bold tracking-tight">{value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </CardContent>
        </Card>
    )
}
