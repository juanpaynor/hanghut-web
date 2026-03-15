import { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
    Users, DollarSign, Calendar, Ticket, Shield, AlertTriangle,
    Cpu, HardDrive, Database, Wifi, Clock, TrendingUp, UserPlus,
    Briefcase, BarChart3, Wallet
} from 'lucide-react'
import { getSupabaseMetrics, getPlatformStats } from '@/lib/admin/admin-monitoring'
import { UserGrowthChart } from '@/components/admin/user-growth-chart'
import { formatDistanceToNow } from 'date-fns'

// ─── Infrastructure Gauge ───────────────────────────────────────────────────

function GaugeCard({
    title, value, max, unit, icon: Icon, formatValue
}: {
    title: string
    value: number
    max?: number
    unit: string
    icon: any
    formatValue?: string
}) {
    const percent = max ? (value / max) * 100 : value
    const color = percent >= 90 ? 'text-red-500' : percent >= 70 ? 'text-amber-500' : 'text-emerald-500'
    const bgColor = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
    const bgLight = percent >= 90 ? 'bg-red-50' : percent >= 70 ? 'bg-amber-50' : 'bg-emerald-50'

    return (
        <Card className={`${bgLight} border-0 shadow-sm`}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</span>
                    </div>
                    {max && (
                        <span className="text-[10px] text-slate-400">{Math.round(value)}/{max}</span>
                    )}
                </div>
                <div className={`text-2xl font-bold ${color}`}>
                    {formatValue || `${Math.round(percent)}${unit}`}
                </div>
                <div className="mt-2 h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${bgColor} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
    title, value, subtitle, icon: Icon, color, href
}: {
    title: string
    value: string | number
    subtitle?: string
    icon: any
    color: string
    href?: string
}) {
    const card = (
        <Card className={`bg-white border-0 shadow-sm ${href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{title}</p>
                        <p className="text-2xl font-bold text-slate-900">{value}</p>
                        {subtitle && (
                            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
                        )}
                    </div>
                    <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center`}>
                        <Icon className="h-5 w-5 text-white" />
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    return href ? <Link href={href}>{card}</Link> : card
}

// ─── Infrastructure Section ─────────────────────────────────────────────────

async function InfrastructureMonitor() {
    const metrics = await getSupabaseMetrics()

    if (!metrics.available) {
        return (
            <Card className="bg-slate-50 border-dashed border-slate-300">
                <CardContent className="p-6 text-center">
                    <Wifi className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Infrastructure metrics unavailable</p>
                    <p className="text-xs text-slate-400 mt-1">Check SUPABASE_SERVICE_ROLE_KEY is configured</p>
                </CardContent>
            </Card>
        )
    }

    const uptimeDisplay = metrics.uptimeSeconds > 86400
        ? `${Math.floor(metrics.uptimeSeconds / 86400)}d ${Math.floor((metrics.uptimeSeconds % 86400) / 3600)}h`
        : `${Math.floor(metrics.uptimeSeconds / 3600)}h ${Math.floor((metrics.uptimeSeconds % 3600) / 60)}m`

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GaugeCard
                title="CPU"
                value={metrics.cpuPercent}
                unit="%"
                icon={Cpu}
            />
            <GaugeCard
                title="RAM"
                value={metrics.ramUsedMB}
                max={metrics.ramTotalMB}
                unit="%"
                icon={BarChart3}
                formatValue={`${metrics.ramPercent}%`}
            />
            <GaugeCard
                title="Disk"
                value={metrics.diskUsedGB}
                max={metrics.diskTotalGB}
                unit="%"
                icon={HardDrive}
                formatValue={`${metrics.diskUsedGB}/${metrics.diskTotalGB} GB`}
            />
            <GaugeCard
                title="Connections"
                value={metrics.activeConnections}
                max={metrics.maxConnections}
                unit=""
                icon={Database}
                formatValue={`${metrics.activeConnections}`}
            />
        </div>
    )
}

// ─── Platform Stats Section ─────────────────────────────────────────────────

async function PlatformDashboard() {
    const { stats, signupTrend, recentUsers } = await getPlatformStats()

    return (
        <>
            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Users"
                    value={stats.totalUsers.toLocaleString()}
                    subtitle={`+${stats.signupsToday} today · +${stats.signupsThisWeek} this week`}
                    icon={Users}
                    color="bg-indigo-500"
                    href="/admin/users"
                />
                <StatCard
                    title="Active Partners"
                    value={stats.activePartners}
                    subtitle={stats.pendingVerifications > 0 ? `${stats.pendingVerifications} pending verification` : 'All verified'}
                    icon={Briefcase}
                    color="bg-violet-500"
                    href="/admin/partners"
                />
                <StatCard
                    title="Revenue"
                    value={`₱${stats.totalRevenue.toLocaleString()}`}
                    subtitle={`₱${stats.revenueToday.toLocaleString()} today`}
                    icon={DollarSign}
                    color="bg-emerald-500"
                    href="/admin/accounting"
                />
                <StatCard
                    title="Active Events"
                    value={stats.activeEvents}
                    subtitle={`${stats.totalTicketsSold.toLocaleString()} tickets sold total`}
                    icon={Calendar}
                    color="bg-blue-500"
                    href="/admin/events"
                />
            </div>

            {/* Action Items Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Tickets Sold Today"
                    value={stats.ticketsSoldToday}
                    icon={Ticket}
                    color="bg-cyan-500"
                />
                <StatCard
                    title="Signups Today"
                    value={stats.signupsToday}
                    icon={UserPlus}
                    color="bg-pink-500"
                />
                <StatCard
                    title="Pending Reports"
                    value={stats.pendingReports}
                    icon={AlertTriangle}
                    color={stats.pendingReports > 0 ? 'bg-red-500' : 'bg-slate-400'}
                    href="/admin/reports"
                />
                <StatCard
                    title="Pending Payouts"
                    value={stats.pendingPayouts}
                    icon={Wallet}
                    color={stats.pendingPayouts > 0 ? 'bg-amber-500' : 'bg-slate-400'}
                    href="/admin/accounting/payouts"
                />
            </div>

            {/* Bottom Row: Chart + Recent Users */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* User Growth Chart */}
                <Card className="lg:col-span-2 bg-white border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-indigo-500" />
                            User Growth — Last 30 Days
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <UserGrowthChart data={signupTrend} />
                    </CardContent>
                </Card>

                {/* Recent Signups */}
                <Card className="bg-white border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-pink-500" />
                            Recent Signups
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="space-y-1">
                            {recentUsers.map((user) => (
                                <Link
                                    key={user.id}
                                    href={`/admin/users/${user.id}`}
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600 shrink-0">
                                        {user.display_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                            {user.display_name}
                                        </p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

// ─── Skeletons ──────────────────────────────────────────────────────────────

function InfraSkeleton() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="bg-slate-50 border-0">
                    <CardContent className="p-5 space-y-3">
                        <Skeleton className="h-3 w-16 bg-slate-200" />
                        <Skeleton className="h-7 w-20 bg-slate-200" />
                        <Skeleton className="h-1.5 w-full bg-slate-200 rounded-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function PlatformSkeleton() {
    return (
        <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="bg-white border-0 shadow-sm">
                        <CardContent className="p-5 space-y-3">
                            <Skeleton className="h-3 w-20 bg-slate-100" />
                            <Skeleton className="h-7 w-24 bg-slate-100" />
                            <Skeleton className="h-3 w-32 bg-slate-100" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="bg-white border-0 shadow-sm">
                        <CardContent className="p-5 space-y-3">
                            <Skeleton className="h-3 w-20 bg-slate-100" />
                            <Skeleton className="h-7 w-16 bg-slate-100" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-white border-0 shadow-sm">
                    <CardContent className="p-6">
                        <Skeleton className="h-[280px] w-full bg-slate-100 rounded-lg" />
                    </CardContent>
                </Card>
                <Card className="bg-white border-0 shadow-sm">
                    <CardContent className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton className="h-8 w-8 rounded-full bg-slate-100" />
                                <div className="space-y-1 flex-1">
                                    <Skeleton className="h-3 w-24 bg-slate-100" />
                                    <Skeleton className="h-2 w-16 bg-slate-100" />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                        <p className="text-slate-500 text-sm mt-1">HangHut Command Center</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/admin/reports">
                            <Button variant="outline" size="sm" className="text-slate-600">
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Reports
                            </Button>
                        </Link>
                        <Link href="/admin/users">
                            <Button variant="outline" size="sm" className="text-slate-600">
                                <Users className="h-4 w-4 mr-2" />
                                Users
                            </Button>
                        </Link>
                        <Link href="/admin/verifications">
                            <Button variant="outline" size="sm" className="text-slate-600">
                                <Shield className="h-4 w-4 mr-2" />
                                KYC
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Infrastructure */}
                <div>
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Cpu className="h-3.5 w-3.5" />
                        Infrastructure
                    </h2>
                    <Suspense fallback={<InfraSkeleton />}>
                        <InfrastructureMonitor />
                    </Suspense>
                </div>

                {/* Platform Stats */}
                <div className="space-y-6">
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Platform Overview
                    </h2>
                    <Suspense fallback={<PlatformSkeleton />}>
                        <PlatformDashboard />
                    </Suspense>
                </div>
            </div>
        </div>
    )
}
