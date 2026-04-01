import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/orders
 * List purchase orders for this partner's events (with pagination)
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20')))
    const eventId = url.searchParams.get('event_id') // optional filter
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createAdminClient()

    // First get partner's event IDs
    let eventsQuery = supabase
        .from('events')
        .select('id')
        .eq('organizer_id', auth.partnerId)

    if (eventId) {
        eventsQuery = eventsQuery.eq('id', eventId)
    }

    const { data: partnerEvents } = await eventsQuery
    const eventIds = (partnerEvents || []).map((e: any) => e.id)

    if (eventIds.length === 0) {
        return apiSuccess({
            orders: [],
            meta: { page: 1, per_page: perPage, total: 0, total_pages: 0, has_more: false }
        })
    }

    // Fetch purchase intents (orders) for these events
    const { data: orders, error, count } = await supabase
        .from('purchase_intents')
        .select(`
            id,
            event_id,
            guest_name,
            guest_email,
            guest_phone,
            quantity,
            total_amount,
            status,
            payment_method,
            paid_at,
            created_at,
            promo_code,
            discount_amount,
            event:events (
                id,
                title
            )
        `, { count: 'exact' })
        .in('event_id', eventIds)
        .not('status', 'eq', 'pending') // Only show completed/refunded orders
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) {
        console.error('Orders query error:', error)
        return apiError('Failed to fetch orders', 500)
    }

    const formattedOrders = (orders || []).map((order: any) => ({
        id: order.id,
        event: order.event ? {
            id: order.event.id,
            title: order.event.title,
        } : null,
        customer: {
            name: order.guest_name,
            email: order.guest_email,
            phone: order.guest_phone,
        },
        quantity: order.quantity,
        total_amount: order.total_amount,
        status: order.status,
        payment_method: order.payment_method,
        promo_code: order.promo_code,
        discount_amount: order.discount_amount,
        paid_at: order.paid_at,
        created_at: order.created_at,
    }))

    const total = count || 0
    const totalPages = Math.ceil(total / perPage)

    return apiSuccess({
        orders: formattedOrders,
        meta: {
            page,
            per_page: perPage,
            total,
            total_pages: totalPages,
            has_more: page < totalPages,
        }
    })
}

export async function OPTIONS() {
    return handleCors()
}
