import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitize } from '@/lib/sanitize'
import { plainTextToHtml } from '@/lib/plain-text-to-html'

// Mirrors the Postgres `event_type` enum. Keep in sync with the DB.
const EVENT_TYPES = ['concert', 'workshop', 'conference', 'sports', 'social', 'food', 'nightlife', 'art', 'other'] as const

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
 * Resolve coordinates for an address with Google Geocoding. Returns null when the
 * key is missing or nothing matched — the caller decides how to fail.
 */
async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
    const key = process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
    if (!key) return null
    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=ph&key=${key}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return null
        const json = await res.json()
        const loc = json?.results?.[0]?.geometry?.location
        if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
        return { latitude: loc.lat, longitude: loc.lng }
    } catch {
        return null
    }
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

    const {
        title, description, description_html, start_datetime, end_datetime, venue_name, address, city,
        capacity, event_type, ticket_price, cover_image_url, latitude, longitude, sales_end_datetime,
    } = body

    if (!title || typeof title !== 'string') return apiError('title is required', 400)
    if (!start_datetime || Number.isNaN(Date.parse(start_datetime))) return apiError('start_datetime is required (ISO 8601)', 400)
    if (end_datetime != null && Number.isNaN(Date.parse(end_datetime))) return apiError('end_datetime must be ISO 8601', 400)
    if (description != null && typeof description !== 'string') return apiError('description must be a string', 400)
    if (description_html != null && typeof description_html !== 'string') return apiError('description_html must be a string', 400)
    // Validate up front: an unknown value used to reach Postgres and come back as a
    // 500 ("invalid input value for enum event_type"), which told the caller nothing.
    if (event_type != null && !EVENT_TYPES.includes(event_type)) {
        return apiError(`event_type must be one of: ${EVENT_TYPES.join(', ')}`, 400)
    }

    // The table requires capacity (NOT NULL, no default) and caps
    // max_tickets_per_purchase at capacity — both used to surface as 500s.
    const cap = Number.parseInt(String(capacity ?? ''), 10)
    if (!Number.isFinite(cap) || cap < 1) return apiError('capacity is required (integer ≥ 1)', 400)

    const price = Number(ticket_price ?? 0)
    if (!Number.isFinite(price) || price < 0) return apiError('ticket_price must be a number ≥ 0', 400)

    // Coordinates: the table requires them. Accept them directly, otherwise
    // geocode from whatever location text we were given.
    let lat = latitude == null ? NaN : Number(latitude)
    let lng = longitude == null ? NaN : Number(longitude)
    if ((latitude != null || longitude != null) && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
        return apiError('latitude and longitude must both be numbers', 400)
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const query = [venue_name, address, city].filter((v) => typeof v === 'string' && v.trim()).join(', ')
        const geo = query ? await geocode(query) : null
        if (!geo) {
            return apiError(
                'Could not locate this event. Pass latitude and longitude, or give a fuller address (venue_name, address, city) we can geocode.',
                400,
            )
        }
        lat = geo.latitude
        lng = geo.longitude
    }

    const supabase = createAdminClient()

    // Same defaults the dashboard applies: sales close an hour before doors
    // unless told otherwise; per-order cap never exceeds capacity.
    const salesEnd = sales_end_datetime && !Number.isNaN(Date.parse(sales_end_datetime))
        ? new Date(sales_end_datetime).toISOString()
        : new Date(new Date(start_datetime).getTime() - 3600000).toISOString()

    const { data: event, error } = await supabase
        .from('events')
        .insert({
            organizer_id: auth.partnerId,
            title,
            description: description || null,
            // The event page prefers description_html and only falls back to the
            // plain column. Without this the API could never produce a formatted
            // description, and opening such an event in the dashboard editor fed
            // plain text with real newlines into an HTML editor, which collapses
            // them. Derive it when the caller sends only plain text.
            description_html: description_html
                ? sanitize(description_html)
                : plainTextToHtml(description) || null,
            start_datetime,
            end_datetime: end_datetime || null,
            sales_end_datetime: salesEnd,
            venue_name: venue_name || null,
            address: address || null,
            city: city || null,
            latitude: lat,
            longitude: lng,
            capacity: cap,
            tickets_sold: 0,
            min_tickets_per_purchase: 1,
            max_tickets_per_purchase: Math.max(1, Math.min(10, cap)),
            event_type: event_type || 'other',
            ticket_price: price,
            cover_image_url: cover_image_url || null,
            status: 'draft',
        })
        .select('id, title, status, start_datetime, end_datetime, venue_name, address, city, latitude, longitude, capacity, event_type, ticket_price, cover_image_url, created_at')
        .single()

    if (error) {
        return apiError(`Failed to create event: ${error.message}`, 500)
    }

    // One General Admission tier, like the dashboard's create flow — buyers
    // purchase through a tier, and the organizer can rename/split it later.
    const { error: tierError } = await supabase.from('ticket_tiers').insert({
        event_id: event.id,
        name: 'General Admission',
        description: 'Standard entry ticket',
        price,
        quantity_total: cap,
        quantity_sold: 0,
        is_active: true,
        sort_order: 0,
    })
    if (tierError) console.error('[api] default tier creation failed', event.id, tierError.message)

    return apiSuccess(event, 201)
}

export async function OPTIONS() {
    return handleCors()
}
