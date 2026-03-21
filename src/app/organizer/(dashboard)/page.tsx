import { Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getDashboardStats } from '@/lib/organizer/dashboard-actions'
import { SalesDashboardClient } from '@/components/organizer/sales-dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { getAuthUser, getPartner } from '@/lib/auth/cached'

export const dynamic = 'force-dynamic'

// Async component that fetches data — wrapped in Suspense below
async function DashboardData({ partnerId, businessName }: { partnerId: string; businessName: string }) {
    const dashboardData = await getDashboardStats(partnerId)

    if ('error' in dashboardData) {
        return <div>Error loading dashboard</div>
    }

    return <SalesDashboardClient data={dashboardData} />
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-6">
                        <Skeleton className="h-4 w-24 mb-3" />
                        <Skeleton className="h-8 w-32" />
                    </Card>
                ))}
            </div>
            <Card className="p-6">
                <Skeleton className="h-[300px] w-full rounded-lg" />
            </Card>
        </div>
    )
}

export default async function OrganizerDashboard() {
    // Cached — layout already called these, so they return instantly
    const { user } = await getAuthUser()
    if (!user) return null

    const partner = await getPartner(user.id)
    if (!partner) return null

    // KYC gate temporarily removed for smooth partner onboarding
    // if (partner.kyc_status !== 'verified') {
    //     redirect('/organizer/verification')
    // }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Real-time overview for {partner.business_name}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link href="/organizer/events/create">
                        <Button className="bg-primary hover:bg-primary/90">
                            <Plus className="h-4 w-4 mr-2" />
                            Create Event
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Sales Dashboard — streams in via Suspense */}
            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardData partnerId={partner.id} businessName={partner.business_name} />
            </Suspense>
        </div>
    )
}
