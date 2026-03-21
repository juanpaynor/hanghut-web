import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

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
        .select('id')
        .eq('id', id)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (!existing) {
        return apiError('Event not found', 404)
    }

    // Build update object from allowed fields
    const allowedFields = ['title', 'description', 'start_datetime', 'end_datetime', 'venue_name', 'address', 'city', 'capacity', 'event_type', 'ticket_price', 'cover_image_url', 'status']
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updates[field] = body[field]
        }
    }

    if (Object.keys(updates).length === 0) {
        return apiError('No valid fields to update', 400)
    }

    const { data: event, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id)
        .select('id, title, status, start_datetime, end_datetime, venue_name, address, city, capacity, event_type, ticket_price, cover_image_url')
        .single()

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
