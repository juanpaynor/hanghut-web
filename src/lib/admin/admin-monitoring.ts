'use server'

import { createClient } from '@/lib/supabase/server'
import { subDays, format } from 'date-fns'

// ─── Supabase Infrastructure Metrics ────────────────────────────────────────

interface InfraMetrics {
    cpuPercent: number
    ramPercent: number
    ramUsedMB: number
    ramTotalMB: number
    diskUsedGB: number
    diskTotalGB: number
    diskPercent: number
    activeConnections: number
    maxConnections: number
    uptimeSeconds: number
    available: boolean
}

function parsePrometheusValue(text: string, metricName: string): number {
    // Find lines matching the metric name (not comments)
    const lines = text.split('\n')
    for (const line of lines) {
        if (line.startsWith('#')) continue
        if (line.startsWith(metricName)) {
            const parts = line.split(/\s+/)
            const value = parseFloat(parts[parts.length - 1])
            if (!isNaN(value)) return value
        }
    }
    return 0
}

function parsePrometheusWithLabel(text: string, metricName: string, label: string, labelValue: string): number {
    const lines = text.split('\n')
    for (const line of lines) {
        if (line.startsWith('#')) continue
        if (line.startsWith(metricName) && line.includes(`${label}="${labelValue}"`)) {
            const parts = line.split(/\s+/)
            const value = parseFloat(parts[parts.length - 1])
            if (!isNaN(value)) return value
        }
    }
    return 0
}

export async function getSupabaseMetrics(): Promise<InfraMetrics> {
    const projectRef = process.env.SUPABASE_PROJECT_REF || 'rahhezqtkpvkialnduft'
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
        return {
            cpuPercent: 0, ramPercent: 0, ramUsedMB: 0, ramTotalMB: 0,
            diskUsedGB: 0, diskTotalGB: 0, diskPercent: 0,
            activeConnections: 0, maxConnections: 0, uptimeSeconds: 0,
            available: false,
        }
    }

    try {
        const credentials = Buffer.from(`service_role:${serviceRoleKey}`).toString('base64')
        const res = await fetch(
            `https://${projectRef}.supabase.co/customer/v1/privileged/metrics`,
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                },
                next: { revalidate: 30 }, // Cache for 30 seconds
            }
        )

        if (!res.ok) {
            console.error('[Metrics] Failed to fetch:', res.status, res.statusText)
            return {
                cpuPercent: 0, ramPercent: 0, ramUsedMB: 0, ramTotalMB: 0,
                diskUsedGB: 0, diskTotalGB: 0, diskPercent: 0,
                activeConnections: 0, maxConnections: 0, uptimeSeconds: 0,
                available: false,
            }
        }

        const text = await res.text()

        // Parse Prometheus metrics
        const cpuSecondsTotal = parsePrometheusValue(text, 'node_cpu_seconds_total')
        const cpuIdle = parsePrometheusWithLabel(text, 'node_cpu_seconds_total', 'mode', 'idle')

        // Memory
        const memTotal = parsePrometheusValue(text, 'node_memory_MemTotal_bytes')
        const memAvailable = parsePrometheusValue(text, 'node_memory_MemAvailable_bytes')
        const memFree = parsePrometheusValue(text, 'node_memory_MemFree_bytes')
        const memUsed = memTotal - (memAvailable || memFree)
        const ramPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0

        // Disk
        const fsSize = parsePrometheusWithLabel(text, 'node_filesystem_size_bytes', 'mountpoint', '/')
            || parsePrometheusValue(text, 'node_filesystem_size_bytes')
        const fsFree = parsePrometheusWithLabel(text, 'node_filesystem_free_bytes', 'mountpoint', '/')
            || parsePrometheusValue(text, 'node_filesystem_free_bytes')
        const fsUsed = fsSize - fsFree
        const diskPercent = fsSize > 0 ? (fsUsed / fsSize) * 100 : 0

        // Postgres connections
        const activeConnections = parsePrometheusValue(text, 'pg_stat_activity_count')
            || parsePrometheusValue(text, 'pg_stat_database_numbackends')
        const maxConnections = parsePrometheusValue(text, 'pg_settings_max_connections')
            || 100

        // Uptime
        const bootTime = parsePrometheusValue(text, 'node_boot_time_seconds')
        const uptimeSeconds = bootTime > 0 ? Math.floor(Date.now() / 1000 - bootTime) : 0

        // CPU - approximate from load average if direct CPU isn't available
        const loadAvg1 = parsePrometheusValue(text, 'node_load1')
        // For a 2-core instance, load of 2 = 100%
        const cpuPercent = loadAvg1 > 0 ? Math.min(loadAvg1 * 50, 100) : 0

        return {
            cpuPercent: Math.round(cpuPercent * 10) / 10,
            ramPercent: Math.round(ramPercent * 10) / 10,
            ramUsedMB: Math.round(memUsed / 1024 / 1024),
            ramTotalMB: Math.round(memTotal / 1024 / 1024),
            diskUsedGB: Math.round(fsUsed / 1024 / 1024 / 1024 * 10) / 10,
            diskTotalGB: Math.round(fsSize / 1024 / 1024 / 1024 * 10) / 10,
            diskPercent: Math.round(diskPercent * 10) / 10,
            activeConnections: Math.round(activeConnections),
            maxConnections: Math.round(maxConnections),
            uptimeSeconds,
            available: true,
        }
    } catch (error) {
        console.error('[Metrics] Error:', error)
        return {
            cpuPercent: 0, ramPercent: 0, ramUsedMB: 0, ramTotalMB: 0,
            diskUsedGB: 0, diskTotalGB: 0, diskPercent: 0,
            activeConnections: 0, maxConnections: 0, uptimeSeconds: 0,
            available: false,
        }
    }
}

// ─── Platform Stats ─────────────────────────────────────────────────────────

export interface PlatformStats {
    totalUsers: number
    signupsToday: number
    signupsThisWeek: number
    activePartners: number
    pendingVerifications: number
    totalRevenue: number
    revenueToday: number
    activeEvents: number
    ticketsSoldToday: number
    totalTicketsSold: number
    pendingReports: number
    pendingPayouts: number
}

export interface SignupTrend {
    date: string
    count: number
}

export interface RecentUser {
    id: string
    display_name: string
    email: string
    created_at: string
    avatar_url: string | null
}

export async function getPlatformStats(): Promise<{
    stats: PlatformStats
    signupTrend: SignupTrend[]
    recentUsers: RecentUser[]
}> {
    const supabase = await createClient()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 7)
    const weekISO = weekStart.toISOString()

    const [
        { count: totalUsers },
        { count: signupsToday },
        { count: signupsThisWeek },
        { count: activePartners },
        { count: pendingVerifications },
        { data: allTimeRevenue },
        { data: todayRevenue },
        { count: activeEvents },
        { count: ticketsSoldToday },
        { count: totalTicketsSold },
        { count: pendingReports },
        { count: pendingPayouts },
        { data: recentUsers },
    ] = await Promise.all([
        // Total users
        supabase.from('users').select('*', { count: 'exact', head: true }),
        // Signups today
        supabase.from('users').select('*', { count: 'exact', head: true })
            .gte('created_at', todayISO),
        // Signups this week
        supabase.from('users').select('*', { count: 'exact', head: true })
            .gte('created_at', weekISO),
        // Active partners
        supabase.from('partners').select('*', { count: 'exact', head: true })
            .eq('kyc_status', 'verified'),
        // Pending verifications
        supabase.from('partners').select('*', { count: 'exact', head: true })
            .eq('kyc_status', 'pending_review'),
        // All-time revenue
        supabase.from('transactions').select('gross_amount')
            .eq('status', 'completed'),
        // Today revenue
        supabase.from('transactions').select('gross_amount')
            .eq('status', 'completed')
            .gte('created_at', todayISO),
        // Active events
        supabase.from('events').select('*', { count: 'exact', head: true })
            .eq('status', 'active'),
        // Tickets sold today
        supabase.from('tickets').select('*', { count: 'exact', head: true })
            .gte('created_at', todayISO)
            .not('status', 'in', '("available","cancelled","refunded")'),
        // Total tickets sold
        supabase.from('tickets').select('*', { count: 'exact', head: true })
            .not('status', 'in', '("available","cancelled","refunded")'),
        // Pending reports
        supabase.from('reports').select('*', { count: 'exact', head: true })
            .eq('status', 'pending'),
        // Pending payouts
        supabase.from('payouts').select('*', { count: 'exact', head: true })
            .eq('status', 'pending_request'),
        // Recent users
        supabase.from('users')
            .select('id, display_name, email, created_at, avatar_url')
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    // 30-day signup trend
    const signupTrend: SignupTrend[] = []
    for (let i = 29; i >= 0; i--) {
        const date = subDays(new Date(), i)
        const dateStr = format(date, 'yyyy-MM-dd')
        const dayStart = new Date(date)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(date)
        dayEnd.setHours(23, 59, 59, 999)

        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', dayStart.toISOString())
            .lte('created_at', dayEnd.toISOString())

        signupTrend.push({ date: format(date, 'MMM dd'), count: count || 0 })
    }

    const totalRevenue = allTimeRevenue?.reduce((sum, t) => sum + Number(t.gross_amount), 0) || 0
    const revenueToday = todayRevenue?.reduce((sum, t) => sum + Number(t.gross_amount), 0) || 0

    return {
        stats: {
            totalUsers: totalUsers || 0,
            signupsToday: signupsToday || 0,
            signupsThisWeek: signupsThisWeek || 0,
            activePartners: activePartners || 0,
            pendingVerifications: pendingVerifications || 0,
            totalRevenue,
            revenueToday,
            activeEvents: activeEvents || 0,
            ticketsSoldToday: ticketsSoldToday || 0,
            totalTicketsSold: totalTicketsSold || 0,
            pendingReports: pendingReports || 0,
            pendingPayouts: pendingPayouts || 0,
        },
        signupTrend,
        recentUsers: (recentUsers || []) as RecentUser[],
    }
}
