'use client'

import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Users, UserCheck, Clock, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CheckInStatsProps {
    eventId: string
}

interface TierStats {
    tier_name: string
    total: number
    checked_in: number
}

export function CheckInStats({ eventId }: CheckInStatsProps) {
    const [stats, setStats] = useState({
        total: 0,
        checkedIn: 0,
        pending: 0,
        tierBreakdown: [] as TierStats[]
    })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        loadStats()

        // Refresh every 30 seconds for live updates
        const interval = setInterval(loadStats, 30000)
        return () => clearInterval(interval)
    }, [eventId])

    async function loadStats(isRefresh = false) {
        if (isRefresh) setRefreshing(true)

        try {
            // Get total tickets sold (All valid tickets including used)
            const { count: totalCount } = await supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', eventId)
                .neq('status', 'cancelled')
                .neq('status', 'refunded')

            // Get checked in count
            const { count: checkedInCount } = await supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', eventId)
                .not('checked_in_at', 'is', null)

            // Get tier breakdown
            const { data: tierData } = await supabase
                .from('tickets')
                .select(`
                    tier:tier_id (
                        name
                    ),
                    status,
                    checked_in_at
                `)
                .eq('event_id', eventId)
                .neq('status', 'cancelled')
                .neq('status', 'refunded')

            // Aggregate tier stats
            const tierMap = new Map<string, { total: number, checked_in: number }>()

            tierData?.forEach((ticket: any) => {
                const tierName = ticket.tier?.name || 'General Admission'
                if (!tierMap.has(tierName)) {
                    tierMap.set(tierName, { total: 0, checked_in: 0 })
                }
                const tier = tierMap.get(tierName)!
                tier.total++
                if (ticket.checked_in_at) {
                    tier.checked_in++
                }
            })

            const tierBreakdown = Array.from(tierMap.entries()).map(([name, stats]) => ({
                tier_name: name,
                total: stats.total,
                checked_in: stats.checked_in
            }))

            setStats({
                total: totalCount || 0,
                checkedIn: checkedInCount || 0,
                pending: (totalCount || 0) - (checkedInCount || 0),
                tierBreakdown
            })
        } catch (error) {
            console.error('Failed to load check-in stats:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const checkInPercentage = stats.total > 0 ? (stats.checkedIn / stats.total) * 100 : 0

    if (loading) {
        return <div className="flex items-center justify-center py-12">Loading statistics...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadStats(true)}
                    disabled={refreshing}
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh Stats
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                            <Users className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total Tickets</p>
                            <p className="text-2xl font-bold">{stats.total}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-500/10 rounded-lg">
                            <UserCheck className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Checked In</p>
                            <p className="text-2xl font-bold">{stats.checkedIn}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/10 rounded-lg">
                            <Clock className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Pending Entry</p>
                            <p className="text-2xl font-bold">{stats.pending}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Overall Progress */}
            <Card className="p-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold">Overall Check-In Progress</h3>
                            <p className="text-sm text-muted-foreground">Live attendance tracking</p>
                        </div>
                        <Badge variant="secondary" className="text-lg px-3 py-1">
                            {checkInPercentage.toFixed(1)}%
                        </Badge>
                    </div>
                    <Progress value={checkInPercentage} className="h-3" />
                    <p className="text-sm text-muted-foreground">
                        {stats.checkedIn} of {stats.total} attendees have entered
                    </p>
                </div>
            </Card>

            {/* Tier Breakdown */}
            <Card className="p-6">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Check-In by Tier</h3>
                    </div>

                    <div className="space-y-4">
                        {stats.tierBreakdown.map((tier) => {
                            const tierPercentage = tier.total > 0 ? (tier.checked_in / tier.total) * 100 : 0
                            return (
                                <div key={tier.tier_name} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{tier.tier_name}</span>
                                            <Badge variant="outline" className="text-xs">
                                                {tier.checked_in} / {tier.total}
                                            </Badge>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {tierPercentage.toFixed(0)}%
                                        </span>
                                    </div>
                                    <Progress value={tierPercentage} className="h-2" />
                                </div>
                            )
                        })}
                    </div>

                    {stats.tierBreakdown.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                            No ticket data available
                        </p>
                    )}
                </div>
            </Card>
        </div>
    )
}
