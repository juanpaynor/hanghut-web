import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { sanitize } from '@/lib/sanitize'
import { plainTextToHtml } from '@/lib/plain-text-to-html'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

// Mirrors the Postgres `event_type` enum. Keep in sync with the DB.
const EVENT_TYPES = ['concert', 'workshop', 'conference', 'sports', 'social', 'food', 'nightlife', 'art', 'other'] as const

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/events/:id
 * Get full event details with tiers and availability
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    const { data: event, error } = await supabase
        .from('events')
        .select(`
            id,
            title,
            description,
            description_html,
            status,
            start_datetime,
            end_datetime,
            is_online,
            venue_name,
            address,
            city,
            latitude,
            longitude,
            capacity,
            cover_image_url,
            images,
            ticket_price,
            event_type,
            min_tickets_per_purchase,
            max_tickets_per_purchase,
            ticket_tiers (
                id,
                name,
                description,
                price,
                quantity_total,
                quantity_sold,
                is_active,
                sort_order
            )
        `)
        .eq('id', id)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (error || !event) {
        return apiError('Event not found', 404)
    }

    // Get real ticket count
    const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id)
        .not('status', 'in', '("available","refunded")')

    // Per-tier counts
    const { data: tierTickets } = await supabase
        .from('tickets')
        .select('tier_id')
        .eq('event_id', id)
        .not('status', 'in', '("available","refunded")')

    const tierCountMap = new Map<string, number>()
    tierTickets?.forEach((t: any) => {
        if (t.tier_id) {
            tierCountMap.set(t.tier_id, (tierCountMap.get(t.tier_id) || 0) + 1)
        }
    })

    const enrichedEvent = {
        ...event,
        tickets_sold: count ?? 0,
        ticket_tiers: (event.ticket_tiers || []).map((tier: any) => ({
            ...tier,
            quantity_sold: tierCountMap.get(tier.id) ?? tier.quantity_sold ?? 0,
            available: tier.quantity_total - (tierCountMap.get(tier.id) ?? tier.quantity_sold ?? 0),
        })),
    }

    return apiSuccess(enrichedEvent)
}

/**
 * PUT /api/v1/events/:id
 * Update event details
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    let body: any
    try {
        body = await request.json()
    } catch {
        return apiError('Invalid JSON body', 400)
    }

    const supabase = createAdminClient()

    // Verify ownership
    const { data: existing } = await supabase
        .from('events')
        .select('id, latitude, longitude')
        .eq('id', id)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (!existing) {
        return apiError('Event not found', 404)
    }

    // Build update object from allowed fields
    const allowedFields = ['title', 'description', 'description_html', 'start_datetime', 'end_datetime', 'is_online', 'venue_name', 'address', 'city', 'latitude', 'longitude', 'capacity', 'event_type', 'ticket_price', 'cover_image_url', 'status']
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updates[field] = body[field]
        }
    }

    if (Object.keys(updates).length === 0) {
        return apiError('No valid fields to update', 400)
    }
    // HTML from an API caller is untrusted — sanitize on the way in so the
    // event page never renders anything the editor's own paste path wouldn't.
    if (updates.description_html != null) {
        if (typeof updates.description_html !== 'string') return apiError('description_html must be a string', 400)
        updates.description_html = sanitize(updates.description_html)
    } else if (typeof updates.description === 'string') {
        // A caller syncing only plain text would otherwise leave a stale (or
        // absent) description_html, and the page prefers that column.
        updates.description_html = plainTextToHtml(updates.description) || null
    }
    if (updates.event_type != null && !EVENT_TYPES.includes(updates.event_type)) {
        return apiError(`event_type must be one of: ${EVENT_TYPES.join(', ')}`, 400)
    }
    for (const k of ['latitude', 'longitude'] as const) {
        if (updates[k] != null && !Number.isFinite(Number(updates[k]))) return apiError(`${k} must be a number`, 400)
    }

    // is_online and the location fields are one decision, not two. Flipping the
    // flag without clearing the rest leaves a venue and a map pin on an event
    // that renders as "Online"; clearing coordinates without the flag trips a
    // CHECK constraint and would surface to the caller as a raw database error.
    // The joining link is not a column on `events` — it lives in the RLS-protected
    // event_online_access table, written after the event update below.
    const joinUrl: string | null | undefined = body.online_url

    if (updates.is_online === true) {
        updates.venue_name = null
        updates.address = null
        updates.city = null
        updates.latitude = null
        updates.longitude = null
    } else if (updates.is_online === false) {
        const lat = updates.latitude ?? existing.latitude
        const lng = updates.longitude ?? existing.longitude
        if (lat == null || lng == null) {
            return apiError('A venue event needs latitude and longitude. Send them alongside is_online: false.', 400)
        }
    }
    if (updates.capacity != null) {
        const cap = Number.parseInt(String(updates.capacity), 10)
        if (!Number.isFinite(cap) || cap < 1) return apiError('capacity must be an integer ≥ 1', 400)
        updates.capacity = cap
    }

    const { data: event, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id)
        .select('id, title, status, start_datetime, end_datetime, is_online, venue_name, address, city, latitude, longitude, capacity, event_type, ticket_price, cover_image_url')
        .single()

    // Keep the link and the flag in step: switching an event back to a venue
    // deletes the row rather than blanking it, so a live meeting URL cannot
    // linger somewhere nothing renders it.
    if (!error) {
        if (updates.is_online === false) {
            await supabase.from('event_online_access').delete().eq('event_id', id)
        } else if (joinUrl !== undefined) {
            if (typeof joinUrl === 'string' && joinUrl.trim()) {
                await supabase.from('event_online_access').upsert(
                    { event_id: id, join_url: joinUrl.trim(), updated_at: new Date().toISOString() },
                    { onConflict: 'event_id' },
                )
            } else {
                await supabase.from('event_online_access').delete().eq('event_id', id)
            }
        }
    }

    if (error) {
        return apiError(`Failed to update event: ${error.message}`, 500)
    }

    // Fire webhook (async, don't block response)
    dispatchWebhook(auth.partnerId, 'event.updated', {
        event_id: id,
        updated_fields: Object.keys(updates),
        event,
    }).catch(() => {})

    return apiSuccess(event)
}

export async function OPTIONS() {
    return handleCors()
}
