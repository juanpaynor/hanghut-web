import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Pinned, not floating `@2`: the float resolved to a build whose postgrest-js
// submodule 404s on esm.sh and made every function undeployable.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

/**
 * HangHut Pro signup — Xendit recurring.
 *
 * TWO STEPS, because a card cannot be tokenized and charged in one call:
 *
 *   action: 'start'     create an Xendit customer + a SAVE session (amount 0),
 *                       return the hosted payment_link_url. The partner enters
 *                       their card on Xendit's page, not ours.
 *   action: 'activate'  after they come back, read the token off the session
 *                       and create the recurring plan -- or, when a plan already
 *                       exists, PATCH the new card onto it.
 *
 * CARD REPLACEMENT USES THE SAME TWO STEPS. A partner whose card expired must be
 * able to fix it without losing their plan, so `start` on an existing
 * subscription reuses that row and `activate` PATCHes `payment_tokens` instead
 * of creating a second plan. Cancelling and re-subscribing would reset their
 * billing anchor and bill them twice in one month.
 *
 * DIRECTION OF MONEY. Every other Xendit call in this codebase pays money OUT to
 * a partner sub-account and carries `for-user-id`. This one collects money IN to
 * HangHut's main account. That header must never be sent here -- doing so would
 * bill the partner's own wallet for their subscription to us.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Required by the recurring API. None of our older Xendit calls send one, so
// this is easy to omit by habit -- and the call fails outright without it.
const XENDIT_API_VERSION = '2026-01-01'

const PLAN_CODE = 'pro'

function xenditHeaders(key: string) {
    const h = new Headers()
    h.set('Authorization', `Basic ${btoa(key + ':')}`)
    h.set('Content-Type', 'application/json')
    h.set('api-version', XENDIT_API_VERSION)
    return h
}

/**
 * Turn a Xendit error body into something a partner can act on.
 *
 * INVALID_PAYMENT_TOKEN_ID is the one that matters: it means the card never
 * finished saving, expired, or was unlinked. Showing "something went wrong"
 * there sends the partner to support when the fix is to re-enter the card.
 */
function mapXenditError(raw: string, fallback: string): { error: string; code?: string } {
    let code = ''
    try { code = String(JSON.parse(raw)?.error_code || '') } catch { /* not JSON */ }
    switch (code) {
        case 'INVALID_PAYMENT_TOKEN_ID':
            return { error: 'That card could not be used. Please add it again.', code }
        case 'IDEMPOTENCY_ERROR':
            return { error: 'This signup was already submitted. Please start again.', code }
        case 'CUSTOMER_NOT_FOUND_ERROR':
            return { error: 'Billing profile not found. Please start again.', code }
        case 'CHANNEL_UNAVAILABLE':
            return { error: 'Card payments are temporarily unavailable. Please try again shortly.', code }
        default:
            return { error: fallback, code: code || undefined }
    }
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('XENDIT_SECRET_KEY not configured')

        const appUrl = Deno.env.get('APP_URL') || 'https://hanghut.com'

        // --- AUTH ---
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
        const { data: { user }, error: userError } =
            await admin.auth.getUser(authHeader.replace('Bearer ', ''))
        if (userError || !user) return json({ error: 'Unauthorized' }, 401)

        // OWNER ONLY, deliberately. getActingPartnerId semantics would let a team
        // member or a platform-support ghost put the business on a paid plan.
        // Committing someone else's business to a recurring charge is not a
        // delegated action.
        const { data: partner } = await admin
            .from('partners')
            .select('id, business_name, user_id')
            .eq('user_id', user.id)
            .maybeSingle()
        if (!partner) return json({ error: 'Only the partner owner can manage billing.' }, 403)

        const body = await req.json().catch(() => ({}))
        const action = ['activate', 'cancel'].includes(body?.action) ? body.action : 'start'

        // ====================================================================
        // CANCEL — deactivate the plan, but do NOT revoke what they paid for
        // ====================================================================
        if (action === 'cancel') {
            const { data: live } = await admin
                .from('partner_subscriptions')
                .select('*')
                .eq('partner_id', partner.id)
                .in('status', ['PENDING', 'REQUIRES_ACTION', 'ACTIVE'])
                .maybeSingle()
            if (!live) return json({ error: 'No active subscription to cancel.' }, 404)

            if (live.xendit_plan_id) {
                const cancelRes = await fetch(
                    `https://api.xendit.co/recurring/plans/${live.xendit_plan_id}/deactivate`,
                    { method: 'POST', headers: xenditHeaders(xenditKey) },
                )
                const cancelRaw = await cancelRes.text()
                // DATA_NOT_FOUND means Xendit has no such plan — nothing left to
                // stop, so record the cancellation rather than trapping the
                // partner in a subscription that does not exist upstream.
                let code = ''
                try { code = String(JSON.parse(cancelRaw)?.error_code || '') } catch { /* not JSON */ }
                if (!cancelRes.ok && code !== 'DATA_NOT_FOUND') {
                    console.error('Xendit deactivate failed:', cancelRaw)
                    return json(mapXenditError(cancelRaw, 'Could not cancel the subscription.'), 502)
                }
            }

            await admin.from('partner_subscriptions').update({
                status: 'CANCELLED',
                cancelled_at: new Date().toISOString(),
                cancel_reason: typeof body?.reason === 'string' ? body.reason.slice(0, 500) : 'Cancelled by partner',
                recovery_url: null,
            }).eq('id', live.id)

            // Entitlement is deliberately UNTOUCHED. They paid to
            // current_period_end and keep Pro until then; the resolver drops them
            // to free limits on its own afterwards. Revoking on cancel would
            // charge for a month and take it back the same day.
            return json({
                success: true,
                status: 'CANCELLED',
                access_until: live.current_period_end,
            })
        }

        // ====================================================================
        // START — customer + SAVE session
        // ====================================================================
        if (action === 'start') {
            const interval = body?.billing_interval === 'YEAR' ? 'YEAR' : 'MONTH'

            const { data: plan } = await admin
                .from('partner_plans')
                .select('code, price_monthly, price_annual, currency')
                .eq('code', PLAN_CODE)
                .single()
            if (!plan) return json({ error: 'Plan not configured' }, 500)

            const amount = Number(interval === 'YEAR' ? plan.price_annual : plan.price_monthly)
            if (!amount || amount <= 0) {
                return json({ error: 'Pro is not priced yet.' }, 409)
            }

            // One live subscription per partner is enforced by a partial unique
            // index; check first so the partner gets a sentence instead of a
            // constraint violation.
            const { data: existing } = await admin
                .from('partner_subscriptions')
                .select('id, status, action_url')
                .eq('partner_id', partner.id)
                .in('status', ['PENDING', 'REQUIRES_ACTION', 'ACTIVE'])
                .maybeSingle()
            // An existing live subscription is NOT an error -- it is a card
            // replacement. Reuse the row so the plan, and its billing anchor,
            // survive.
            const replacingCard = !!(existing && existing.xendit_plan_id)

            // Reuse the Xendit customer across attempts — a partner who fails at
            // the card step twice should not accumulate customer records.
            const { data: priorWithCustomer } = await admin
                .from('partner_subscriptions')
                .select('xendit_customer_id')
                .eq('partner_id', partner.id)
                .not('xendit_customer_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            let customerId = priorWithCustomer?.xendit_customer_id as string | undefined

            if (!customerId) {
                const custRes = await fetch('https://api.xendit.co/customers', {
                    method: 'POST',
                    headers: xenditHeaders(xenditKey),
                    body: JSON.stringify({
                        reference_id: `partner_${partner.id}`,
                        type: 'BUSINESS',
                        business_detail: { business_name: partner.business_name || 'HangHut Partner' },
                        email: user.email,
                    }),
                })
                const custBody = await custRes.text()
                if (!custRes.ok) {
                    console.error('Xendit customer create failed:', custBody)
                    return json({ error: 'Could not start billing setup.' }, 502)
                }
                customerId = JSON.parse(custBody).id
            }

            // Attempt counter: a dead plan keeps its reference_id at Xendit
            // forever, so a retry after a declined card MUST present a new one.
            // A card replacement keeps the original reference -- same plan.
            let attempt: number
            let referenceId: string
            if (replacingCard) {
                attempt = existing.attempt
                referenceId = existing.reference_id
            } else {
                const { count } = await admin
                    .from('partner_subscriptions')
                    .select('id', { count: 'exact', head: true })
                    .eq('partner_id', partner.id)
                attempt = (count ?? 0) + 1
                referenceId = `pro_${partner.id}_${attempt}`
            }

            // SAVE session: amount MUST be 0, and PAYMENT_LINK gives us Xendit's
            // hosted card page — no card fields, and no PCI surface, on our side.
            const sessionRes = await fetch('https://api.xendit.co/sessions', {
                method: 'POST',
                headers: xenditHeaders(xenditKey),
                body: JSON.stringify({
                    reference_id: `${referenceId}_save`,
                    session_type: 'SAVE',
                    mode: 'PAYMENT_LINK',
                    amount: 0,
                    currency: plan.currency || 'PHP',
                    country: 'PH',
                    customer_id: customerId,
                    // CARDS ONLY, by decision. Xendit can only tokenize OVO,
                    // ShopeePay, GrabPay and PayMaya among e-wallets -- GCash,
                    // the one most PH organizers actually use, cannot be
                    // tokenized at all. Rather than offer a confusing partial
                    // set of wallets, recurring billing is card-only. This also
                    // removes the e-wallet account-linking (AUTH) round trip.
                    allowed_payment_channels: ['CARDS'],
                    success_return_url: `${appUrl}/organizer/settings/billing?status=saved`,
                    cancel_return_url: `${appUrl}/organizer/settings/billing?status=cancelled`,
                    description: `HangHut Pro — save payment method`,
                }),
            })
            const sessionRaw = await sessionRes.text()
            if (!sessionRes.ok) {
                console.error('Xendit SAVE session failed:', sessionRaw)
                return json({ error: 'Could not start billing setup.' }, 502)
            }
            const session = JSON.parse(sessionRaw)

            if (replacingCard) {
                return json({
                    success: true,
                    mode: 'replace_card',
                    subscription_id: existing.id,
                    payment_session_id: session.payment_session_id ?? session.id,
                    payment_link_url: session.payment_link_url,
                })
            }

            // Clear any stale unfinished attempt so the partial unique index
            // (one live row per partner) does not reject this insert.
            if (existing) {
                await admin.from('partner_subscriptions')
                    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(),
                              cancel_reason: 'Superseded by a new signup attempt' })
                    .eq('id', existing.id)
            }

            const { data: sub, error: insertError } = await admin
                .from('partner_subscriptions')
                .insert({
                    partner_id: partner.id,
                    plan_code: PLAN_CODE,
                    billing_interval: interval,
                    amount,
                    currency: plan.currency || 'PHP',
                    xendit_customer_id: customerId,
                    reference_id: referenceId,
                    attempt,
                    status: 'PENDING',
                })
                .select('id')
                .single()

            if (insertError) {
                console.error('subscription insert failed:', insertError)
                return json({ error: 'Could not start billing setup.' }, 500)
            }

            return json({
                success: true,
                mode: 'new',
                subscription_id: sub.id,
                payment_session_id: session.payment_session_id ?? session.id,
                payment_link_url: session.payment_link_url,
            })
        }

        // ====================================================================
        // ACTIVATE — read the token, create the recurring plan
        // ====================================================================
        const subscriptionId = body?.subscription_id
        const sessionId = body?.payment_session_id
        if (!subscriptionId || !sessionId) {
            return json({ error: 'subscription_id and payment_session_id are required' }, 400)
        }

        const { data: sub } = await admin
            .from('partner_subscriptions')
            .select('*')
            .eq('id', subscriptionId)
            .eq('partner_id', partner.id)   // ownership, not just existence
            .maybeSingle()
        if (!sub) return json({ error: 'Subscription not found' }, 404)
        // NOT short-circuited on ACTIVE. An active subscription reaching this
        // point is a card replacement, which is exactly when a partner most needs
        // it to work -- their card is failing and their access is running out.

        // The token only exists once the partner has completed the hosted page,
        // so this is read back from Xendit rather than trusted from the client.
        const sessRes = await fetch(`https://api.xendit.co/sessions/${sessionId}`, {
            headers: xenditHeaders(xenditKey),
        })
        const sessRaw = await sessRes.text()
        if (!sessRes.ok) {
            console.error('Xendit session fetch failed:', sessRaw)
            return json({ error: 'Could not confirm your payment method.' }, 502)
        }
        const session = JSON.parse(sessRaw)
        const paymentTokenId = session.payment_token_id
        if (!paymentTokenId) {
            return json({ error: 'No payment method was saved. Please try again.', code: 'NO_TOKEN' }, 409)
        }

        // ---- CARD REPLACEMENT: patch the token onto the existing plan ----
        // PATCH keeps the plan, its anchor date and its cycle history. Creating a
        // second plan would re-anchor billing and charge them again this month.
        if (sub.xendit_plan_id) {
            const patchRes = await fetch(`https://api.xendit.co/recurring/plans/${sub.xendit_plan_id}`, {
                method: 'PATCH',
                headers: xenditHeaders(xenditKey),
                // payment_tokens must have at least one entry — an empty array is
                // rejected outright.
                body: JSON.stringify({ payment_tokens: [{ payment_token_id: paymentTokenId, rank: 1 }] }),
            })
            const patchRaw = await patchRes.text()
            if (!patchRes.ok) {
                console.error('Xendit plan PATCH failed:', patchRaw)
                return json(mapXenditError(patchRaw, 'Could not update your card.'), 502)
            }
            await admin.from('partner_subscriptions').update({
                consecutive_failures: 0,
                last_failure_code: null,
            }).eq('id', sub.id)
            return json({ success: true, mode: 'replace_card', status: sub.status })
        }

        // ---- NEW PLAN ----
        const { data: anchorRow } = await admin.rpc('pro_anchor_date')
        const anchorDate = anchorRow as unknown as string

        const planRes = await fetch('https://api.xendit.co/recurring/plans', {
            method: 'POST',
            headers: xenditHeaders(xenditKey),
            body: JSON.stringify({
                reference_id: sub.reference_id,
                customer_id: sub.xendit_customer_id,
                currency: sub.currency,
                amount: Number(sub.amount),
                schedule: {
                    interval: sub.billing_interval,
                    interval_count: 1,
                    anchor_date: new Date(`${anchorDate}T00:00:00Z`).toISOString(),
                    total_recurrence: null,           // runs until cancelled
                    retry_interval: 'DAY',
                    retry_interval_count: 3,
                    total_retry: 3,                    // ≈9 days of grace
                    failed_attempt_notifications: [1, 3],
                },
                payment_tokens: [{ payment_token_id: paymentTokenId, rank: 1 }],
                // Charge now. NOTE: if this first charge fails Xendit marks the
                // plan INACTIVE immediately — the retry schedule protects later
                // cycles, never the signup charge. Handled below.
                immediate_payment: true,
                failed_cycle_action: 'RESUME',
                notification_channels: ['EMAIL'],
                payment_link_for_failed_attempt: true,
                description: `HangHut Pro — ${sub.billing_interval === 'YEAR' ? 'annual' : 'monthly'}`,
                items: [{
                    reference_id: 'hanghut_pro',
                    type: 'DIGITAL_SERVICE',
                    name: 'HangHut Pro',
                    net_unit_amount: Number(sub.amount),
                    quantity: 1,
                    category: 'Software',
                }],
            }),
        })

        const planRaw = await planRes.text()
        if (!planRes.ok) {
            console.error('Xendit recurring plan failed:', planRaw)
            const mapped = mapXenditError(planRaw, 'Could not start the subscription.')
            await admin.from('partner_subscriptions')
                .update({ status: 'INACTIVE', last_failure_code: mapped.code ?? 'PLAN_CREATE_FAILED' })
                .eq('id', sub.id)
            return json(mapped, 502)
        }

        const plan = JSON.parse(planRaw)
        const status = String(plan.status || 'PENDING').toUpperCase()
        // Cards-only means the e-wallet linking step should never appear. Kept
        // as a defensive branch rather than deleted: a card can still be asked
        // for a 3DS step-up, and silently dropping an action Xendit gave us
        // would strand the partner on a plan that never activates.
        const authAction = Array.isArray(plan.actions)
            ? plan.actions.find((a: any) => String(a.action).toUpperCase() === 'AUTH')
            : null

        await admin.from('partner_subscriptions').update({
            xendit_plan_id: plan.id,
            status,
            action_url: authAction?.url ?? null,
            anchor_date: anchorDate,
        }).eq('id', sub.id)

        // Entitlement is NOT flipped here. The webhook is the only thing that
        // marks a partner paid, because only Xendit knows the money moved --
        // and a plan can come back ACTIVE here and still fail its first charge.
        return json({
            success: true,
            status,
            action_url: authAction?.url ?? null,
            plan_id: plan.id,
        })

    } catch (error) {
        console.error('create-partner-subscription error:', error)
        return json({ error: (error as Error).message || 'Internal Server Error' }, 500)
    }
})
