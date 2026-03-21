import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/internal/dispatch-webhook
 * Internal endpoint for Supabase Edge Functions to trigger partner webhooks.
 * Secured by an internal secret (not API keys).
 */
export async function POST(request: Request) {
    // Verify internal secret
    const authHeader = request.headers.get('Authorization')
    const internalSecret = process.env.WEBHOOK_INTERNAL_SECRET

    if (!internalSecret || authHeader !== `Bearer ${internalSecret}`) {
        return apiError('Unauthorized', 401)
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return apiError('Invalid JSON body', 400)
    }

    const { event_type, event_id, payload } = body

    if (!event_type || !event_id) {
        return apiError('event_type and event_id are required', 400)
    }

    const supabase = createAdminClient()

    // Look up the organizer (partner) for this event
    const { data: event } = await supabase
        .from('events')
        .select('organizer_id')
        .eq('id', event_id)
        .single()

    if (!event) {
        return apiError('Event not found', 404)
    }

    // Check if organizer has a partner account with API keys
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('id', event.organizer_id)
        .single()

    if (!partner) {
        // No partner account — no webhooks to dispatch, that's fine
        return apiSuccess({ dispatched: false, reason: 'No partner account' })
    }

    // Dispatch the webhook
    await dispatchWebhook(partner.id, event_type, {
        event_id,
        ...payload,
    })

    return apiSuccess({ dispatched: true })
}

export async function OPTIONS() {
    return handleCors()
}
