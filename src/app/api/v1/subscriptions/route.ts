import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { serializeSubscription, SUBSCRIPTION_SELECT } from '@/lib/api/subscription-serializer'
import { createPayrexCustomer, createSetupIntent } from '@/lib/subscriptions/payrex'
import { dispatchWebhook } from '@/lib/api/webhook-dispatcher'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['active', 'grace_period']

/**
 * GET /api/v1/subscriptions
 * List the partner's fan subscriptions. Paginated; filterable by status and tier.
 */
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20')))
    const status = url.searchParams.get('status')
    const tierId = url.searchParams.get('tier_id')
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = createAdminClient()

    let query = supabase
        .from('fan_subscriptions')
        .select(SUBSCRIPTION_SELECT, { count: 'exact' })
        .eq('partner_id', auth.partnerId)
        .order('created_at', { ascending: false })
        .range(from, to)

    if (status) query = query.eq('status', status)
    if (tierId) query = query.eq('tier_id', tierId)

    const { data: subs, error, count } = await query

    if (error) {
        console.error('Subscriptions query error:', error)
        return apiError(`Failed to fetch subscriptions: ${error.message}`, 500)
    }

    const total = count || 0
    const totalPages = Math.ceil(total / perPage)

    return apiSuccess({
        subscriptions: (subs || []).map((s: any) => serializeSubscription(s)),
        meta: {
            page,
            per_page: perPage,
            total,
            total_pages: totalPages,
            has_more: page < totalPages,
        },
    })
}

/**
 * POST /api/v1/subscriptions
 * Subscribe a customer to one of the partner's tiers and return a hosted
 * checkout URL (HelixPay-style). The customer must already have a HangHut
 * account — identified by customer.email or customer.fan_id.
 *
 * NOTE: Payrex is currently a mock that auto-approves, so the subscription is
 * provisioned immediately. When real Payrex + its webhook land, provisioning
 * moves to the webhook and this returns a pending checkout URL.
 */
export async function POST(request: Request) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    // Parked until real recurring billing (Payrex) is integrated. The logic
    // below is complete and provisions against the mock; flip the flag to
    // enable once Payrex + its renewal webhook are live.
    if (process.env.SUBSCRIPTIONS_API_WRITE_ENABLED !== 'true') {
        return apiError('Subscription creation via API is not yet available.', 503)
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return apiError('Invalid JSON body', 400)
    }

    const { tier_id, customer, success_url, cancel_url } = body

    if (!tier_id) return apiError('tier_id is required', 400)
    if (!customer?.email && !customer?.fan_id) {
        return apiError('customer.email or customer.fan_id is required', 400)
    }

    const supabase = createAdminClient()

    // Tier must belong to this partner
    const { data: tier } = await supabase
        .from('subscription_tiers')
        .select('id, name, price_monthly, is_active, partner_id')
        .eq('id', tier_id)
        .eq('partner_id', auth.partnerId)
        .maybeSingle()

    if (!tier) return apiError('Subscription tier not found', 404)
    if (!tier.is_active) return apiError('Subscription tier is not active', 400)

    // Resolve the fan to an existing HangHut user (by id or email)
    let fan: { id: string; email: string | null; display_name: string | null } | null = null
    if (customer.fan_id) {
        const { data } = await supabase
            .from('users')
            .select('id, email, display_name')
            .eq('id', customer.fan_id)
            .maybeSingle()
        fan = data
    } else {
        const { data } = await supabase
            .from('users')
            .select('id, email, display_name')
            .ilike('email', customer.email)
            .maybeSingle()
        fan = data
    }

    if (!fan) {
        return apiError(
            'Customer must have a HangHut account. No user found for the provided email or fan_id.',
            404
        )
    }

    // Block duplicate active subscription to this partner
    const { data: existing } = await supabase
        .from('fan_subscriptions')
        .select('id, status, payrex_customer_id')
        .eq('fan_id', fan.id)
        .eq('partner_id', auth.partnerId)
        .maybeSingle()

    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
        return apiError('Customer already has an active subscription to this partner', 409)
    }

    // Create/reuse a PayRex customer, then return a setup intent client_secret.
    // The subscription is provisioned by the payrex-webhook edge function on
    // setup_intent.succeeded — not here.
    let payrexCustomerId = (existing as any)?.payrex_customer_id ?? null
    if (!payrexCustomerId) {
        const customer = await createPayrexCustomer({
            name: fan.display_name || fan.email || 'HangHut Fan',
            email: fan.email || '',
            userId: fan.id,
        })
        payrexCustomerId = customer.id
    }

    const setupIntent = await createSetupIntent({
        customerId: payrexCustomerId,
        fanId: fan.id,
        tierId: tier.id,
        partnerId: auth.partnerId,
    })

    return apiSuccess({
        client_secret: setupIntent.client_secret,
        payrex_customer_id: payrexCustomerId,
        status: 'pending',
        subscription: null,
    }, 201)
}

export async function OPTIONS() {
    return handleCors()
}
