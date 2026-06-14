import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/subscription-tiers
 * List the partner's subscription tiers ("plans") — the recurring products
 * a fan can subscribe to. Mirrors HelixPay's plan listing.
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const includeInactive = url.searchParams.get('include_inactive') === 'true'

    const supabase = createAdminClient()

    let query = supabase
        .from('subscription_tiers')
        .select('id, name, description, price_monthly, is_active, perks, created_at')
        .eq('partner_id', auth.partnerId)
        .order('price_monthly', { ascending: true })

    if (!includeInactive) {
        query = query.eq('is_active', true)
    }

    const { data: tiers, error } = await query

    if (error) {
        return apiError('Failed to fetch subscription tiers', 500)
    }

    const plans = (tiers || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price_monthly: Number(t.price_monthly),
        currency: 'PHP',
        interval: 'monthly',
        is_active: t.is_active,
        perks: (t.perks || []).map((p: any) => ({ type: p.type, label: p.label })),
        created_at: t.created_at,
    }))

    return apiSuccess({ subscription_tiers: plans })
}

export async function OPTIONS() {
    return handleCors()
}
