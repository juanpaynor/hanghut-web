import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckoutClient } from '@/components/checkout/checkout-client'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ eventId: string; quantity: string; tierId?: string; seatIds?: string }>
}) {
    // 1. Validate params
    const { eventId, quantity, tierId, seatIds } = await searchParams
    const qty = parseInt(quantity || '0')

    // Seat picker handoff: comma-separated seat UUIDs; count must match quantity
    const seatIdList = (seatIds || '').split(',').map(s => s.trim()).filter(Boolean)
    const selectedSeatIds = seatIdList.length === qty ? seatIdList : []

    if (!eventId || qty < 1) {
        redirect('/')
    }

    const supabase = await createClient()

    // Run event fetch, auth check, and subscriber discount check in parallel
    const [eventResult, userResult, subscriberDiscountResult] = await Promise.all([
        supabase
            .from('events')
            .select(`
                id,
                title,
                start_datetime,
                venue_name,
                ticket_price,
                cover_image_url,
                capacity,
                tickets_sold,
                theme_color,
                custom_tos,
                require_approval,
                invite_only,
                organizer:partners (
                    id,
                    business_name,
                    pass_fees_to_customer,
                    fixed_fee_per_ticket,
                    pricing_model,
                    custom_percentage,
                    custom_tos
                ),
                ticket_tiers (
                    id,
                    name,
                    price,
                    quantity_total,
                    quantity_sold,
                    is_active
                ),
                registration_questions (
                    id,
                    label,
                    question_type,
                    options,
                    is_required,
                    display_order
                )
            `)
            .eq('id', eventId)
            .single(),
        supabase.auth.getUser(),
        supabase.rpc('get_subscriber_event_discount', { p_event_id: eventId }),
    ])

    const event = eventResult.data

    if (!event) {
        redirect('/')
    }

    // Reserved-seating guard: if this event has a seat map, seat selection is the
    // ONLY valid checkout path. A quantity-based intent (no seatIds, or a count
    // that doesn't match qty) would sell against tier capacity without claiming a
    // seat — oversell + ghost tickets. Bounce back to the picker.
    const { data: seatMapRow } = await supabase
        .from('event_seat_maps')
        .select('id')
        .eq('event_id', eventId)
        .maybeSingle()

    if (seatMapRow && selectedSeatIds.length !== qty) {
        redirect(`/events/${eventId}?error=select_seats`)
    }

    // Resolve custom TOS: event-level overrides organizer-level
    const org = Array.isArray(event.organizer) ? event.organizer[0] : event.organizer
    const customTos = event.custom_tos || org?.custom_tos || null
    const organizerName = org?.business_name || 'Organizer'

    // 3. Resolve Tier
    let tierToUse = null

    if (tierId) {
        tierToUse = event.ticket_tiers?.find((t: any) => t.id === tierId) || null
    }

    // Fallback: If no tierId specified, check if event has tiers and use the first one (General Admission usually)
    // Or if event has no tiers, use event-level data
    if (!tierToUse) {
        // If tiers exist, default to the cheapest active one? Or just the first one?
        const activeTiers = event.ticket_tiers?.filter((t: any) => t.is_active) || []
        if (activeTiers.length > 0) {
            tierToUse = activeTiers[0]
        } else {
            // Backward compatibility for old events without tiers
            tierToUse = {
                id: null,
                name: 'General Admission',
                price: event.ticket_price,
                quantity_total: event.capacity,
                quantity_sold: event.tickets_sold
            }
        }
    }

    // 4. User State (already fetched in parallel above)
    const user = userResult.data?.user ?? null

    // 5a. Subscriber discount (only meaningful for logged-in users)
    const subscriberDiscount = user && subscriberDiscountResult.data?.has_discount
        ? subscriberDiscountResult.data
        : null

    // 5. Check Availability (use real-time count from tickets table using adminClient to bypass RLS)
    const adminClient = createAdminClient()
    let dbQuery = adminClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .not('status', 'in', '("available","refunded")')

    if (tierToUse?.id) {
        dbQuery = dbQuery.eq('tier_id', tierToUse.id)
    }

    const { count: realSoldTicketsCount } = await dbQuery
    const actualSold = realSoldTicketsCount || 0
    const availableTickets = tierToUse.quantity_total - actualSold

    if (availableTickets < qty) {
        redirect(`/events/${eventId}?error=sold_out`)
    }

    // If the buyer already has an approved registration for this event, surface it
    // so checkout skips re-registration (which would error "already registered")
    // and the question step. Covers returning approved users (new session/device).
    let approvedRegistrationId: string | null = null
    if (user && (event.require_approval || event.invite_only)) {
        const { data: reg } = await adminClient
            .from('event_registrations')
            .select('id')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .in('status', ['approved', 'auto_approved'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        approvedRegistrationId = reg?.id ?? null
    }

    return (
        <div className="min-h-screen bg-muted/30">
            <header className="bg-background border-b sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="font-headline font-bold text-xl">
                        Checkout
                    </h1>
                    <div className="text-sm text-muted-foreground">
                        Secure Payment by Xendit
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <CheckoutClient
                    event={event}
                    quantity={qty}
                    user={user}
                    tier={tierToUse}
                    customTos={customTos}
                    organizerName={organizerName}
                    registrationQuestions={(event.registration_questions || []).sort((a: any, b: any) => a.display_order - b.display_order)}
                    subscriberDiscount={subscriberDiscount}
                    selectedSeatIds={selectedSeatIds}
                    approvedRegistrationId={approvedRegistrationId}
                />
            </main>
        </div>
    )
}
