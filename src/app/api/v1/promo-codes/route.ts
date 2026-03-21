import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/promo-codes
 * List promo codes for a specific event
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const eventId = url.searchParams.get('event_id')

    if (!eventId) {
        return apiError('event_id query parameter is required', 400)
    }

    const supabase = createAdminClient()

    // Verify event ownership
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (!event) {
        return apiError('Event not found', 404)
    }

    const { data: codes, error } = await supabase
        .from('promo_codes')
        .select('id, code, discount_type, discount_amount, usage_limit, usage_count, starts_at, expires_at, is_active, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    if (error) {
        return apiError('Failed to fetch promo codes', 500)
    }

    return apiSuccess({ promo_codes: codes || [] })
}

/**
 * POST /api/v1/promo-codes
 * Create a new promo code for an event
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

    const { event_id, code, discount_type, discount_amount, usage_limit, expires_at } = body

    if (!event_id) return apiError('event_id is required', 400)
    if (!code || typeof code !== 'string' || code.length < 3) return apiError('code must be at least 3 characters', 400)
    if (!discount_type || !['percentage', 'fixed_amount'].includes(discount_type)) {
        return apiError('discount_type must be "percentage" or "fixed_amount"', 400)
    }
    if (typeof discount_amount !== 'number' || discount_amount <= 0) {
        return apiError('discount_amount must be a positive number', 400)
    }
    if (discount_type === 'percentage' && discount_amount > 100) {
        return apiError('percentage discount cannot exceed 100', 400)
    }

    const supabase = createAdminClient()

    // Verify event ownership
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', event_id)
        .eq('organizer_id', auth.partnerId)
        .single()

    if (!event) {
        return apiError('Event not found', 404)
    }

    const { data: promo, error } = await supabase
        .from('promo_codes')
        .insert({
            event_id,
            code: code.toUpperCase().trim(),
            discount_type,
            discount_amount,
            usage_limit: usage_limit || null,
            expires_at: expires_at || null,
            is_active: true,
        })
        .select('id, code, discount_type, discount_amount, usage_limit, usage_count, expires_at, is_active, created_at')
        .single()

    if (error) {
        if (error.code === '23505') {
            return apiError('A promo code with this name already exists for this event', 409)
        }
        return apiError(`Failed to create promo code: ${error.message}`, 500)
    }

    return apiSuccess(promo, 201)
}

export async function OPTIONS() {
    return handleCors()
}
