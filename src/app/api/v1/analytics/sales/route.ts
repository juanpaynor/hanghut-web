import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/analytics/sales
 * Sales analytics and revenue data for partner's events
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const eventId = url.searchParams.get('event_id') // optional — specific event
    const from = url.searchParams.get('from') // optional — ISO date
    const to = url.searchParams.get('to') // optional — ISO date

    const supabase = createAdminClient()

    // Get partner's events
    let eventsQuery = supabase
        .from('events')
        .select('id, title, start_datetime, capacity, ticket_price')
        .eq('organizer_id', auth.partnerId)

    if (eventId) {
        eventsQuery = eventsQuery.eq('id', eventId)
    }

    const { data: events } = await eventsQuery
    if (!events || events.length === 0) {
        return apiSuccess({
            total_revenue: 0,
            total_tickets_sold: 0,
            total_orders: 0,
            events: [],
        })
    }

    const eventIds = events.map((e: any) => e.id)

    // Build orders query for these events
    let ordersQuery = supabase
        .from('purchase_intents')
        .select('id, event_id, total_amount, quantity, status, paid_at, discount_amount')
        .in('event_id', eventIds)
        .eq('status', 'completed')

    if (from) {
        ordersQuery = ordersQuery.gte('paid_at', from)
    }
    if (to) {
        ordersQuery = ordersQuery.lte('paid_at', to)
    }

    const { data: orders } = await ordersQuery

    // Aggregate per event
    const eventStats = new Map<string, {
        revenue: number
        tickets_sold: number
        orders: number
        discount_total: number
    }>()

    for (const event of events) {
        eventStats.set(event.id, {
            revenue: 0,
            tickets_sold: 0,
            orders: 0,
            discount_total: 0,
        })
    }

    let totalRevenue = 0
    let totalTickets = 0
    let totalOrders = 0
    let totalDiscounts = 0

    for (const order of (orders || [])) {
        const stats = eventStats.get(order.event_id)
        if (stats) {
            const amount = order.total_amount || 0
            const discount = order.discount_amount || 0
            stats.revenue += amount
            stats.tickets_sold += order.quantity || 0
            stats.orders += 1
            stats.discount_total += discount
            totalRevenue += amount
            totalTickets += order.quantity || 0
            totalOrders += 1
            totalDiscounts += discount
        }
    }

    const eventBreakdown = events.map((event: any) => {
        const stats = eventStats.get(event.id)!
        return {
            id: event.id,
            title: event.title,
            start_datetime: event.start_datetime,
            capacity: event.capacity,
            revenue: stats.revenue,
            tickets_sold: stats.tickets_sold,
            orders: stats.orders,
            discount_total: stats.discount_total,
        }
    })

    return apiSuccess({
        total_revenue: totalRevenue,
        total_tickets_sold: totalTickets,
        total_orders: totalOrders,
        total_discounts: totalDiscounts,
        date_range: {
            from: from || null,
            to: to || null,
        },
        events: eventBreakdown,
    })
}

export async function OPTIONS() {
    return handleCors()
}
