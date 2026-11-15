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
        .select('id, code, discount_type, discount_amount, usage_limit, usage_count, starts_at, expires_at, is_active, created_at, tier_ids')
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

    const { event_id, code, discount_type, discount_amount, usage_limit, expires_at, tier_ids } = body

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

    // tier_ids limits the code to some of the event's tiers. Omitted or empty
    // means every tier -- how every code created before this field behaves.
    // Validated as uuid strings here rather than left to the CHECK constraint,
    // which only enforces array-ness: a partner posting {"tier_ids": "VIP"}
    // would store happily and then match nothing, producing a code that looks
    // scoped and silently discounts nobody.
    const TIER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    let tierScope: string[] | null = null
    if (tier_ids !== undefined && tier_ids !== null) {
        if (!Array.isArray(tier_ids) || tier_ids.some((t: unknown) => typeof t !== 'string' || !TIER_UUID_RE.test(t))) {
            return apiError('tier_ids must be an array of ticket tier ids', 400)
        }
        tierScope = tier_ids.length > 0 ? Array.from(new Set(tier_ids as string[])) : null
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

    // Every named tier must belong to THIS event. Otherwise a partner can scope
    // a code to an id that is not theirs: harmless to the other organizer, but
    // it silently makes the code apply to nothing, and "my code does not work"
    // costs far more to debug than a 400 here.
    if (tierScope) {
        const { data: ownTiers } = await supabase
            .from('ticket_tiers')
            .select('id')
            .eq('event_id', event_id)
            .in('id', tierScope)
        const found = new Set((ownTiers ?? []).map((t) => t.id))
        const strays = tierScope.filter((id) => !found.has(id))
        if (strays.length > 0) {
            return apiError(`tier_ids do not belong to this event: ${strays.join(', ')}`, 400)
        }
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
            tier_ids: tierScope,
        })
        .select('id, code, discount_type, discount_amount, usage_limit, usage_count, expires_at, is_active, created_at, tier_ids')
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
