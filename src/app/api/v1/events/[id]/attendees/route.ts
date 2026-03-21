import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/events/:id/attendees
 * List attendees for an event (with pagination)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')))
    const status = url.searchParams.get('status') // optional: sold, used, refunded, cancelled
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createAdminClient()

    // Verify event belongs to this partner
    const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, title')
        .eq('id', id)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (eventError || !event) {
        return apiError('Event not found', 404)
    }

    // Build query
    let query = supabase
        .from('tickets')
        .select(`
            id,
            status,
            checked_in_at,
            created_at,
            ticket_number,
            tier_id,
            ticket_tiers (
                name,
                price
            ),
            purchase_intent:purchase_intents (
                guest_name,
                guest_email,
                guest_phone,
                paid_at
            )
        `, { count: 'exact' })
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .range(from, to)

    if (status) {
        // Map 'checked_in' to 'used' for API consistency
        const dbStatus = status === 'checked_in' ? 'used' : status
        query = query.eq('status', dbStatus)
    }

    const { data: tickets, error, count } = await query

    if (error) {
        return apiError('Failed to fetch attendees', 500)
    }

    const attendees = (tickets || []).map((ticket: any) => {
        const pi = ticket.purchase_intent
        const tier = ticket.ticket_tiers
        return {
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            status: ticket.status === 'used' ? 'checked_in' : ticket.status,
            checked_in_at: ticket.checked_in_at,
            purchased_at: pi?.paid_at || ticket.created_at,
            customer: pi ? {
                name: pi.guest_name,
                email: pi.guest_email,
                phone: pi.guest_phone,
            } : null,
            tier: tier ? {
                name: tier.name,
                price: tier.price,
            } : null,
        }
    })

    const total = count || 0
    const totalPages = Math.ceil(total / perPage)

    return apiSuccess({
        event: { id: event.id, title: event.title },
        attendees,
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
