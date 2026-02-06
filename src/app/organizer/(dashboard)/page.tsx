import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getDashboardStats } from '@/lib/organizer/dashboard-actions'
import { SalesDashboardClient } from '@/components/organizer/sales-dashboard'

export const dynamic = 'force-dynamic'

export default async function OrganizerDashboard() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (!partner) return null

    // Force redirect to verification if not verified
    // This ensures new signups go straight to KYC
    if (partner.kyc_status !== 'verified') {
        // Optional: specific logic for 'pending_review' vs 'not_started' could go here
        // For now, simple blockade to the verification page
        redirect('/organizer/verification')
    }


    // Fetch granular dashboard stats
    const dashboardData = await getDashboardStats(partner.id)

    if ('error' in dashboardData) {
        return <div>Error loading dashboard</div>
    }

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

            {/* Sales Dashboard (War Room) */}
            <SalesDashboardClient data={dashboardData} />

        </div>
    )
}
