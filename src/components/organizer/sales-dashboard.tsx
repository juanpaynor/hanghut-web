'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts'
import { ArrowUpRight, ArrowDownRight, Ticket, DollarSign, Calendar, Users, TrendingUp, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { TierPieChart } from '@/components/organizer/analytics/tier-pie-chart'
import { TierStat } from '@/lib/organizer/analytics-actions'

interface SalesDashboardProps {
    data: {
        metrics: {
            totalRevenue: number
            netRevenue: number
            totalPlatformFees: number
            totalPaymentFees: number
            totalTicketsSold: number
            totalCapacity: number
            activeEventsCount: number
            avgOrderValue: number
        }
        velocityData: any[]
        paceData: any[]
        currentEventName: string
        benchmarkEventName: string
        activeEvents: any[]
        recentActivity: any[]
    }
}

export function SalesDashboardClient({ data }: SalesDashboardProps) {
    const [chartMode, setChartMode] = useState<'revenue' | 'tickets'>('revenue')
    const { metrics, velocityData, paceData, activeEvents, recentActivity } = data

    // Calculate percent sold
    const percentSold = metrics.totalCapacity > 0
        ? Math.round((metrics.totalTicketsSold / metrics.totalCapacity) * 100)
        : 0

    // Calculate Aggregate Tier Stats from active events
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']
    const tiersMap = new Map<string, number>()

    activeEvents.forEach(event => {
        if (event.ticket_tiers && Array.isArray(event.ticket_tiers)) {
            event.ticket_tiers.forEach((tier: any) => {
                const current = tiersMap.get(tier.name) || 0
                tiersMap.set(tier.name, current + (tier.quantity_sold || 0))
            })
        }
    })

    const aggregatedTierStats: TierStat[] = Array.from(tiersMap.entries())
        .map(([name, value], index) => ({
            name,
            value,
            color: COLORS[index % COLORS.length]
        }))
        .filter(stat => stat.value > 0)
        .sort((a, b) => b.value - a.value)


    return (
        <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₱{metrics.totalRevenue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Before fees
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-primary">Net Earnings</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">₱{metrics.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <p className="text-xs text-muted-foreground flex flex-col gap-0.5 mt-1">
                            <span>- ₱{metrics.totalPlatformFees.toLocaleString()} Platform</span>
                            <span>- ₱{metrics.totalPaymentFees.toLocaleString()} Processing (3%)</span>
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.totalTicketsSold}</div>
                        <div className="flex items-center space-x-2 mt-1">
                            <Progress value={percentSold} className="h-2 w-16" />
                            <p className="text-xs text-muted-foreground">
                                {percentSold}% sold
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₱{metrics.avgOrderValue.toFixed(0)}</div>
                        <p className="text-xs text-muted-foreground">
                            Per transaction
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Events</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.activeEventsCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently live
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-7">
                {/* Main Chart Area */}
                <Card className="col-span-4">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Sales Performance</CardTitle>
                                <CardDescription>
                                    Track your revenue velocity and compare against benchmarks.
                                </CardDescription>
                            </div>
                            <Tabs defaultValue="velocity" className="w-[200px]">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="velocity">Velocity</TabsTrigger>
                                    <TabsTrigger value="pace">Pace</TabsTrigger>
                                </TabsList>
                                <TabsContent value="velocity" className="hidden" />
                                <TabsContent value="pace" className="hidden" />
                            </Tabs>
                        </div>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <Tabs defaultValue="velocity">
                            <TabsContent value="velocity" className="h-[300px]">
                                <div className="flex justify-end mb-4 px-4">
                                    <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-lg">
                                        <Button
                                            variant={chartMode === 'revenue' ? 'secondary' : 'ghost'}
                                            size="sm"
                                            onClick={() => setChartMode('revenue')}
                                            className="h-7 text-xs"
                                        >
                                            Revenue
                                        </Button>
                                        <Button
                                            variant={chartMode === 'tickets' ? 'secondary' : 'ghost'}
                                            size="sm"
                                            onClick={() => setChartMode('tickets')}
                                            className="h-7 text-xs"
                                        >
                                            Tickets
                                        </Button>
                                    </div>
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={velocityData}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="date"
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => chartMode === 'revenue' ? `₱${value}` : `${value}`}
                                        />
                                        <Tooltip
                                            formatter={(value: number) => [
                                                chartMode === 'revenue' ? `₱${value.toLocaleString()}` : value,
                                                chartMode === 'revenue' ? 'Revenue' : 'Tickets'
                                            ]}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey={chartMode}
                                            stroke="#8884d8"
                                            fillOpacity={1}
                                            fill="url(#colorRevenue)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </TabsContent>
                            <TabsContent value="pace" className="h-[300px]">
                                <div className="flex justify-between items-center mb-4 px-4">
                                    <h4 className="text-sm font-semibold">{data.currentEventName} vs. {data.benchmarkEventName}</h4>
                                    <Badge variant="outline">Revenue Comparison</Badge>
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={paceData}>
                                        <XAxis
                                            dataKey="daysOut"
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            label={{ value: 'Days Until Event', position: 'insideBottom', offset: -5 }}
                                            reversed={true}
                                        />
                                        <YAxis
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => `₱${value}`}
                                        />
                                        <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                                        <Line
                                            type="monotone"
                                            dataKey="currentRevenue"
                                            name="Current Event"
                                            stroke="#2563eb"
                                            strokeWidth={3}
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="benchmarkRevenue"
                                            name="Benchmark"
                                            stroke="#94a3b8"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {/* Right Column: Inventory & Recent Activity */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>
                            Latest ticket sales
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {recentActivity.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8">
                                    No recent sales
                                </div>
                            ) : (
                                recentActivity.map((sale) => (
                                    <div key={sale.id} className="flex items-center">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Activity className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="ml-4 space-y-1">
                                            <p className="text-sm font-medium leading-none">
                                                {sale.purchase_intents?.guest_name || 'Guest'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {sale.events?.title} • {sale.purchase_intents?.tier?.name} (x{sale.purchase_intents?.quantity})
                                            </p>
                                        </div>
                                        <div className="ml-auto font-medium text-sm">
                                            +₱{sale.gross_amount}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* NEW: Analytics Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
                <TierPieChart
                    initialData={aggregatedTierStats}
                    title="Tier Breakdown (All Active)"
                    description="Aggregate ticket sales across all active events."
                />

                {/* Live Inventory List (Moved here) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Live Inventory</CardTitle>
                        <CardDescription>Real-time ticket availability for active events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {activeEvents.map((event) => (
                                <div key={event.id} className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none max-w-[150px] truncate">{event.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(event.start_datetime), { addSuffix: true })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>{Math.round((event.tickets_sold / event.capacity) * 100)}%</span>
                                            <Badge variant={event.tickets_sold >= event.capacity ? "destructive" : "secondary"}>
                                                {event.tickets_sold >= event.capacity ? "Sold Out" : "Live"}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Progress
                                            value={(event.tickets_sold / event.capacity) * 100}
                                            className="h-2"
                                        />
                                        {/* Simplified tier view since we have the chart now */}
                                        <div className="text-xs text-muted-foreground flex justify-between">
                                            <span>{event.tickets_sold} sold</span>
                                            <span>{event.capacity} total</span>
                                        </div>
                                    </div>
                                    <div className="border-b last:border-0" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
