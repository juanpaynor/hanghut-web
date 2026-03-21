import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/events
 * List all active events for the authenticated partner
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20')))
    const status = url.searchParams.get('status') || 'active'
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createAdminClient()

    const { data: events, error, count: totalCount } = await supabase
        .from('events')
        .select(`
            id,
            title,
            status,
            start_datetime,
            end_datetime,
            venue_name,
            address,
            city,
            capacity,
            cover_image_url,
            ticket_price,
            event_type,
            ticket_tiers (
                id,
                name,
                price,
                quantity_total,
                quantity_sold,
                is_active,
                sort_order
            )
        `, { count: 'exact' })
        .eq('organizer_id', auth.partnerId)
        .eq('status', status)
        .order('start_datetime', { ascending: true })
        .range(from, to)

    if (error) {
        return apiError('Failed to fetch events', 500)
    }

    // Enrich with real ticket counts
    const eventIds = events?.map(e => e.id) || []
    let ticketCountMap = new Map<string, number>()

    if (eventIds.length > 0) {
        const { data: counts } = await supabase.rpc('get_ticket_counts_by_events', {
            p_event_ids: eventIds
        })
        if (counts) {
            counts.forEach((c: any) => ticketCountMap.set(c.event_id, Number(c.sold_count)))
        }
    }

    const enrichedEvents = (events || []).map(event => ({
        ...event,
        tickets_sold: ticketCountMap.get(event.id) || 0,
    }))

    const total = totalCount || 0
    const totalPages = Math.ceil(total / perPage)

    return apiSuccess({
        events: enrichedEvents,
        meta: {
            page,
            per_page: perPage,
            total,
            total_pages: totalPages,
            has_more: page < totalPages,
        }
    })
}

/**
 * POST /api/v1/events
 * Create a new event
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

    const { title, description, start_datetime, end_datetime, venue_name, address, city, capacity, event_type, ticket_price, cover_image_url } = body

    if (!title || typeof title !== 'string') return apiError('title is required', 400)
    if (!start_datetime) return apiError('start_datetime is required', 400)

    const supabase = createAdminClient()

    const { data: event, error } = await supabase
        .from('events')
        .insert({
            organizer_id: auth.partnerId,
            title,
            description: description || null,
            start_datetime,
            end_datetime: end_datetime || null,
            venue_name: venue_name || null,
            address: address || null,
            city: city || null,
            capacity: capacity || null,
            event_type: event_type || 'event',
            ticket_price: ticket_price || 0,
            cover_image_url: cover_image_url || null,
            status: 'draft',
        })
        .select('id, title, status, start_datetime, end_datetime, venue_name, address, city, capacity, event_type, ticket_price, cover_image_url, created_at')
        .single()

    if (error) {
        return apiError(`Failed to create event: ${error.message}`, 500)
    }

    return apiSuccess(event, 201)
}

export async function OPTIONS() {
    return handleCors()
}
