import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { serializeSubscription, SUBSCRIPTION_SELECT } from '@/lib/api/subscription-serializer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/subscriptions/{id}
 * Retrieve a single subscription owned by this partner.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    const { data: sub, error } = await supabase
        .from('fan_subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('id', id)
        .eq('partner_id', auth.partnerId)
        .maybeSingle()

    if (error) return apiError('Failed to fetch subscription', 500)
    if (!sub) return apiError('Subscription not found', 404)

    return apiSuccess({ subscription: serializeSubscription(sub as any) })
}

export async function OPTIONS() {
    return handleCors()
}
