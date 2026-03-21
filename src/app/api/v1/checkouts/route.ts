import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

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
        .select('pass_fees_to_customer, fixed_fee_per_ticket, pricing_model, custom_percentage')
        .eq('id', auth.partnerId)
        .single()

    const commissionRate = partner?.pricing_model === 'custom' && partner?.custom_percentage !== null
        ? partner.custom_percentage / 100
        : 0.15
    const fixedFeePerTicket = parseFloat(partner?.fixed_fee_per_ticket?.toString() || '15.00')
    const passFees = partner?.pass_fees_to_customer || false

    const unitPrice = tierToUse ? tierToUse.price : event.ticket_price
    const platformFee = Math.round(unitPrice * quantity * commissionRate)
    const fixedFeeTotal = fixedFeePerTicket * quantity
    const processingFee = Math.round(unitPrice * quantity * 0.03)
    const totalFees = platformFee + fixedFeeTotal + processingFee

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
            guest_details: {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || ''
            },
            success_url,
            failure_url: cancel_url || success_url,
            metadata: {
                pass_fees: passFees,
                commission_rate: commissionRate,
                fixed_fee_per_ticket: fixedFeePerTicket,
                calculated_fees: {
                    platform_fee: platformFee,
                    fixed_fee: fixedFeeTotal,
                    processing_fee: processingFee,
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
