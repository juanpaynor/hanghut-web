import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { serializeSubscription, SUBSCRIPTION_SELECT } from '@/lib/api/subscription-serializer'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/subscriptions/{id}/cancel
 * Cancel a subscription. The fan keeps access until current_period_end
 * (status → 'cancelled', not deactivated immediately).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    // Parked alongside the create endpoint until Payrex billing is live —
    // cancel via API is half a flow without API-created subscriptions.
    if (process.env.SUBSCRIPTIONS_API_WRITE_ENABLED !== 'true') {
        return apiError('Subscription management via API is not yet available.', 503)
    }

    const { id } = await params
    const supabase = createAdminClient()

    const { data: existing } = await supabase
        .from('fan_subscriptions')
        .select('id, status')
        .eq('id', id)
        .eq('partner_id', auth.partnerId)
        .maybeSingle()

    if (!existing) return apiError('Subscription not found', 404)

    if (existing.status === 'cancelled') {
        return apiError('Subscription is already cancelled', 409)
    }

    const { data: updated, error } = await supabase
        .from('fan_subscriptions')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(SUBSCRIPTION_SELECT)
        .single()

    if (error) return apiError('Failed to cancel subscription', 500)

    const subscription = serializeSubscription(updated as any)

    dispatchWebhook(auth.partnerId, 'subscription.cancelled', { subscription }).catch(() => {})

    return apiSuccess({ subscription })
}

export async function OPTIONS() {
    return handleCors()
}
