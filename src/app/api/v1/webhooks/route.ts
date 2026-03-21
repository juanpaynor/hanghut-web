import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const VALID_EVENTS = ['ticket.purchased', 'ticket.refunded', 'ticket.checked_in', 'event.updated']

/**
 * GET /api/v1/webhooks
 * List webhook endpoints for this partner
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const supabase = createAdminClient()

    const { data: webhooks, error } = await supabase
        .from('webhook_endpoints')
        .select('id, url, events, is_active, created_at, updated_at')
        .eq('partner_id', auth.partnerId)
        .order('created_at', { ascending: false })

    if (error) {
        return apiError('Failed to fetch webhooks', 500)
    }

    return apiSuccess({ webhooks: webhooks || [] })
}

/**
 * POST /api/v1/webhooks
 * Register a new webhook endpoint
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

    const { url, events } = body

    if (!url || typeof url !== 'string') {
        return apiError('url is required', 400)
    }

    try {
        new URL(url)
    } catch {
        return apiError('url must be a valid URL', 400)
    }

    if (!url.startsWith('https://')) {
        return apiError('url must use HTTPS', 400)
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
        return apiError('events must be a non-empty array', 400)
    }

    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e))
    if (invalidEvents.length > 0) {
        return apiError(`Invalid event types: ${invalidEvents.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}`, 400)
    }

    const secret = `whsec_${randomBytes(24).toString('hex')}`

    const supabase = createAdminClient()

    const { data: webhook, error } = await supabase
        .from('webhook_endpoints')
        .insert({
            partner_id: auth.partnerId,
            url,
            events,
            secret,
        })
        .select('id, url, events, is_active, created_at')
        .single()

    if (error) {
        return apiError('Failed to create webhook endpoint', 500)
    }

    return apiSuccess({
        ...webhook,
        secret, // Only shown once, like API keys
    }, 201)
}

export async function OPTIONS() {
    return handleCors()
}
