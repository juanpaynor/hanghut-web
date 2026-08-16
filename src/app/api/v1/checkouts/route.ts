import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { resolvePlatformPct, resolveFixedFee, computePassedFees } from '@/lib/payment/platform-fees'

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

    const { event_id, tier_id, quantity, customer, success_url, cancel_url } = body

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
        .select('id, organizer_id, status, capacity, ticket_price, ticket_tiers(id, price, quantity_total, is_active)')
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

    // Reserved-seating events can't be checked out via this quantity-based API —
    // there's no seat-selection mechanism here, and a quantity-only intent would
    // oversell against seat-mapped capacity. These must go through the web seat picker.
    const { data: seatMapRow } = await supabase
        .from('event_seat_maps')
        .select('id')
        .eq('event_id', event_id)
        .maybeSingle()

    if (seatMapRow) {
        return apiError('This event uses reserved seating and cannot be booked via the API. Direct buyers to the event page to select seats.', 400)
    }

    // Resolve tier
    let tierToUse: any = null
    if (tier_id) {
        tierToUse = event.ticket_tiers?.find((t: any) => t.id === tier_id)
        if (!tierToUse) return apiError('Ticket tier not found', 404)
        if (!tierToUse.is_active) return apiError('Ticket tier is not available', 400)
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
        checkout_id: result.data?.purchase_intent_id || null,
        checkout_url: result.data?.payment_url,
        expires_at: result.data?.expires_at || null,
    }, 201)
}

export async function OPTIONS() {
    return handleCors()
}
