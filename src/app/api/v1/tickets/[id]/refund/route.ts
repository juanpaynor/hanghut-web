import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/tickets/:id/refund
 * Refund a ticket
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    // Fetch ticket with event ownership
    const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
            id,
            status,
            event_id,
            tier_id,
            purchase_intent_id,
            events (
                id,
                organizer_id,
                title
            ),
            ticket_tiers (
                name,
                price,
                quantity_sold
            )
        `)
        .eq('id', id)
        .single()

    if (error || !ticket) {
        return apiError('Ticket not found', 404)
    }

    const event = ticket.events as any
    if (!event || event.organizer_id !== auth.partnerId) {
        return apiError('Ticket not found', 404)
    }

    // Can only refund sold/used tickets
    if (ticket.status === 'refunded') {
        return apiError('Ticket already refunded', 409)
    }
    if (ticket.status === 'cancelled') {
        return apiError('Cannot refund a cancelled ticket', 409)
    }
    if (ticket.status === 'available') {
        return apiError('Ticket has not been purchased', 409)
    }

    // Update ticket status
    const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'refunded' })
        .eq('id', id)

    if (updateError) {
        return apiError('Failed to refund ticket', 500)
    }

    // Decrement tier sold count if applicable
    const tier = ticket.ticket_tiers as any
    if (tier && ticket.tier_id) {
        await supabase
            .from('ticket_tiers')
            .update({ quantity_sold: Math.max(0, (tier.quantity_sold || 1) - 1) })
            .eq('id', ticket.tier_id)
    }

    // Fire webhook (async, don't block response)
    dispatchWebhook(auth.partnerId, 'ticket.refunded', {
        ticket_id: ticket.id,
        event_id: event.id,
        tier: tier ? { name: tier.name, price: tier.price } : null,
    }).catch(() => {})

    return apiSuccess({
        id: ticket.id,
        status: 'refunded',
        event: {
            id: event.id,
            title: event.title,
        },
        tier: tier ? { name: tier.name, price: tier.price } : null,
        message: 'Ticket refunded successfully. Note: payment refund must be processed separately through your payment provider.',
    })
}

export async function OPTIONS() {
    return handleCors()
}
