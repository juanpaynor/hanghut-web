import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/tickets/:id
 * Verify a ticket's status (for door check-in or validation)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
            id,
            status,
            checked_in_at,
            created_at,
            event_id,
            tier_id,
            events (
                id,
                title,
                organizer_id,
                start_datetime,
                venue_name
            ),
            ticket_tiers (
                name,
                price
            ),
            purchase_intent:purchase_intents (
                guest_name,
                guest_email,
                quantity,
                paid_at
            )
        `)
        .eq('id', id)
        .single()

    if (error || !ticket) {
        return apiError('Ticket not found', 404)
    }

    // Verify this ticket belongs to an event owned by this partner
    const event = ticket.events as any
    if (!event || event.organizer_id !== auth.partnerId) {
        return apiError('Ticket not found', 404)
    }

    const purchaseIntent = ticket.purchase_intent as any
    const tier = ticket.ticket_tiers as any

    return apiSuccess({
        id: ticket.id,
        status: ticket.status,
        checked_in_at: ticket.checked_in_at,
        purchased_at: purchaseIntent?.paid_at || ticket.created_at,
        event: {
            id: event.id,
            title: event.title,
            start_datetime: event.start_datetime,
            venue_name: event.venue_name,
        },
        tier: tier ? {
            name: tier.name,
            price: tier.price,
        } : null,
        customer: purchaseIntent ? {
            name: purchaseIntent.guest_name,
            email: purchaseIntent.guest_email,
        } : null,
    })
}

export async function OPTIONS() {
    return handleCors()
}
