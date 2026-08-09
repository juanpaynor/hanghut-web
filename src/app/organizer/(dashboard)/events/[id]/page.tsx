import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventDashboardTabs } from '@/components/organizer/event-dashboard-tabs'
import { resolvePlatformPct, resolveFixedFee } from '@/lib/payment/platform-fees'
import { getAuthUser, getPartner } from '@/lib/auth/cached'

export const dynamic = 'force-dynamic'

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

    // ─── PARALLEL: partner pricing + all event-dependent queries in ONE round-trip ─────
    // (partnerPricing was a separate await; folded in here. Analytics/customers/email
    // are no longer fetched here — they load lazily when the Analytics tab is opened.)
    const { getEventAttendees } = await import('@/lib/organizer/attendee-actions')
    const { getPromoCodes } = await import('@/lib/organizer/promo-actions')
    const { getRegistrationQuestions } = await import('@/lib/organizer/registration-actions')
    const { getEventRegistrations } = await import('@/lib/organizer/registration-management-actions')

    const [
        { data: partnerPricing },
        { data: rawTiers },
        { data: tierTickets },
        { attendees },
        { data: promoCodes },
        { data: statsRows },
        registrationQuestions,
        initialRegistrations,
        { data: rawSubscriptionTiers },
        { data: rawExistingDiscounts },
    ] = await Promise.all([
        // Partner pricing (fields not already on the cached partner)
        supabase
            .from('partners')
            .select('custom_percentage, pricing_model, pass_fixed_to_customer, pass_percentage_to_customer, fixed_fee_per_ticket')
            .eq('id', partner.id)
            .single(),

        // Ticket tiers
        supabase
            .from('ticket_tiers')
            .select('*')
            .eq('event_id', id)
            .order('sort_order', { ascending: true }),

        // Per-tier sold counts
        supabase
            .from('tickets')
            .select('tier_id')
            .eq('event_id', id)
            .not('status', 'in', '("available","refunded","reserved")'),

        // Attendees
        getEventAttendees(id),

        // Promo codes
        getPromoCodes(id),

        // Ticket stats (sold / checked-in / revenue / refunded) — one aggregate RPC
        // instead of fetching every ticket row (+ intent join) and summing in JS.
        supabase.rpc('get_event_ticket_stats', { p_event_id: id }),

        // Registration questions
        getRegistrationQuestions(id),

        // Registration requests
        getEventRegistrations(id),

        // Partner's subscription tiers (for subscriber discounts section)
        supabase
            .from('subscription_tiers')
            .select('id, name, price_monthly, is_active')
            .eq('partner_id', partner.id)
            .order('price_monthly', { ascending: true }),

        // Existing subscriber discounts for this event
        supabase
            .from('event_subscription_discounts')
            .select('subscription_tier_id, discount_type, discount_value, max_tickets')
            .eq('event_id', id),
    ])

    const stats = statsRows?.[0] ?? { sold_count: 0, checked_in_count: 0, gross_revenue: 0, refunded_amount: 0 }
    const ticketsSold = Number(stats.sold_count) || 0
    const checkedInCount = Number(stats.checked_in_count) || 0
    const totalRevenue = Number(stats.gross_revenue) || 0
    const refundedAmount = Number(stats.refunded_amount) || 0

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

    const commissionRate = resolvePlatformPct(
        partnerPricing?.custom_percentage != null ? Number(partnerPricing.custom_percentage) : null
    ) / 100

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
                passFixedToCustomer={partnerPricing?.pass_fixed_to_customer ?? true}
                passPercentageToCustomer={partnerPricing?.pass_percentage_to_customer ?? false}
                fixedFeePerTicket={resolveFixedFee(
                    partnerPricing?.fixed_fee_per_ticket != null ? Number(partnerPricing.fixed_fee_per_ticket) : null
                )}
                initialQuestions={registrationQuestions}
                initialRegistrations={initialRegistrations}
                subscriptionTiers={rawSubscriptionTiers || []}
                existingDiscounts={rawExistingDiscounts || []}
                subscriptionsEnabled={(partner as any).subscriptions_enabled === true}
            />
        </div>
    )
}
