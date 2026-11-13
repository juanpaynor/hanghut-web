import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { resolvePlatformPct, resolveFixedFee, computePassedFees } from '@/lib/payment/platform-fees'
import { tierSaleState } from '@/lib/tickets/tier-availability'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/checkouts
 * Create a checkout session for a ticket purchase.
 * Returns a hosted payment URL that the partner redirects their customer to.
 */
export async function POST(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    let body: any
    try {
        body = await request.json()
    } catch {
        return apiError('Invalid JSON body', 400)
    }

    const { event_id, tier_id, quantity, customer, success_url, cancel_url, section_id } = body

    // Validate required fields
    if (!event_id) return apiError('event_id is required', 400)
    if (!quantity || quantity < 1) return apiError('quantity must be at least 1', 400)
    if (!customer?.email) return apiError('customer.email is required', 400)
    if (!customer?.name) return apiError('customer.name is required', 400)
    if (!success_url) return apiError('success_url is required', 400)

    const supabase = createAdminClient()

    // Verify the event belongs to this partner
    const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organizer_id, status, capacity, ticket_price, presale_starts_at, public_sale_starts_at, ticket_tiers(id, price, quantity_total, is_active, sales_start, sales_end)')
        .eq('id', event_id)
        .single()

    if (eventError || !event) {
        return apiError('Event not found', 404)
    }

    if (event.organizer_id !== auth.partnerId) {
        return apiError('Event not found', 404) // Don't reveal it exists
    }

    if (event.status !== 'active') {
        return apiError('Event is not currently active', 400)
    }

    // --- PRESALE WINDOW ---
    //
    // The same rule the web checkout enforces, read from the same SQL function,
    // because a window honoured on one checkout path and ignored on the other
    // is not a window -- it is a documented bypass. That is exactly what
    // subscriber_early_access_hours is today: enforced in the event page's JSX
    // and nowhere else.
    //
    // This path is the partner's OWN key on their OWN event (checked above), so
    // the argument for exempting it is the box-office argument. It does not
    // hold: the box office is a human at a door taking cash, while this is an
    // automated storefront selling to the public. An organizer who announced a
    // 10am on-sale and whose own integration sells at 9 has a bug, not a
    // feature.
    //
    // Matching is by customer email, which this path already requires. There is
    // no registration_id here and no browser to carry a link, so a CLOSED
    // presale will refuse an API sale unless the buyer pre-registered with the
    // address the partner sends. That is the correct, conservative answer; it
    // is called out in the API error text so an integrator is not left guessing.
    if (event.presale_starts_at) {
        const { data: presale, error: presaleErr } = await supabase.rpc('check_presale_access', {
            p_event_id: event_id,
            p_user_id: null,
            p_email: String(customer.email).trim() || null,
            p_access_token: null,
        })
        // Fail closed. The organizer promised their list first access; an
        // outage must not quietly open the doors.
        if (presaleErr) {
            console.error('check_presale_access failed (api/v1/checkouts)', presaleErr)
            return apiError('Could not confirm presale access right now. Please retry.', 503)
        }
        if (presale?.blocked === true) {
            return apiError(
                presale.code === 'EVENT_NOT_YET_ON_SALE'
                    ? `Tickets are not on sale yet (opens ${presale.opens_at}).`
                    : 'This event is in a presale. Only pre-registered email addresses can buy right now.',
                presale.code === 'EVENT_NOT_YET_ON_SALE' ? 400 : 403
            )
        }
    }

    // Reserved-seating events: the caller names a section and we seat the party
    // (best available, splits allowed) inside create-purchase-intent. A
    // quantity-only intent would oversell against seat-mapped capacity, so the
    // section is required. GA-only zones (no seat dots) fall through as quantity.
    const { data: seatMapRow } = await supabase
        .from('event_seat_maps')
        .select('id')
        .eq('event_id', event_id)
        .maybeSingle()

    let resolvedSectionId: string | null = null
    if (seatMapRow) {
        const { count: seatCount } = await supabase
            .from('seats').select('id', { count: 'exact', head: true }).eq('event_id', event_id)
        if ((seatCount ?? 0) > 0) {
            if (!section_id || typeof section_id !== 'string') {
                return apiError('This event uses reserved seating: pass section_id (see GET /events/{id}/sections). Seats are assigned best-available within the section.', 400)
            }
            const { data: section } = await supabase
                .from('event_sections')
                .select('id, tier_id, is_active')
                .eq('id', section_id)
                .eq('event_id', event_id)
                .maybeSingle()
            if (!section || section.is_active === false) return apiError('section_id does not belong to this event', 400)
            resolvedSectionId = section.id
        }
    }

    // Resolve tier
    let tierToUse: any = null
    if (tier_id) {
        tierToUse = event.ticket_tiers?.find((t: any) => t.id === tier_id)
        if (!tierToUse) return apiError('Ticket tier not found', 404)
        // The scheduled window, same three rules and the same precedence as
        // create-purchase-intent. A partner integrating against this API must
        // not be able to sell an early-bird tier the web checkout has already
        // closed — the two checkout paths disagreeing about what "on sale"
        // means is precisely the bug that let locked tiers stay purchasable.
        const saleState = tierSaleState(tierToUse)
        if (saleState === 'locked') return apiError('Ticket tier is not available', 400)
        if (saleState === 'scheduled') return apiError('Sales for this ticket tier have not opened yet', 400)
        if (saleState === 'closed') return apiError('Sales for this ticket tier have closed', 400)
    }

    // Check availability
    let dbQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', event_id)
        .not('status', 'in', '("available","refunded")')

    if (tierToUse) {
        dbQuery = dbQuery.eq('tier_id', tierToUse.id)
    }

    const { count: soldCount } = await dbQuery
    const totalCapacity = tierToUse ? tierToUse.quantity_total : event.capacity
    const available = totalCapacity - (soldCount || 0)

    if (available < quantity) {
        return apiError(
            available === 0 ? 'Sold out' : `Only ${available} tickets remaining`,
            409
        )
    }

    // Get partner fee settings
    const { data: partner } = await supabase
        .from('partners')
        .select('pass_fixed_to_customer, pass_percentage_to_customer, fixed_fee_per_ticket, pricing_model, custom_percentage')
        .eq('id', auth.partnerId)
        .single()

    const platformPct = resolvePlatformPct(
        partner?.custom_percentage != null ? Number(partner.custom_percentage) : null
    )
    const fixedFeePerTicket = resolveFixedFee(
        partner?.fixed_fee_per_ticket != null ? Number(partner.fixed_fee_per_ticket) : null
    )
    const passFixed = partner?.pass_fixed_to_customer === true
    const passPercentage = partner?.pass_percentage_to_customer === true

    const unitPrice = tierToUse ? tierToUse.price : event.ticket_price
    const isFree = unitPrice === 0
    const passed = computePassedFees({
        net: isFree ? 0 : unitPrice * quantity,
        quantity,
        pct: platformPct,
        fixedFeePerTicket,
        passPercentage,
        passFixed,
    })
    const platformFee = passed.pctPortion
    const fixedFeeTotal = passed.fixedPortion
    const totalFees = passed.total

    // Call the create-purchase-intent edge function
    const edgeClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: result, error: fnError } = await edgeClient.functions.invoke('create-purchase-intent', {
        body: {
            event_id,
            quantity,
            tier_id: tier_id || undefined,
            section_id: resolvedSectionId || undefined,
            // Partner-integration checkout, not our own web UI — tagged separately so
            // partner-driven volume doesn't get counted as hanghut.com traffic.
            source: 'api',
            guest_details: {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || ''
            },
            success_url,
            failure_url: cancel_url || success_url,
            metadata: {
                pass_fixed: passFixed,
                pass_percentage: passPercentage,
                commission_rate: platformPct / 100,
                fixed_fee_per_ticket: fixedFeePerTicket,
                calculated_fees: {
                    platform_fee: platformFee,
                    fixed_fee: fixedFeeTotal,
                    total_fees: totalFees
                }
            },
            api_checkout: true // Flag so the edge function knows this is from API
        },
        headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
    })

    if (fnError || !result?.success) {
        console.error('[API Checkout] Edge function error:', fnError || result?.error)
        return apiError(
            result?.error?.message || 'Failed to create checkout session',
            500
        )
    }

    return apiSuccess({
        // The function returns `intent_id`; the old `purchase_intent_id` read was
        // always null, so integrations never got a checkout id back.
        checkout_id: result.data?.intent_id || result.data?.purchase_intent_id || null,
        checkout_url: result.data?.payment_url,
        expires_at: result.data?.expires_at || null,
        // Seated events: what the buyer was given (held until the checkout expires).
        assigned_seats: Array.isArray(result.data?.assigned_seats)
            ? result.data.assigned_seats.map((s: any) => ({ section: s.section, row: s.row, seat: s.seat, label: s.label }))
            : undefined,
    }, 201)
}

export async function OPTIONS() {
    return handleCors()
}
