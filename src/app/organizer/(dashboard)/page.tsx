import { Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getDashboardStats, getDashboardFocus } from '@/lib/organizer/dashboard-actions'
import { DashboardFocusPanel } from '@/components/organizer/dashboard-focus'
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

async function FocusData({ partnerId, businessName }: { partnerId: string; businessName: string }) {
    const focus = await getDashboardFocus(partnerId)
    return <DashboardFocusPanel focus={focus} businessName={businessName} />
}

function FocusSkeleton() {
    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-48 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-48 rounded-2xl" />
        </div>
    )
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
            {/* A page header, not a banner. The old gradient hero occupied the top
                of the viewport to say "Welcome back" and nothing else; that space
                now belongs to the next show. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="font-headline text-2xl font-bold tracking-tight">{firstName}</h1>
                    <p className="text-sm text-muted-foreground">{partner.business_name}</p>
                </div>
                <Link href="/organizer/events/create">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create event
                    </Button>
                </Link>
            </div>

            <Suspense fallback={<FocusSkeleton />}>
                <FocusData partnerId={partner.id} businessName={partner.business_name} />
            </Suspense>

            {/* Onboarding checklist — hides itself once setup is complete */}
            <OnboardingChecklist partnerId={partner.id} kycStatus={partner.kyc_status} />

            {/* Sales Dashboard — streams in via Suspense */}
            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardData partnerId={partner.id} businessName={partner.business_name} />
            </Suspense>
        </div>
    )
}
