import { Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, LayoutDashboard } from 'lucide-react'
import { getDashboardStats } from '@/lib/organizer/dashboard-actions'
import { SalesDashboardClient } from '@/components/organizer/sales-dashboard'
import { OnboardingChecklist } from '@/components/organizer/onboarding-checklist'
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="rounded-2xl p-5">
                        <Skeleton className="h-4 w-24 mb-3" />
                        <Skeleton className="h-8 w-32" />
                    </Card>
                ))}
            </div>
            <Card className="rounded-2xl p-6">
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

    const firstName = partner.business_name?.split(' ')[0] ?? partner.business_name

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Hero header */}
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-6 sm:p-8 text-white shadow-lg">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                        </div>
                        <h1 className="mt-3 font-headline text-2xl sm:text-3xl font-bold tracking-tight">
                            Welcome back, {firstName}
                        </h1>
                        <p className="mt-1 max-w-xl text-sm text-white/80">
                            Here’s how {partner.business_name} is performing, in real time.
                        </p>
                    </div>
                    <Link href="/organizer/events/create" className="shrink-0">
                        <Button className="gap-2 bg-white text-indigo-600 shadow-sm hover:bg-white/90">
                            <Plus className="h-4 w-4" />
                            Create Event
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Onboarding checklist — hides itself once setup is complete */}
            <OnboardingChecklist partnerId={partner.id} kycStatus={partner.kyc_status} />

            {/* Sales Dashboard — streams in via Suspense */}
            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardData partnerId={partner.id} businessName={partner.business_name} />
            </Suspense>
        </div>
    )
}
