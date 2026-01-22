import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Calendar, DollarSign, Users, TrendingUp, Plus } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

async function getOrganizerStats(partnerId: string) {
    const supabase = await createClient()

    // Get all events for this organizer
    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', partnerId)

    // Get completed transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('gross_amount, platform_fee, organizer_payout')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')

    const activeEvents = events?.filter(e => e.status === 'active').length || 0
    const totalTicketsSold = events?.reduce((sum, e) => sum + e.tickets_sold, 0) || 0
    const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.gross_amount), 0) || 0
    const totalEarnings = transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0

    return {
        activeEvents,
        totalEvents: events?.length || 0,
        totalTicketsSold,
        totalRevenue,
        totalEarnings,
    }
}

async function getUpcomingEvents(partnerId: string) {
    const supabase = await createClient()

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', partnerId)
        .eq('status', 'active')
        .gte('start_datetime', new Date().toISOString())
        .order('start_datetime', { ascending: true })
        .limit(5)

    return events || []
}

async function getPendingBalance(partnerId: string) {
    const supabase = await createClient()

    // Get all completed transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('organizer_payout')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')

    const totalEarnings = transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0

    // Get all completed payouts
    const { data: payouts } = await supabase
        .from('payouts')
        .select('amount')
        .eq('partner_id', partnerId)
        .in('status', ['completed', 'processing', 'approved'])

    const totalPayouts = payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return totalEarnings - totalPayouts
}

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

    const stats = await getOrganizerStats(partner.id)
    const upcomingEvents = await getUpcomingEvents(partner.id)
    const pendingBalance = await getPendingBalance(partner.id)

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div>
                <h1 className="text-4xl font-bold mb-2">Welcome back, {partner.business_name}! 👋</h1>
                <p className="text-muted-foreground">Here's what's happening with your events</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Active Events</p>
                            <p className="text-3xl font-bold text-blue-600">{stats.activeEvents}</p>
                        </div>
                        <Calendar className="h-10 w-10 text-blue-500 opacity-80" />
                    </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Tickets Sold</p>
                            <p className="text-3xl font-bold text-green-600">{stats.totalTicketsSold}</p>
                        </div>
                        <Users className="h-10 w-10 text-green-500 opacity-80" />
                    </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                            <p className="text-3xl font-bold text-purple-600">₱{stats.totalRevenue.toLocaleString()}</p>
                        </div>
                        <TrendingUp className="h-10 w-10 text-purple-500 opacity-80" />
                    </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Pending Balance</p>
                            <p className="text-3xl font-bold text-yellow-600">₱{pendingBalance.toLocaleString()}</p>
                        </div>
                        <DollarSign className="h-10 w-10 text-yellow-500 opacity-80" />
                    </div>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4">
                <Link href="/organizer/events/create">
                    <Button size="lg" className="bg-primary hover:bg-primary/90">
                        <Plus className="h-5 w-5 mr-2" />
                        Create New Event
                    </Button>
                </Link>
                {pendingBalance > 0 && (
                    <Link href="/organizer/payouts">
                        <Button size="lg" variant="outline">
                            Request Payout
                        </Button>
                    </Link>
                )}
            </div>

            {/* Upcoming Events */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Upcoming Events</h2>
                    <Link href="/organizer/events">
                        <Button variant="ghost">View All</Button>
                    </Link>
                </div>

                {upcomingEvents.length === 0 ? (
                    <div className="text-center py-12">
                        <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-4">No upcoming events</p>
                        <Link href="/organizer/events/create">
                            <Button>Create Your First Event</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {upcomingEvents.map((event: any) => (
                            <Link key={event.id} href={`/organizer/events/${event.id}`}>
                                <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent transition-colors">
                                    <div className="flex items-center gap-4">
                                        {event.cover_image_url ? (
                                            <img
                                                src={event.cover_image_url}
                                                alt={event.title}
                                                className="w-16 h-16 object-cover rounded"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                                                <Calendar className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-semibold">{event.title}</h3>
                                            <p className="text-sm text-muted-foreground">
                                                {format(new Date(event.start_datetime), 'MMMM d, yyyy • h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Tickets Sold</p>
                                        <p className="text-lg font-bold">{event.tickets_sold} / {event.capacity}</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    )
}
