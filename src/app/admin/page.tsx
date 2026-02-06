import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Users, CheckCircle, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

async function DashboardStats() {
    const supabase = await createClient()

    // Fetch stats
    const [
        { count: totalReports },
        { count: pendingReports },
        { count: resolvedToday },
        { count: totalUsers }
    ] = await Promise.all([
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase.from('users').select('*', { count: 'exact', head: true })
    ])

    const stats = [
        {
            title: 'Total Reports',
            value: totalReports || 0,
            icon: AlertTriangle,
            color: 'text-orange-500',
        },
        {
            title: 'Pending Reports',
            value: pendingReports || 0,
            icon: Clock,
            color: 'text-yellow-500',
        },
        {
            title: 'Resolved Today',
            value: resolvedToday || 0,
            icon: CheckCircle,
            color: 'text-green-500',
        },
        {
            title: 'Total Users',
            value: totalUsers || 0,
            icon: Users,
            color: 'text-blue-500',
        },
    ]

    return (
        <>
            {stats.map((stat) => {
                const Icon = stat.icon
                return (
                    <Card key={stat.title} className="bg-card border-border">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <Icon className={`h-5 w-5 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                        </CardContent>
                    </Card>
                )
            })}
        </>
    )
}

function StatsSkeleton() {
    return (
        <>
            {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="bg-card border-border">
                    <CardHeader className="pb-2">
                        <Skeleton className="h-4 w-24 bg-muted" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16 bg-muted" />
                    </CardContent>
                </Card>
            ))}
        </>
    )
}

export default function AdminPage() {
    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
                    <p className="text-muted-foreground">Welcome to the HangHut admin control panel</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Suspense fallback={<StatsSkeleton />}>
                        <DashboardStats />
                    </Suspense>
                </div>

                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                        <Link href="/admin/reports">
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                View Reports
                            </Button>
                        </Link>
                        <Link href="/admin/users">
                            <Button variant="outline" className="border-border hover:bg-muted">
                                Manage Users
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
