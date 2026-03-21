import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/tickets/:id/check-in
 * Mark a ticket as checked in
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    // Fetch ticket with event ownership check
    const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
            id,
            status,
            checked_in_at,
            event_id,
            events (
                id,
                organizer_id,
                title
            ),
            ticket_tiers (
                name
            ),
            purchase_intent:purchase_intents (
                guest_name,
                guest_email
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

    // Check if already checked in
    if (ticket.status === 'used' || ticket.checked_in_at) {
        return apiError('Ticket already checked in', 409)
    }

    // Check if ticket is in a valid state for check-in
    if (ticket.status === 'refunded' || ticket.status === 'cancelled') {
        return apiError(`Cannot check in a ${ticket.status} ticket`, 409)
    }

    // Perform check-in
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
        .from('tickets')
        .update({
            status: 'used',
            checked_in_at: now,
        })
        .eq('id', id)

    if (updateError) {
        return apiError('Failed to check in ticket', 500)
    }

    const pi = ticket.purchase_intent as any
    const tier = ticket.ticket_tiers as any

    // Fire webhook (async, don't block response)
    dispatchWebhook(auth.partnerId, 'ticket.checked_in', {
        ticket_id: ticket.id,
        event_id: event.id,
        checked_in_at: now,
        customer: pi ? { name: pi.guest_name, email: pi.guest_email } : null,
    }).catch(() => {})

    return apiSuccess({
        id: ticket.id,
        status: 'used',
        checked_in_at: now,
        event: {
            id: event.id,
            title: event.title,
        },
        tier: tier ? { name: tier.name } : null,
        customer: pi ? {
            name: pi.guest_name,
            email: pi.guest_email,
        } : null,
    })
}

export async function OPTIONS() {
    return handleCors()
}
