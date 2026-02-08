import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventDashboardTabs } from '@/components/organizer/event-dashboard-tabs'

interface EditEventPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function EditEventPage({ params }: EditEventPageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, custom_percentage, pricing_model, status')
        .eq('user_id', user.id)
        .single()

    if (!partner || partner.status !== 'approved') {
        redirect('/organizer')
    }

    // Fetch event details
    const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) {
        notFound()
    }

    // Fetch ticket tiers
    const { data: tiers } = await supabase
        .from('ticket_tiers')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true })

    // Get commission rate
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage
        ? partner.custom_percentage / 100
        : 0.15

    // Fetch attendees
    const { getEventAttendees } = await import('@/lib/organizer/attendee-actions')
    const { attendees } = await getEventAttendees(id)

    // Fetch promo codes
    const { getPromoCodes } = await import('@/lib/organizer/promo-actions')
    const { data: promoCodes } = await getPromoCodes(id)

    // Fetch ticket stats
    const { count: ticketsSold, data: soldTickets } = await supabase
        .from('tickets')
        .select('price_paid, checked_in_at, status')
        .eq('event_id', id)
        .neq('status', 'cancelled')
        .neq('status', 'refunded')

    const totalRevenue = soldTickets?.reduce((sum, ticket) => sum + (ticket.price_paid || 0), 0) || 0
    const checkedInCount = soldTickets?.filter(t => t.checked_in_at).length || 0

    return (
        <div className="p-8 pb-20">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">{event.title}</h1>
                <p className="text-muted-foreground">Manage your event, view stats, and edit details.</p>
            </div>

            <EventDashboardTabs
                partnerId={partner.id}
                commissionRate={commissionRate}
                event={event}
                eventId={event.id}
                tiers={tiers || []}
                initialAttendees={attendees}
                promoCodes={promoCodes || []}
                stats={{
                    totalRevenue,
                    ticketsSold: ticketsSold || 0,
                    totalCapacity: event.capacity || 0,
                    checkedInCount
                }}
            />
        </div>
    )
}
