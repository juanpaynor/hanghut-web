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
        .select('id, custom_percentage, pricing_model, status, pass_fees_to_customer, fixed_fee_per_ticket')
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
    // Get commission rate
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage !== null
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
        .select(`
            checked_in_at,
            status,
            purchase_intent:purchase_intents (
                unit_price
            )
        `, { count: 'exact' })
        .eq('event_id', id)
        .neq('status', 'cancelled')
        .neq('status', 'refunded')
        .neq('status', 'available')

    const totalRevenue = soldTickets?.reduce((sum, ticket: any) => {
        const price = ticket.purchase_intent?.unit_price || 0
        return sum + price
    }, 0) || 0
    const checkedInCount = soldTickets?.filter(t => t.checked_in_at).length || 0

    // Fetch refunded tickets for stats
    const { data: refundedTickets } = await supabase
        .from('tickets')
        .select(`
            purchase_intent:purchase_intents (
                unit_price
            )
        `)
        .eq('event_id', id)
        .eq('status', 'refunded')

    const refundedAmount = refundedTickets?.reduce((sum, ticket: any) => {
        const price = ticket.purchase_intent?.unit_price || 0
        return sum + price
    }, 0) || 0

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
                    refundedAmount,
                    ticketsSold: ticketsSold || 0,
                    totalCapacity: event.capacity || 0,
                    checkedInCount
                }}
                passFeesToCustomer={partner.pass_fees_to_customer || false}
                fixedFeePerTicket={parseFloat(partner.fixed_fee_per_ticket?.toString() || '15.00')}
            />
        </div>
    )
}
