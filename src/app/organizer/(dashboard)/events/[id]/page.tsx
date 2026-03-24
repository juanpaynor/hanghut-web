import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventDashboardTabs } from '@/components/organizer/event-dashboard-tabs'
import { getAuthUser, getPartner } from '@/lib/auth/cached'

interface EditEventPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function EditEventPage({ params }: EditEventPageProps) {
    const { id } = await params

    // Cached — layout already resolved these
    const { user } = await getAuthUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const partner = await getPartner(user.id)
    if (!partner) {
        redirect('/organizer')
    }

    const supabase = await createClient()

    // Fetch event (needed before parallel queries for the organizer_id check)
    const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) {
        notFound()
    }

    // Fetch partner pricing details (only the fields we need, not already in cached partner)
    const { data: partnerPricing } = await supabase
        .from('partners')
        .select('custom_percentage, pricing_model, pass_fees_to_customer, fixed_fee_per_ticket')
        .eq('id', partner.id)
        .single()

    // ─── PARALLEL: All event-dependent queries at once ─────────────────
    const { getEventAttendees } = await import('@/lib/organizer/attendee-actions')
    const { getPromoCodes } = await import('@/lib/organizer/promo-actions')

    const [
        { data: rawTiers },
        { data: tierTickets },
        { attendees },
        { data: promoCodes },
        { count: ticketsSold, data: soldTickets },
        { data: refundedTickets }
    ] = await Promise.all([
        // 1. Ticket tiers
        supabase
            .from('ticket_tiers')
            .select('*')
            .eq('event_id', id)
            .order('sort_order', { ascending: true }),

        // 2. Per-tier sold counts
        supabase
            .from('tickets')
            .select('tier_id')
            .eq('event_id', id)
            .not('status', 'in', '("available","refunded")'),

        // 3. Attendees
        getEventAttendees(id),

        // 4. Promo codes
        getPromoCodes(id),

        // 5. Sold tickets stats
        supabase
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
            .neq('status', 'available'),

        // 6. Refunded tickets stats
        supabase
            .from('tickets')
            .select(`
                purchase_intent:purchase_intents (
                    unit_price
                )
            `)
            .eq('event_id', id)
            .eq('status', 'refunded')
    ])

    // ─── COMPUTE from parallel results ────────────────────────────────

    const tierCountMap = new Map<string, number>()
    tierTickets?.forEach((t: any) => {
        if (t.tier_id) {
            tierCountMap.set(t.tier_id, (tierCountMap.get(t.tier_id) || 0) + 1)
        }
    })

    const tiers = (rawTiers || []).map(tier => ({
        ...tier,
        quantity_sold: tierCountMap.get(tier.id) ?? tier.quantity_sold ?? 0
    }))

    const commissionRate = partnerPricing?.pricing_model === 'custom' && partnerPricing?.custom_percentage !== null
        ? partnerPricing.custom_percentage / 100
        : 0.15

    const totalRevenue = soldTickets?.reduce((sum, ticket: any) => {
        const price = ticket.purchase_intent?.unit_price || 0
        return sum + price
    }, 0) || 0
    const checkedInCount = soldTickets?.filter(t => t.checked_in_at).length || 0

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
                passFeesToCustomer={partnerPricing?.pass_fees_to_customer || false}
                fixedFeePerTicket={parseFloat(partnerPricing?.fixed_fee_per_ticket?.toString() || '15.00')}
            />
        </div>
    )
}
