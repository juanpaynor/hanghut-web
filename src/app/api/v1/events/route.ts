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
    const timer = auth.timer

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20')))
    const status = url.searchParams.get('status') || 'active'
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createAdminClient()

    const { data: events, error, count: totalCount } = await timer.span('events', () => supabase
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
            tickets_sold,
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
    )

    if (error) {
        return apiError('Failed to fetch events', 500)
    }

    // `tickets_sold` now comes from the row itself instead of a follow-up
    // get_ticket_counts_by_events RPC. That RPC could not be parallelised — it
    // needs the ids from the query above — so it cost a second sequential round
    // trip on every request, and a round trip here measures ~150ms.
    //
    // Verified equivalent before removing it, against the RPC's own predicate
    // (status NOT IN available/cancelled/refunded/reserved): 274 events checked,
    // 0 disagreements. Only three ticket statuses exist in practice — available,
    // valid, used — and events.tickets_sold is maintained by the
    // sync_event_tickets_sold trigger on every insert, delete and status change.
    //
    // This column is already the source of truth for the storefront and the buy
    // flow, so the API was the odd one out in recomputing it. Its integrity does
    // depend on atomic_decrement_tickets_sold not being callable by anon — see
    // the 2026-09-10 security audit; that grant needs revoking regardless.
    const enrichedEvents = (events || []).map(event => ({
        ...event,
        tickets_sold: Number(event.tickets_sold ?? 0),
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
    }, 200, { 'Server-Timing': timer.header() })
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
