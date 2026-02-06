'use client'

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getTierStats, TierStat } from '@/lib/organizer/analytics-actions'
import { Loader2 } from 'lucide-react'

interface TierPieChartProps {
    eventId?: string
    initialData?: TierStat[]
    title?: string
    description?: string
}

export function TierPieChart({
    eventId,
    initialData,
    title = "Ticket Sales by Tier",
    description = "Distribution of tickets sold across different tiers."
}: TierPieChartProps) {
    const [data, setData] = useState<TierStat[]>(initialData || [])
    const [loading, setLoading] = useState(!initialData && !!eventId)

    useEffect(() => {
        if (!eventId || initialData) return

        async function loadData() {
            setLoading(true)
            const result = await getTierStats(eventId!)
            if (result.data) {
                setData(result.data)
            }
            setLoading(false)
        }
        loadData()
    }, [eventId, initialData])

    // If initialData updates
    useEffect(() => {
        if (initialData) {
            setData(initialData)
            setLoading(false)
        }
    }, [initialData])

    return (
        <Card className="col-span-1 min-h-[400px]">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No sales data available yet.
                    </div>
                ) : (
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color || '#8884d8'} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => [`${value} tickets`, 'Sales']}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
