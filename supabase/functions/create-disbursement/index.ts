import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Authoritative transfer fee (₱), charged to the ORGANIZER's wallet on top of the
// refund. Keep in sync with src/lib/organizer/disbursement-fees.ts (frontend estimate)
// and the account's real Xendit disbursement pricing. Channel codes are Xendit's
// (same as the payout tab's PHILIPPINE_BANKS): e-wallets are a flat low fee, banks
// (PESONet) run higher so we charge the safe upper estimate.
const EWALLET_CHANNELS = new Set(['PH_GCASH', 'PH_PAYMAYA', 'PH_GRABPAY', 'PH_COINS'])
const EWALLET_FEE = 10
const BANK_FEE = 15
function feeFor(channel: string): number {
    return EWALLET_CHANNELS.has(channel) ? EWALLET_FEE : BANK_FEE
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // @ts-ignore
        const sbUrl = Deno.env.get('SUPABASE_URL');
        // @ts-ignore
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        // @ts-ignore
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        // @ts-ignore
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY');

        if (!sbUrl || !sbAnonKey || !sbServiceKey || !xenditKey) {
            throw new Error('Missing required environment configuration');
        }

        const supabaseClient = createClient(sbUrl, sbAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } },
        })
        const supabaseAdmin = createClient(sbUrl, sbServiceKey)

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) {
            return json({ error: 'Unauthorized' }, 401)
        }

        const body = await req.json()
        const { intent_id, amount, channel, account_number, account_name, reason } = body

        // ---- Validate input ----
        if (!intent_id || !channel || !account_number || !account_name) {
            return json({ error: 'Missing intent_id, channel, account_number or account_name', code: 'MISSING_FIELD' }, 400)
        }
        const channelCode = String(channel).toUpperCase()
        const reqAmount = Number(amount)
        if (!Number.isFinite(reqAmount) || reqAmount <= 0) {
            return json({ error: 'Invalid refund amount', code: 'INVALID_AMOUNT' }, 400)
        }

        // ---- Load intent + verify organizer ownership ----
        const { data: intent, error: intentError } = await supabaseClient
            .from('purchase_intents')
            .select('*, event:events(title, organizer_id, organizer:partners!organizer_id(id, user_id, xendit_account_id, business_name))')
            .eq('id', intent_id)
            .single()

        if (intentError || !intent) {
            return json({ error: 'Purchase intent not found' }, 404)
        }

        const partner = (intent as any).event?.organizer
        const organizerUserId = partner?.user_id
        const isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.is_admin === true
        if (organizerUserId !== user.id && !isAdmin) {
            return json({ error: 'Unauthorized: only the event organizer can refund' }, 403)
        }

        // ---- Guards (mirror request-refund) ----
        if (intent.status === 'refunded') {
            return json({ error: 'This order has already been refunded', code: 'ALREADY_REFUNDED' }, 400)
        }
        if (intent.refunded_at) {
            return json({ error: 'A refund is already in progress for this order.', code: 'REFUND_IN_PROGRESS' }, 409)
        }
        if (intent.status !== 'completed') {
            return json({ error: `Order is not refundable (status: ${intent.status})`, code: 'NOT_COMPLETED' }, 400)
        }
        // v1: disbursement refunds are for QRPH only (the method the Refund API can't reverse).
        if (String(intent.payment_method || '').toLowerCase() !== 'qrph') {
            return json({ error: 'Disbursement refunds currently apply to QRPH payments only', code: 'NOT_QRPH' }, 400)
        }

        // ---- Amount can't exceed what's still refundable ----
        const already = Number(intent.refunded_amount || 0)
        const total = Number(intent.total_amount || 0)
        if (already + reqAmount > total) {
            return json({ error: 'Refund exceeds the order total', code: 'OVER_REFUND', total, already }, 400)
        }

        const fee = feeFor(channelCode)
        const debitTotal = reqAmount + fee
        const subAccountId = partner?.xendit_account_id || null
        const authHeader = `Basic ${btoa(xenditKey + ':')}`

        // ---- Balance check: sub-wallet must cover amount + transfer fee ----
        try {
            const balHeaders: Record<string, string> = { 'Authorization': authHeader }
            if (subAccountId) balHeaders['for-user-id'] = subAccountId
            const balRes = await fetch('https://api.xendit.co/balance', { headers: balHeaders })
            const balData = await balRes.json()
            const balance = Number(balData.balance ?? 0)
            if (balance < debitTotal) {
                return json({
                    error: 'Insufficient wallet balance to send this refund.',
                    code: 'INSUFFICIENT_BALANCE',
                    available_balance: balance,
                    required: debitTotal,
                    amount: reqAmount,
                    fee,
                    shortfall: debitTotal - balance,
                }, 402)
            }
        } catch (e) {
            console.warn('Balance check failed, proceeding cautiously...', e)
        }

        // ---- Acquire the pending lock ATOMICALLY: only set refunded_at if it's null.
        // This blocks the other refund paths (they treat refunded_at as REFUND_IN_PROGRESS)
        // and guards against two concurrent disbursements on the same order. ----
        const { data: locked, error: lockErr } = await supabaseAdmin
            .from('purchase_intents')
            .update({ refunded_at: new Date().toISOString(), refund_method: 'disbursement_pending' })
            .eq('id', intent_id)
            .is('refunded_at', null)
            .select('id')
            .maybeSingle()

        if (lockErr) {
            return json({ error: 'Failed to lock order for refund', details: lockErr.message }, 500)
        }
        if (!locked) {
            return json({ error: 'A refund is already in progress for this order.', code: 'REFUND_IN_PROGRESS' }, 409)
        }

        // Helper to release the lock if anything below fails.
        const releaseLock = async () => {
            await supabaseAdmin
                .from('purchase_intents')
                .update({ refunded_at: null, refund_method: null })
                .eq('id', intent_id)
                .eq('refund_method', 'disbursement_pending')
        }

        // ---- Record the pending disbursement (tracking + webhook mapping) ----
        const externalId = `refund-disb-${intent_id}-${Date.now()}`
        const { data: disb, error: disbErr } = await supabaseAdmin
            .from('refund_disbursements')
            .insert({
                purchase_intent_id: intent_id,
                partner_id: partner?.id,
                event_id: (intent as any).event_id,
                amount: reqAmount,
                fee,
                channel: channelCode,
                destination_account: String(account_number),
                destination_name: String(account_name),
                external_id: externalId,
                status: 'pending',
                created_by: user.id,
            })
            .select('id')
            .single()

        if (disbErr || !disb) {
            await releaseLock()
            return json({ error: 'Failed to record disbursement', details: disbErr?.message }, 500)
        }

        // ---- Fire the Xendit payout (Payouts API v2), same pattern as request-payout ----
        const payoutHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'Idempotency-key': externalId,
        }
        if (subAccountId) payoutHeaders['for-user-id'] = subAccountId

        let xenditData: any
        try {
            const res = await fetch('https://api.xendit.co/v2/payouts', {
                method: 'POST',
                headers: payoutHeaders,
                body: JSON.stringify({
                    reference_id: externalId,
                    channel_code: channelCode,
                    channel_properties: {
                        account_holder_name: String(account_name),
                        account_number: String(account_number),
                    },
                    amount: reqAmount,
                    currency: 'PHP',
                    description: `Refund for ${(intent as any).event?.title || 'order'}${reason ? ` — ${reason}` : ''}`,
                }),
            })
            xenditData = await res.json()
            if (!res.ok) {
                // Surface Xendit's specific reason (e.g. INVALID_ACCOUNT_NUMBER,
                // CHANNEL_CODE_NOT_SUPPORTED) so the organizer can actually fix it.
                const xMsg = xenditData?.message || `Xendit payout failed (${res.status})`
                const xCode = xenditData?.error_code ? ` [${xenditData.error_code}]` : ''
                throw new Error(`${xMsg}${xCode}`)
            }
        } catch (e: any) {
            // Roll back: mark the disbursement failed and release the lock so the
            // organizer can retry (nothing left our books).
            await supabaseAdmin.from('refund_disbursements')
                .update({ status: 'failed', failure_reason: e?.message || 'Payout request failed', updated_at: new Date().toISOString() })
                .eq('id', disb.id)
            await releaseLock()
            return json({ error: e?.message || 'Failed to send payout', code: 'PAYOUT_FAILED' }, 502)
        }

        // ---- Store Xendit's disbursement id for webhook matching ----
        await supabaseAdmin.from('refund_disbursements')
            .update({ xendit_disbursement_id: xenditData.id, updated_at: new Date().toISOString() })
            .eq('id', disb.id)

        // The ledger reversal + ticket voiding happens when the payout webhook confirms
        // COMPLETED (complete_disbursement_refund). We return the pending state here.
        return json({
            success: true,
            pending: true,
            disbursement_id: disb.id,
            xendit_disbursement_id: xenditData.id,
            amount: reqAmount,
            fee,
            debited: debitTotal,
            status: xenditData.status || 'PENDING',
        }, 200)

    } catch (error: any) {
        console.error('CRITICAL UNHANDLED ERROR:', error)
        return json({ error: 'Internal Server Error', message: error?.message }, 500)
    }

    function json(bodyObj: unknown, status = 200) {
        return new Response(JSON.stringify(bodyObj), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status,
        })
    }
})
