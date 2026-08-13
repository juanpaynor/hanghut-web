/**
 * ============================================================================
 * XENDIT WEBHOOK HANDLER — VERSION 36 (legacy account holder KYC + capabilities)
 * ============================================================================
 *
 * WHAT CHANGED (v35 → v36):
 * -------------------------
 * 1. Status is parsed from the EVENT NAME suffix (account_holder.kyc.status:passed)
 *    as a fallback — Xendit carries the decision in the event name, not always in
 *    the body. Failure detail also reads failure_reason / invalid_fields.
 * 2. Capabilities declined / resubmission_required now keep cards/gcash OFF and
 *    notify the organizer (per Xendit's webhook guide).
 *
 * WHAT CHANGED (v34 → v35):
 * -------------------------
 * 1. CAPABILITIES — on account_holder.kyc.status:passed we now PATCH the account
 *    holder to request Cards (PH_CARDS) + GCash capabilities (only allowed once
 *    KYC is PASSED). A new handler for account_holder.capabilities.status:live
 *    flips partners.xendit_cards_gcash_live so checkout starts offering them.
 *    (Pivoted off account_verification — capabilities only exist on the legacy
 *    account_holder object.)
 *
 * WHAT CHANGED (v33 → v34):
 * -------------------------
 * 1. ACCOUNT VERIFICATION — the KYC result handler now maps the
 *    account_verification status enum: PASSED → verified, FAILED → rejected,
 *    AWAITING_RESUBMISSION → resubmission_required,
 *    PENDING_VERIFICATION / VERIFICATION_IN_PROGRESS → submitted.
 * 2. Partner lookup falls back to partner_gateway_accounts
 *    (verification_id / account_id / account_holder_id), since
 *    account_verification callbacks reference the verification / sub-account id.
 * 3. Mirrors the raw status onto partner_gateway_accounts and notifies the
 *    organizer on resubmission_required too.
 *
 * WHAT CHANGED (v32 → v33):
 * -------------------------
 * 1. KYC RESULT HANDLER — Handles Xendit xenPlatform Account Holder KYC
 *    verification callbacks (account_holder.kyc.status / account.updated).
 *    Maps Xendit's KYC status to partners.kyc_status (submitted → verified /
 *    rejected), stores rejection reasons, and notifies the organizer (in-app
 *    notification + best-effort push). This closes the sub-merchant onboarding
 *    loop — without it kyc_status was stuck at 'submitted' forever.
 *    NOTE: requires kyc_status_type enum value 'submitted' and notifications
 *    types 'kyc_verified'/'kyc_rejected' (added via migration).
 *
 * WHAT CHANGED (v31 → v32):
 * -------------------------
 * 1. SEAT BOOKING — After issue_tickets succeeds, book_seats_for_intent flips
 *    the intent's assigned seats to 'booked' and clears their holds. Failure/
 *    expiry/cancellation paths call release_seats_for_intent so held seats
 *    return to the available pool.
 *
 * 2. BUGFIX — the atomic idempotency claim referenced `supabaseAdmin`, which
 *    was never defined in this function (crashed the event-ticket success
 *    path with a ReferenceError). Now uses `supabaseClient` (already service
 *    role).
 *
 * WHAT CHANGED (v30 → v31):
 * -------------------------
 * 1. QUEUE-BASED SIDE EFFECTS — Push notifications, ticket emails, experience
 *    emails, and partner webhooks are now enqueued to `payment_side_effects`
 *    (pgmq) instead of being called synchronously. This reduces webhook
 *    response time from ~5-8s to ~300ms and prevents rate-limit issues
 *    at scale (5,000+ concurrent purchases).
 *
 * 2. NEW CONSUMER — `process-payment-queue` edge function reads the queue
 *    every 10s via pg_cron and processes side-effects with automatic retry.
 *
 * WHAT CHANGED (v29 → v30):
 * -------------------------
 * 1. RE-ENABLED WEBHOOK AUTH — x-callback-token verification is now enforced.
 *    Without this, anyone could send a fake payload and get free tickets.
 *
 * 2. IDEMPOTENCY GUARD — If an intent is already 'completed' or 'refunded',
 *    duplicate webhooks from Xendit retries are safely ignored (return 200).
 *    Prevents duplicate tickets, transactions, emails, and push notifications.
 *
 * 3. ROBUST extractPaymentMethod() — handles all Xendit API payload shapes:
 *    - Invoice API:          data.payment_channel (flat string)
 *    - Payment Request API:  data.payment_method (nested object)
 *    - Sessions API:         data.payments[0].payment_method (array)
 *    - Legacy:               data.payment_method (string)
 *
 * 4. ATOMIC tickets_sold DECREMENT — replaced read-then-write pattern with
 *    direct SQL decrement to prevent race conditions on concurrent webhooks.
 *
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-token',
}

/**
 * Extract the human-readable payment method from any Xendit webhook payload.
 *
 * Xendit sends payment_method in different shapes depending on the API:
 *  - Invoice API:          data.payment_channel (string, e.g. "GCASH")
 *  - Payment Request API:  data.payment_method (object with type + channel)
 *  - Sessions API:         data.payments[0].payment_method (object inside payments array)
 *  - Legacy:               data.payment_method (plain string)
 */
function extractPaymentMethod(data: any): string {
    // 1. Invoice / Legacy — flat string field
    if (data.payment_channel) {
        return String(data.payment_channel).toUpperCase()
    }

    // 2. Direct channel_code at top level
    if (data.channel_code) {
        return String(data.channel_code).toUpperCase()
    }

    // Helper: pull channel_code out of a nested payment_method object
    function extractFromPmObject(pm: any): string | null {
        if (!pm || typeof pm !== 'object') return null
        return (
            pm.ewallet?.channel_code ||
            pm.direct_debit?.channel_code ||
            pm.card?.channel_code ||
            pm.qr_code?.channel_code ||
            pm.virtual_account?.channel_code ||
            pm.retail_outlet?.channel_code ||
            pm.over_the_counter?.channel_code ||
            pm.type ||  // fallback to generic type like "EWALLET"
            null
        )
    }

    // 3. Payment Request / direct payment_method object
    if (data.payment_method) {
        const pm = data.payment_method
        if (typeof pm === 'string') {
            return pm.toUpperCase()
        }
        const extracted = extractFromPmObject(pm)
        if (extracted) return String(extracted).toUpperCase()
    }

    // 4. Sessions API — payment method inside payments array
    if (data.payments && Array.isArray(data.payments) && data.payments.length > 0) {
        const firstPayment = data.payments[0]

        // payments[].payment_method
        if (firstPayment.payment_method) {
            const pm = firstPayment.payment_method
            if (typeof pm === 'string') return pm.toUpperCase()
            const extracted = extractFromPmObject(pm)
            if (extracted) return String(extracted).toUpperCase()
        }

        // payments[].channel_code (some payload shapes)
        if (firstPayment.channel_code) {
            return String(firstPayment.channel_code).toUpperCase()
        }

        // payments[].payment_channel
        if (firstPayment.payment_channel) {
            return String(firstPayment.payment_channel).toUpperCase()
        }
    }

    // 5. actions[] fallback (some Session payloads include this)
    if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
        const action = data.actions[0]
        if (action.payment_method) {
            const extracted = extractFromPmObject(action.payment_method)
            if (extracted) return String(extracted).toUpperCase()
        }
    }

    return 'UNKNOWN'
}

/**
 * Xendit PH processing fee (MDR) by method — fixed/published rates, so the fee for
 * a sale is deterministic from method + total charged. The PARTNER absorbs it.
 * Mirror of src/lib/payment/processing-fees.ts (keep in sync). Returns 0 for
 * FREE / UNKNOWN / unmapped methods (never guess a rate we don't have).
 */
const PROCESSING_FEE_RATES: Record<string, { pct: number; fixed?: number }> = {
    QRPH: { pct: 0.014 },
    GCASH: { pct: 0.023 },
    GRABPAY: { pct: 0.020 },
    SHOPEEPAY: { pct: 0.020 },
    PAYMAYA: { pct: 0.018 },
    MAYA: { pct: 0.018 },
    CARDS: { pct: 0.032, fixed: 10 },
    CARD: { pct: 0.032, fixed: 10 },
    CREDIT_CARD: { pct: 0.032, fixed: 10 },
}
function getProcessingFee(method: string | null | undefined, amount: number): number {
    if (!method || !amount || amount <= 0) return 0
    const r = PROCESSING_FEE_RATES[String(method).toUpperCase()]
    if (!r) return 0
    return Math.round((amount * r.pct + (r.fixed ?? 0)) * 100) / 100
}

serve(async (req) => {
    console.log('🚨 WEBHOOK RECEIVED - VERSION 33 (xenPlatform KYC RESULT) 🚨')

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Initialize Supabase client with service role (bypasses RLS)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // ==========================================
        // 🔒 WEBHOOK AUTH (v30: RE-ENABLED)
        // ==========================================
        // This verifies the request is genuinely from Xendit, NOT from an attacker.
        // This has NOTHING to do with user auth or guest checkout — it's server-to-server.
        const callbackToken = req.headers.get('x-callback-token')
        const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')

        console.log(`🔒 Auth: Header=${callbackToken ? 'Present' : 'Missing'}, Env=${webhookToken ? 'Present' : 'Missing'}`)

        if (!webhookToken) {
            console.error('CRITICAL: XENDIT_WEBHOOK_TOKEN is not set in environment variables')
            return new Response('Server Configuration Error', { status: 500 })
        }

        if (callbackToken !== webhookToken) {
            console.error('🚫 WEBHOOK AUTH FAILED: Invalid or missing x-callback-token')
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Parse webhook payload
        const payload = await req.json()
        console.log('Xendit webhook received:', JSON.stringify(payload, null, 2))

        const eventType = payload.event || payload.type

        // Handle successful payments (Payment Request, Payment Session, Invoice)
        if (['payment.capture', 'payment_session.completed', 'payment.succeeded', 'invoice.paid'].includes(eventType)) {
            const data = payload.data || payload; // Handle wrapped data

            const {
                reference_id, // v3 uses reference_id matching our external_id
                payment_request_id,
                payment_id,
                status,
                currency,
                payment_method,
                created,
                captures,
            } = data;

            // Use reference_id as the lookup key (this matches our xendit_external_id)
            const lookupId = reference_id || data?.external_id || payload.external_id;

            // Find purchase intent
            let { data: intent, error: intentError } = await supabaseClient
                .from('purchase_intents')
                .select('*, event:events(id, title, organizer_id, tickets_sold, venue_name, start_datetime, end_datetime, cover_image_url), user:users(id, email, full_name)')
                .eq('xendit_external_id', lookupId)
                .single()

            // Fallback: If not found by external ID, try lookup by metadata.intent_id (UUID)
            if (!intent && data.metadata?.intent_id) {
                console.log('Lookup by external_id failed, trying metadata.intent_id:', data.metadata.intent_id)

                // Simplified query without joins to avoid RLS issues
                const { data: fallbackIntent, error: fallbackError } = await supabaseClient
                    .from('purchase_intents')
                    .select('*')
                    .eq('id', data.metadata.intent_id)
                    .single()

                if (fallbackError) {
                    console.error('❌ Fallback lookup error:', fallbackError)
                }

                if (fallbackIntent) {
                    // Fetch related data separately (service role bypasses RLS better for direct queries)
                    const { data: event } = await supabaseClient
                        .from('events')
                        .select('id, title, organizer_id, tickets_sold, venue_name, start_datetime, end_datetime, cover_image_url')
                        .eq('id', fallbackIntent.event_id)
                        .single()

                    const { data: user } = await supabaseClient
                        .from('users')
                        .select('id, email, full_name')
                        .eq('id', fallbackIntent.user_id)
                        .maybeSingle()  // Use maybeSingle for guest checkouts (user_id might be null)

                    intent = { ...fallbackIntent, event, user }
                    intentError = null
                    console.log('✅ Found intent via fallback:', intent.id)
                }
            }

            if (intentError || !intent) {
                // Not a regular event ticket. Check if it's an experience booking!
                if (lookupId && lookupId.startsWith('exp_')) {
                    console.log(`🔍 Checking if ${lookupId} is an Experience Intent...`);
                    const { data: expIntent, error: expError } = await supabaseClient
                        .from('experience_purchase_intents')
                        .select('id, status')
                        .eq('xendit_external_id', lookupId)
                        .single()

                    if (expIntent) {
                        // ==========================================
                        // 🛡️ IDEMPOTENCY: Experience (v30)
                        // ==========================================
                        if (expIntent.status === 'completed' || expIntent.status === 'refunded') {
                            console.log(`⚡ Experience intent ${expIntent.id} already ${expIntent.status}, skipping duplicate webhook`)
                            return new Response(
                                JSON.stringify({ success: true, message: `Already ${expIntent.status}` }),
                                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                            )
                        }

                        console.log(`✅ Found Experience Intent: ${expIntent.id}. Confirming...`)
                        // Extract payment method using robust helper
                        const expMethod = extractPaymentMethod(data);
                        console.log(`💳 Experience Payment Method: ${expMethod}`);

                        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('confirm_experience_booking', {
                            p_intent_id: expIntent.id,
                            p_payment_method: expMethod,
                            p_xendit_id: data.id || data.payment_id || lookupId
                        });

                        if (rpcError) {
                            console.error('❌ Experience RPC Error:', rpcError)
                            throw new Error(rpcError.message)
                        }

                        console.log('🎉 Experience Booking Confirmed:', rpcResult)

                        // 📬 Enqueue experience confirmation email for async processing
                        try {
                            console.log('📬 Enqueuing experience confirmation email...')

                            const { data: fullExpIntent } = await supabaseClient
                                .from('experience_purchase_intents')
                                .select('*')
                                .eq('id', expIntent.id)
                                .single()

                            if (fullExpIntent) {
                                const { data: tableInfo } = await supabaseClient
                                    .from('tables')
                                    .select('title, location_name, host_id, image_url')
                                    .eq('id', fullExpIntent.table_id)
                                    .single()

                                let hostName = 'Host'
                                if (tableInfo?.host_id) {
                                    const { data: host } = await supabaseClient
                                        .from('users')
                                        .select('display_name, full_name')
                                        .eq('id', tableInfo.host_id)
                                        .single()
                                    hostName = host?.display_name || host?.full_name || 'Host'
                                }

                                let recipientEmail = fullExpIntent.guest_email
                                let recipientName = fullExpIntent.guest_name
                                if (!recipientEmail && fullExpIntent.user_id) {
                                    const { data: userInfo } = await supabaseClient
                                        .from('users')
                                        .select('email, display_name, full_name')
                                        .eq('id', fullExpIntent.user_id)
                                        .single()
                                    recipientEmail = userInfo?.email
                                    recipientName = recipientName || userInfo?.display_name || userInfo?.full_name
                                }

                                let experienceDate = fullExpIntent.created_at
                                if (fullExpIntent.schedule_id) {
                                    const { data: schedule } = await supabaseClient
                                        .from('experience_schedules')
                                        .select('start_time')
                                        .eq('id', fullExpIntent.schedule_id)
                                        .single()
                                    if (schedule) experienceDate = schedule.start_time
                                }

                                if (recipientEmail) {
                                    const { error: queueError } = await supabaseClient
                                        .rpc('pgmq_send', {
                                            queue_name: 'payment_side_effects',
                                            message: {
                                                type: 'send_experience_email',
                                                data: {
                                                    email: recipientEmail,
                                                    name: recipientName,
                                                    experience_title: tableInfo?.title || 'Experience',
                                                    experience_venue: tableInfo?.location_name || 'Venue',
                                                    experience_date: experienceDate,
                                                    host_name: hostName,
                                                    quantity: fullExpIntent.quantity || 1,
                                                    total_amount: fullExpIntent.total_amount,
                                                    transaction_ref: fullExpIntent.xendit_external_id || fullExpIntent.id,
                                                    payment_method: expMethod,
                                                    intent_id: fullExpIntent.id,
                                                    cover_image_url: tableInfo?.image_url,
                                                },
                                            },
                                        })
                                    if (queueError) {
                                        console.error('⚠️ Failed to enqueue experience email:', queueError)
                                    } else {
                                        console.log('📬 Experience confirmation email enqueued')
                                    }
                                }
                            }
                        } catch (emailErr) {
                            console.error('⚠️ Email enqueue failed (non-critical):', emailErr)
                        }

                        return new Response(JSON.stringify({ success: true, message: 'Experience confirmed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    }
                }

                // Not a ticket or experience. Check if it's a standalone merch order!
                // (mer_-prefixed reference_id — never collides with events/experiences.)
                if (lookupId && lookupId.startsWith('mer_')) {
                    console.log(`🔍 Checking if ${lookupId} is a Merch Order...`)
                    const { data: merchOrder } = await supabaseClient
                        .from('merch_orders')
                        .select('id, status')
                        .eq('xendit_external_id', lookupId)
                        .single()

                    if (merchOrder) {
                        // Idempotency: Xendit retries + fires concurrent events.
                        if (merchOrder.status === 'completed' || merchOrder.status === 'refunded') {
                            console.log(`⚡ Merch order ${merchOrder.id} already ${merchOrder.status}, skipping duplicate webhook`)
                            return new Response(JSON.stringify({ success: true, message: `Already ${merchOrder.status}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                        }

                        const merchMethod = extractPaymentMethod(data)
                        console.log(`💳 Merch Payment Method: ${merchMethod}`)

                        const { data: merchResult, error: merchError } = await supabaseClient.rpc('confirm_merch_order', {
                            p_order_id: merchOrder.id,
                            p_payment_method: merchMethod,
                            p_xendit_id: data.id || data.payment_id || lookupId,
                        })
                        if (merchError) {
                            console.error('❌ Merch RPC Error:', merchError)
                            throw new Error(merchError.message)
                        }

                        console.log('🎉 Merch Order Confirmed:', merchResult)
                        return new Response(JSON.stringify({ success: true, message: 'Merch order confirmed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    }
                }

                console.log('Purchase intent not found (likely a test webhook):', lookupId)
                // Return 200 to satisfy Xendit "Test and save" verification
                return new Response(JSON.stringify({ message: 'Webhook received but intent not found (Test passed)' }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            // ==========================================
            // 🛡️ ATOMIC IDEMPOTENCY CLAIM
            // ==========================================
            // Xendit retries webhooks up to 5x AND can fire concurrent executions.
            // A read-then-check guard has a race window — two executions both read
            // status='pending' before either writes. Fix: claim atomically by only
            // updating WHERE status NOT IN ('completed','refunded'). If 0 rows are
            // updated, another execution already claimed it → bail immediately.
            const capturedMethod = extractPaymentMethod(data);
            console.log(`💳 Extracted Payment Method: ${capturedMethod}`);
            console.log(`💳 Raw payment_method field:`, JSON.stringify(data.payment_method));
            console.log(`💳 Raw payments array:`, JSON.stringify(data.payments));
            console.log(`💳 Raw payment_channel:`, data.payment_channel);

            const { data: claimedRows, error: claimError } = await supabaseClient
                .from('purchase_intents')
                .update({
                    status: 'completed',
                    paid_at: data.updated || data.payments?.[0]?.created || new Date().toISOString(),
                    payment_method: capturedMethod,
                })
                .eq('id', intent.id)
                .not('status', 'in', '("completed","refunded")')
                .select('id')

            if (claimError || !claimedRows || claimedRows.length === 0) {
                // Another Xendit event already completed this intent. That earlier
                // event may not have carried the resolved channel (e.g.
                // payment_session.completed arrives before payment.succeeded), leaving
                // payment_method as a placeholder. If THIS event has a real method,
                // backfill it so QRPH/GCash/etc. isn't lost to the event race.
                if (capturedMethod && capturedMethod !== 'UNKNOWN') {
                    await supabaseClient
                        .from('purchase_intents')
                        .update({ payment_method: capturedMethod })
                        .eq('id', intent.id)
                        .or('payment_method.is.null,payment_method.in.(UNKNOWN,unknown,multiple)')

                    // The winning event may have inserted the transaction before the
                    // method was known, leaving processing_fee at 0 — and organizer_payout
                    // computed WITHOUT processing. Now that we have a real method, fill in
                    // the fee AND subtract it from the payout so the net stays accurate
                    // (only when still 0, to stay idempotent).
                    const backfillFee = getProcessingFee(capturedMethod, Number(intent.total_amount) || 0)
                    if (backfillFee > 0) {
                        const { data: tx } = await supabaseClient
                            .from('transactions')
                            .select('id, organizer_payout, payment_processing_fee')
                            .eq('purchase_intent_id', intent.id)
                            .eq('status', 'completed')
                            .maybeSingle()
                        if (tx && (tx.payment_processing_fee == null || Number(tx.payment_processing_fee) === 0)) {
                            await supabaseClient
                                .from('transactions')
                                .update({
                                    payment_processing_fee: backfillFee,
                                    organizer_payout: Math.round(Number(tx.organizer_payout) - backfillFee),
                                })
                                .eq('id', tx.id)
                        }
                    }
                }
                console.log(`⚡ Intent ${intent.id} already claimed by another execution — skipping`)
                return new Response(
                    JSON.stringify({ success: true, message: 'Already processed' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            console.log('Payment claimed and marked completed for intent:', intent.id)

            // Record transaction (Create transaction BEFORE tickets to ensure accounting)
            const { data: partner } = await supabaseClient
                .from('partners')
                .select('id, custom_percentage, fixed_fee_per_ticket, pass_fees_to_customer')
                .eq('id', intent.event.organizer_id)
                .single()

            // The whole platform take is the SINGLE value create-purchase-intent stored
            // on the intent (pct% of net + fixed×qty, one inline Xendit PLATFORM fee —
            // no split rules). Read it as the source of truth so the ledger can't drift
            // from what Xendit charged. `??` throughout so a deliberate 0% / ₱0 survives.
            const platformFeePercentage = intent.fee_percentage ?? partner?.custom_percentage ?? 2.0
            const net = Math.max(Number(intent.subtotal || 0) - Number(intent.discount_amount || 0), 0)
            const fixedFeePerTicket = partner?.fixed_fee_per_ticket ?? 15.0
            const totalFixedFee = fixedFeePerTicket * (intent.quantity || 1)
            const platformTake = intent.platform_fee != null
                ? Math.round(Number(intent.platform_fee))
                : Math.round(net * (platformFeePercentage / 100) + totalFixedFee)
            // Split the take into its % commission vs fixed booking-fee parts for the
            // ledger. fixed is an integer so platformFee + fixedFee === the take exactly
            // (no drift), and the two are shown as separate fee lines without overlap.
            const platformFee = Math.max(platformTake - totalFixedFee, 0)
            // Xendit charges 12% VAT on the platform take, debited from the sub-wallet
            // (organizer-borne, goes to Xendit/BIR — not HangHut revenue).
            const feeVat = Math.round(platformTake * 0.12)
            // Xendit processing fee (organizer-absorbed) — from the resolved method + the
            // TOTAL charged. 0 when the method is still UNKNOWN; the backfill branch fills
            // it in (and adjusts organizer_payout) once resolved.
            const processingFee = getProcessingFee(capturedMethod, Number(intent.total_amount) || 0)
            // TRUE net the organizer receives = what landed in the sub-wallet
            // (total_amount) minus the take, its VAT, and processing. Matches the actual
            // Xendit wallet credit so the ledger and payout balance agree.
            const passFees = partner?.pass_fees_to_customer === true
            const organizerPayout = Math.round(Number(intent.total_amount || 0) - platformTake - feeVat - processingFee)

            console.log(`💰 Fee calc: net=${net}, take=${platformTake} (pct=${platformFee}, fixed=${totalFixedFee}), vat=${feeVat}, processing=${processingFee}, total=${intent.total_amount}, passFees=${passFees}, organizerPayout=${organizerPayout}`)

            const { error: txError } = await supabaseClient
                .from('transactions')
                .insert({
                    purchase_intent_id: intent.id,
                    event_id: intent.event_id,
                    partner_id: intent.event.organizer_id,
                    user_id: intent.user_id || null,
                    gross_amount: intent.subtotal,
                    platform_fee: platformFee,
                    payment_processing_fee: processingFee,
                    fixed_fee: totalFixedFee,
                    vat: feeVat,
                    organizer_payout: organizerPayout,
                    fee_percentage: platformFeePercentage,
                    fee_basis: (partner?.custom_percentage != null && partner.custom_percentage !== 4.0) ? 'custom' : 'standard',
                    xendit_transaction_id: payment_request_id || payment_id || data.id,
                    status: 'completed',
                    attribution: (intent as any).attribution ?? null,
                })

            if (txError) {
                console.error(`❌ Transaction insert failed for intent ${intent.id}:`, txError)
            } else {
                console.log(`✅ Recorded transaction for intent ${intent.id}`)
            }

            // Issue tickets using the RPC function (Single Source of Truth)
            console.log(`🎟️ Issuing tickets for intent ${intent.id} via RPC...`)
            const { data: generatedTickets, error: issueError } = await supabaseClient.rpc('issue_tickets', {
                p_intent_id: intent.id,
                p_registration_id: intent.metadata?.registration_id ?? null,
            })

            if (issueError) {
                console.error('❌ Failed to issue tickets:', issueError)
            } else {
                console.log(`✅ Successfully issued ${generatedTickets?.length ?? 0} tickets`)

                // ==========================================
                // 💺 BOOK ASSIGNED SEATS (v32)
                // ==========================================
                // Seated events: flip the intent's held seats to 'booked' and clear
                // their holds. No-op (returns 0) for GA intents without seats.
                const { data: bookedCount, error: bookError } = await supabaseClient.rpc('book_seats_for_intent', {
                    p_intent_id: intent.id,
                })
                if (bookError) {
                    console.error('⚠️ Failed to book seats:', bookError)
                } else if (bookedCount > 0) {
                    console.log(`💺 Booked ${bookedCount} seats for intent ${intent.id}`)
                }

                // ==========================================
                // 📬 ENQUEUE SIDE-EFFECTS (v31: QUEUE-BASED)
                // ==========================================
                // Instead of calling functions synchronously (which blocks the
                // webhook response for 5-8s), we enqueue messages for async
                // processing. This lets us return 200 to Xendit in ~300ms.

                const sideEffects: any[] = []

                // 1. Push notification to organizer
                const buyerName = intent.guest_name || intent.user?.full_name || 'Someone';
                const eventTitle = intent.event?.title || 'your event';
                const qty = intent.quantity || 1;

                const { data: partnerData } = await supabaseClient
                    .from('partners')
                    .select('user_id')
                    .eq('id', intent.event.organizer_id)
                    .single();

                if (partnerData?.user_id) {
                    sideEffects.push({
                        type: 'send_push',
                        data: {
                            user_id: partnerData.user_id,
                            title: '🎟️ New Ticket Purchase!',
                            body: `${buyerName} just bought ${qty} ticket${qty > 1 ? 's' : ''} for ${eventTitle}`,
                            image: intent.event?.cover_image_url || null,
                            data: { type: 'ticket_purchase', event_id: intent.event_id },
                        },
                    })
                }

                // 2. Partner webhook (ticket.purchased)
                sideEffects.push({
                    type: 'partner_webhook',
                    data: {
                        event_type: 'ticket.purchased',
                        event_id: intent.event_id,
                        payload: {
                            ticket_count: intent.quantity,
                            total_amount: intent.total_amount,
                            payment_method: capturedMethod,
                            customer: {
                                name: intent.guest_name || intent.user?.full_name,
                                email: intent.guest_email || intent.user?.email,
                            },
                        },
                    },
                })

                // 3. Ticket confirmation email
                const recipientEmail = intent.guest_email || intent.user?.email
                const recipientName = intent.guest_name || intent.user?.full_name

                if (recipientEmail && generatedTickets && generatedTickets.length > 0) {
                    sideEffects.push({
                        type: 'send_ticket_email',
                        data: {
                            email: recipientEmail,
                            name: recipientName,
                            event_title: intent.event?.title || 'Event',
                            event_venue: intent.event?.venue_name || 'Venue',
                            event_date: intent.event?.start_datetime,
                            event_end_date: intent.event?.end_datetime,
                            event_cover_image: intent.event?.cover_image_url,
                            ticket_quantity: intent.quantity,
                            total_amount: intent.total_amount,
                            transaction_ref: intent.xendit_external_id || intent.id,
                            payment_method: capturedMethod,
                            tickets: generatedTickets,
                        },
                    })
                }

                // Enqueue all side-effects in a single batch
                for (const effect of sideEffects) {
                    const { error: queueError } = await supabaseClient
                        .rpc('pgmq_send', {
                            queue_name: 'payment_side_effects',
                            message: effect,
                        })
                    if (queueError) {
                        console.error(`⚠️ Failed to enqueue ${effect.type}:`, queueError)
                    }
                }
                console.log(`📬 Enqueued ${sideEffects.length} side-effects for async processing`)
            }

            return new Response(
                JSON.stringify({ success: true, tickets_issued: intent.quantity }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Handle payment failure
        if (
            eventType === 'payment.failed' ||
            eventType === 'payment_request.expired' ||
            eventType === 'payment_session.expired' ||
            eventType === 'payment_session.cancelled'
        ) {
            const external_id = payload.external_id || payload.data?.reference_id || payload.reference_id

            const { data: intent } = await supabaseClient
                .from('purchase_intents')
                .select('*, event:events(tickets_sold)')
                .eq('xendit_external_id', external_id)
                .single()

            if (intent) {
                // Idempotency: skip if already handled
                if (intent.status === 'failed' || intent.status === 'expired' || intent.status === 'completed') {
                    console.log(`⚡ Intent ${intent.id} already ${intent.status}, skipping`)
                    return new Response(
                        JSON.stringify({ success: true, message: `Already ${intent.status}` }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                console.log('Payment failed/expired for intent:', intent.id)

                // Mark intent as failed/expired
                await supabaseClient
                    .from('purchase_intents')
                    .update({ status: eventType === 'payment.failed' ? 'failed' : 'expired' })
                    // payment_session.expired / payment_session.cancelled → expired
                    .eq('id', intent.id)

                // Release reserved capacity (atomic decrement to avoid race conditions)
                await supabaseClient.rpc('atomic_decrement_tickets_sold', {
                    p_event_id: intent.event_id,
                    p_quantity: intent.quantity
                }).then(({ error }) => {
                    if (error) {
                        // Fallback to direct update if RPC doesn't exist yet
                        console.warn('⚠️ atomic_decrement_tickets_sold RPC not found, using direct update:', error.message)
                        return supabaseClient
                            .from('events')
                            .update({ tickets_sold: Math.max(0, intent.event.tickets_sold - intent.quantity) })
                            .eq('id', intent.event_id)
                    }
                })

                // 💺 Release any held seats back to the available pool (v32)
                const { data: releasedCount, error: releaseError } = await supabaseClient.rpc('release_seats_for_intent', {
                    p_intent_id: intent.id,
                })
                if (releaseError) {
                    console.error('⚠️ Failed to release seats:', releaseError)
                } else if (releasedCount > 0) {
                    console.log(`💺 Released ${releasedCount} held seats for intent ${intent.id}`)
                }

                console.log(`❌ Released ${intent.quantity} tickets for intent ${intent.id}`)
            }

            return new Response(
                JSON.stringify({ success: true, capacity_released: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Handle Payout/Disbursement Events (V2)
        if (['payout.succeeded', 'payout.failed', 'DISBURSEMENT.UPDATED'].includes(eventType)) {
            const data = payload.data || payload;
            const reference_id = data.reference_id || data.external_id; // V2 uses reference_id, Legacy uses external_id

            console.log(`Processing Payout Event: ${eventType} for ${reference_id}`);

            // --- Refund disbursements (QRPH/bank-transfer REFUNDS) take precedence ---
            // These reuse the same payout webhook. Match by Xendit disbursement id, then
            // by our reference_id (external_id). On COMPLETED we do the ledger reversal +
            // void tickets; on FAILED we release the pending lock so the organizer retries.
            const disbFilters: string[] = [];
            if (data.id) disbFilters.push(`xendit_disbursement_id.eq.${data.id}`);
            if (reference_id) disbFilters.push(`external_id.eq.${reference_id}`);
            if (disbFilters.length) {
                const { data: refundDisb } = await supabaseClient
                    .from('refund_disbursements')
                    .select('id, status, purchase_intent_id')
                    .or(disbFilters.join(','))
                    .maybeSingle();

                if (refundDisb) {
                    const succeeded = eventType === 'payout.succeeded' || data.status === 'COMPLETED';
                    const failed = eventType === 'payout.failed' || data.status === 'FAILED';

                    if (succeeded) {
                        const { data: rpcRes, error: rpcErr } = await supabaseClient
                            .rpc('complete_disbursement_refund', { p_disbursement_id: refundDisb.id });
                        if (rpcErr) {
                            console.error(`❌ complete_disbursement_refund failed for ${refundDisb.id}:`, rpcErr);
                            return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500, headers: corsHeaders });
                        }
                        console.log(`✅ Refund disbursement ${refundDisb.id} completed:`, rpcRes);
                        // Notify the customer their refund is on the way (best-effort — never fail the webhook).
                        try {
                            await supabaseClient.functions.invoke('send-transaction-email', {
                                body: { type: 'refund_initiated', intent_id: refundDisb.purchase_intent_id },
                            });
                        } catch (emailErr) {
                            console.warn('Refund disbursement email failed:', emailErr);
                        }
                    } else if (failed) {
                        await supabaseClient.rpc('fail_disbursement_refund', {
                            p_disbursement_id: refundDisb.id,
                            p_reason: data.failure_code || data.failure_reason || 'Payout failed',
                        });
                        console.log(`↩️ Refund disbursement ${refundDisb.id} failed — lock released`);
                    } else {
                        console.log(`Refund disbursement ${refundDisb.id} event ${eventType} (status ${data.status}) — no-op`);
                    }

                    return new Response(
                        JSON.stringify({ success: true, refund_disbursement: refundDisb.id }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }

            // Map status
            let newStatus = 'processing';
            if (eventType === 'payout.succeeded' || data.status === 'COMPLETED') {
                newStatus = 'completed';
            } else if (eventType === 'payout.failed' || data.status === 'FAILED') {
                newStatus = 'failed';
            }

            // Update payouts table
            const updatePayload: any = { status: newStatus };
            if (newStatus === 'completed') {
                updatePayload.completed_at = new Date().toISOString();
            }

            const { error: updateError } = await supabaseClient
                .from('payouts')
                .update(updatePayload)
                .eq('id', reference_id);

            if (updateError) {
                console.error(`❌ Failed to update payout ${reference_id}:`, updateError);
                return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders });
            }

            // 🔧 FIX: When payout fails, unlink transactions so funds become available again
            if (newStatus === 'failed') {
                console.log(`🔓 Unlinking transactions from failed payout ${reference_id}...`);

                const { error: unlinkEventErr } = await supabaseClient
                    .from('transactions')
                    .update({ payout_id: null })
                    .eq('payout_id', reference_id);

                if (unlinkEventErr) {
                    console.error(`⚠️ Failed to unlink event transactions:`, unlinkEventErr);
                }

                const { error: unlinkExpErr } = await supabaseClient
                    .from('experience_transactions')
                    .update({ payout_id: null })
                    .eq('payout_id', reference_id);

                if (unlinkExpErr) {
                    console.error(`⚠️ Failed to unlink experience transactions:`, unlinkExpErr);
                }

                console.log(`✅ Transactions unlinked from failed payout ${reference_id}`);
            }

            console.log(`✅ Payout ${reference_id} updated to ${newStatus}`);

            return new Response(
                JSON.stringify({ success: true, status: newStatus }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Handle Refund Events
        if (['refund.succeeded', 'refund.failed'].includes(eventType)) {
            const data = payload.data || payload;
            console.log(`Processing Refund Event: ${eventType}`, data);

            // Look for intent_id in metadata
            const intentId = data.metadata?.intent_id;

            if (!intentId) {
                console.error('Refund event missing metadata.intent_id');
                return new Response(JSON.stringify({ message: 'Missing intent_id in metadata' }), { status: 200, headers: corsHeaders });
            }

            if (eventType === 'refund.succeeded') {
                const intentType = data.metadata?.intent_type || 'event';

                if (intentType === 'experience') {
                    // --- EXPERIENCE REFUND LOGIC ---

                    // Idempotency check
                    const { data: expCheck } = await supabaseClient
                        .from('experience_purchase_intents')
                        .select('status')
                        .eq('id', intentId)
                        .single()

                    if (expCheck?.status === 'refunded') {
                        console.log(`⚡ Experience intent ${intentId} already refunded, skipping`)
                        return new Response(
                            JSON.stringify({ success: true, message: 'Already refunded' }),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        )
                    }

                    // 1. Mark Experience Intent as Refunded
                    await supabaseClient
                        .from('experience_purchase_intents')
                        .update({ status: 'refunded' })
                        .eq('id', intentId);

                    // 2. Retrieve Intent Details
                    const { data: intent } = await supabaseClient
                        .from('experience_purchase_intents')
                        .select('*, experience:tables!table_id(host_id, partner_id)')
                        .eq('id', intentId)
                        .single();

                    if (intent) {
                        // 3. Record Negative Transaction (Accounting)
                        const refundAmount = data.amount || intent.total_amount;

                        const { data: origTx } = await supabaseClient
                            .from('experience_transactions')
                            .select('*')
                            .eq('purchase_intent_id', intentId)
                            .maybeSingle();

                        if (origTx) {
                            const ratio = refundAmount / intent.total_amount;
                            await supabaseClient.from('experience_transactions').insert({
                                purchase_intent_id: intent.id,
                                table_id: intent.table_id,
                                host_id: intent.experience.host_id,
                                user_id: intent.user_id,
                                gross_amount: -(origTx.gross_amount * ratio),
                                platform_fee: -(origTx.platform_fee * ratio),
                                host_payout: -(origTx.host_payout * ratio),
                                xendit_transaction_id: data.id, // Refund ID
                                status: 'refunded',
                                partner_id: origTx.partner_id // Keep partner_id link
                            });
                        }
                        console.log(`✅ Experience refund processed for intent ${intentId}`);
                    }
                } else {
                    // --- EVENT REFUND LOGIC ---

                    // Idempotency check
                    const { data: eventCheck } = await supabaseClient
                        .from('purchase_intents')
                        .select('status')
                        .eq('id', intentId)
                        .single()

                    if (eventCheck?.status === 'refunded') {
                        console.log(`⚡ Intent ${intentId} already refunded, skipping`)
                        return new Response(
                            JSON.stringify({ success: true, message: 'Already refunded' }),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        )
                    }

                    // 1. Mark Purchase Intent as Refunded
                    await supabaseClient
                        .from('purchase_intents')
                        .update({ status: 'refunded' })
                        .eq('id', intentId);

                    // 2. Retrieve Intent Details for Accounting
                    const { data: intent } = await supabaseClient
                        .from('purchase_intents')
                        .select('*, event:events(organizer_id, tickets_sold)')
                        .eq('id', intentId)
                        .single();

                    if (intent) {
                        // 3. Release Capacity (atomic decrement)
                        await supabaseClient.rpc('atomic_decrement_tickets_sold', {
                            p_event_id: intent.event_id,
                            p_quantity: intent.quantity
                        }).then(({ error }) => {
                            if (error) {
                                console.warn('⚠️ atomic_decrement_tickets_sold RPC not found, using direct update:', error.message)
                                return supabaseClient.from('events')
                                    .update({ tickets_sold: Math.max(0, intent.event.tickets_sold - intent.quantity) })
                                    .eq('id', intent.event_id)
                            }
                        })

                        // 💺 Free the refunded seats (v32): booked → available
                        const { data: refundedSeats, error: seatFreeError } = await supabaseClient
                            .from('tickets')
                            .select('seat_id')
                            .eq('purchase_intent_id', intentId)
                            .not('seat_id', 'is', null)
                        if (!seatFreeError && refundedSeats && refundedSeats.length > 0) {
                            const seatIds = refundedSeats.map((t: any) => t.seat_id)
                            await supabaseClient
                                .from('seats')
                                .update({ status: 'available' })
                                .in('id', seatIds)
                            console.log(`💺 Freed ${seatIds.length} refunded seats for intent ${intentId}`)
                        }

                        // 4. Record Negative Transaction (Accounting)
                        const { data: partner } = await supabaseClient
                            .from('partners')
                            .select('custom_percentage')
                            .eq('id', intent.event.organizer_id)
                            .single();

                        // Use ?? for null-coalescing (0% is valid)
                        const platformFeePercentage = partner?.custom_percentage ?? 2.0;
                        const refundAmount = data.amount || intent.total_amount;

                        // Look up the original transaction for accurate reversal
                        const { data: origTx } = await supabaseClient
                            .from('transactions')
                            .select('platform_fee, organizer_payout, fixed_fee, vat, gross_amount')
                            .eq('purchase_intent_id', intent.id)
                            .eq('status', 'completed')
                            .single();

                        // Calculate proportional reversal based on original transaction
                        const ratio = origTx ? (refundAmount / origTx.gross_amount) : (refundAmount / intent.total_amount);
                        const refundPlatformFee = origTx ? Math.round(origTx.platform_fee * ratio) : Math.round((refundAmount * platformFeePercentage) / 100);
                        const refundFixedFee = origTx ? Math.round((origTx.fixed_fee || 0) * ratio) : 0;
                        const refundVat = origTx ? Math.round((origTx.vat || 0) * ratio) : 0;
                        const refundPayout = origTx ? Math.round(origTx.organizer_payout * ratio) : (refundAmount - refundPlatformFee);

                        console.log(`💰 Refund calc: amount=${refundAmount}, ratio=${ratio.toFixed(2)}, platformFee=${refundPlatformFee}, fixedFee=${refundFixedFee}, vat=${refundVat}, payout=${refundPayout}`);

                        const { error: refundTxError } = await supabaseClient.from('transactions').insert({
                            purchase_intent_id: intent.id,
                            event_id: intent.event_id,
                            partner_id: intent.event.organizer_id,
                            user_id: intent.user_id || null,
                            gross_amount: -refundAmount,
                            platform_fee: -refundPlatformFee,
                            fixed_fee: -refundFixedFee,
                            vat: -refundVat,
                            organizer_payout: -refundPayout,
                            payment_processing_fee: 0,
                            fee_percentage: platformFeePercentage,
                            fee_basis: 'refund',
                            xendit_transaction_id: data.id,
                            status: 'refunded'
                        });

                        if (refundTxError) {
                            console.error(`❌ Refund transaction insert failed for intent ${intentId}:`, refundTxError)
                        } else {
                            console.log(`✅ Refund processed for intent ${intentId}`);
                        }

                        // 📬 Enqueue partner webhook (ticket.refunded) for async processing
                        try {
                            const { error: queueError } = await supabaseClient
                                .rpc('pgmq_send', {
                                    queue_name: 'payment_side_effects',
                                    message: {
                                        type: 'partner_webhook',
                                        data: {
                                            event_type: 'ticket.refunded',
                                            event_id: intent.event_id,
                                            payload: {
                                                intent_id: intentId,
                                                refund_amount: data.amount || intent.total_amount,
                                            },
                                        },
                                    },
                                })
                            if (queueError) {
                                console.error('⚠️ Failed to enqueue refund webhook:', queueError)
                            } else {
                                console.log('📬 Refund partner webhook enqueued')
                            }
                        } catch (webhookErr) {
                            console.error('⚠️ Refund webhook enqueue failed (non-critical):', webhookErr);
                        }
                    }
                }
            } else {
                // Refund Failed
                console.log(`❌ Refund failed for intent ${intentId}: ${data.failure_code}`);
            }

            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ==========================================
        // 💳 CAPABILITIES STATUS (v35) — Cards/GCash activation result
        // ==========================================
        // account_holder.capabilities.status:live | declined | resubmission_required.
        // When LIVE, flip partners.xendit_cards_gcash_live so checkout starts
        // offering Cards + GCash. Handle BEFORE the KYC block (a capabilities
        // event would otherwise fall into the KYC mapping and be ignored).
        if (typeof eventType === 'string' && eventType.includes('capabilities')) {
            const data = payload.data || payload
            const accountHolderId = data.account_holder_id || data.id || payload.account_holder_id
            const capStatus = String(data.status || data.capabilities?.status || eventType.split(':').pop() || '').toUpperCase()
            console.log(`💳 Capabilities webhook: holder=${accountHolderId}, status=${capStatus}`)

            let partnerId: string | null = null
            let partnerUserId: string | null = null
            if (accountHolderId) {
                const { data: p } = await supabaseClient
                    .from('partners').select('id, user_id')
                    .eq('xendit_account_holder_id', accountHolderId).maybeSingle()
                if (p) { partnerId = p.id; partnerUserId = p.user_id }
            }

            if (partnerId) {
                if (capStatus.includes('LIVE') || capStatus.includes('ACTIVE')) {
                    await supabaseClient.from('partners').update({ xendit_cards_gcash_live: true }).eq('id', partnerId)
                    await supabaseClient.from('partner_gateway_accounts')
                        .update({ kyc_status: 'CAPABILITIES_LIVE', updated_at: new Date().toISOString() })
                        .eq('partner_id', partnerId).eq('provider', 'xendit')
                    console.log(`✅ Cards/GCash LIVE for partner ${partnerId}`)
                    if (partnerUserId) {
                        await supabaseClient.from('notifications').insert({
                            user_id: partnerUserId, actor_id: null, type: 'kyc_verified',
                            title: 'Cards & GCash are live 💳',
                            body: 'Your customers can now pay with credit/debit cards and GCash.',
                            entity_id: partnerId, metadata: { partner_id: partnerId, capabilities: 'live' },
                        })
                    }
                } else {
                    // declined / resubmission_required — keep cards/gcash off and tell the organizer.
                    const reason = data.failure_reason || (Array.isArray(data.invalid_fields) ? data.invalid_fields.join(', ') : data.invalid_fields) || null
                    await supabaseClient.from('partners').update({ xendit_cards_gcash_live: false }).eq('id', partnerId)
                    console.log(`💳 Capabilities ${capStatus} for partner ${partnerId}${reason ? ': ' + reason : ''}`)
                    if (partnerUserId) {
                        await supabaseClient.from('notifications').insert({
                            user_id: partnerUserId, actor_id: null, type: 'kyc_rejected',
                            title: 'Cards & GCash need attention',
                            body: capStatus.includes('RESUBMISSION')
                                ? `Xendit needs more info to enable Cards & GCash${reason ? ': ' + reason : ''}. Please update your verification.`
                                : `Your Cards & GCash activation was declined${reason ? ': ' + reason : ''}.`,
                            entity_id: partnerId, metadata: { partner_id: partnerId, capabilities: capStatus },
                        })
                    }
                }
            }
            return new Response(JSON.stringify({ success: true, capabilities: capStatus }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 🪪 xenPlatform ACCOUNT HOLDER KYC RESULT (v33)
        // ==========================================
        // Xendit fires an account-holder/KYC callback when a sub-account's KYC
        // decision is made. Event names + payload shapes vary across OWNED vs
        // MANAGED and API versions, so match + extract defensively.
        if (
            typeof eventType === 'string' &&
            (eventType.includes('account_holder') ||
                eventType.includes('account.updated') ||
                eventType.includes('kyc') ||
                eventType.includes('verification'))
        ) {
            const data = payload.data || payload

            // Account Holder id can appear under several keys depending on payload shape
            const accountHolderId =
                data.account_holder_id || data.id || data.business_id ||
                payload.account_holder_id || payload.business_id

            // KYC status. Xendit's account_holder.kyc.status:<status> events carry the
            // decision in the EVENT NAME (e.g. ":passed"), not always in the body — so
            // fall back to the suffix after the last ':'.
            const eventSuffix = typeof eventType === 'string' && eventType.includes(':')
                ? eventType.split(':').pop() : ''
            const rawStatus = String(data.kyc?.status || data.status || eventSuffix || '').toUpperCase()
            // Failure detail may be failure_reason(s) or invalid_fields (resubmission).
            const failureReasons = data.kyc?.failure_reasons || data.failure_reasons
                || data.kyc?.failure_reason || data.failure_reason
                || data.kyc?.invalid_fields || data.invalid_fields || null

            console.log(`🪪 KYC webhook: event=${eventType}, holder=${accountHolderId}, status=${rawStatus}`)

            // Map Xendit KYC status → our kyc_status_type enum.
            // account_verification terminal/intermediate statuses:
            //   PASSED → verified, FAILED → rejected,
            //   AWAITING_RESUBMISSION → resubmission_required,
            //   PENDING_VERIFICATION / VERIFICATION_IN_PROGRESS → submitted.
            let newKyc: 'verified' | 'rejected' | 'submitted' | 'resubmission_required' | null = null
            if (['VERIFIED', 'APPROVED', 'SUCCESS', 'SUCCESSFUL', 'LIVE', 'COMPLETED', 'ACTIVE', 'PASSED'].includes(rawStatus)) {
                newKyc = 'verified'
            } else if (['REJECTED', 'FAILED', 'DECLINED', 'INVALID'].includes(rawStatus)) {
                newKyc = 'rejected'
            } else if (['AWAITING_RESUBMISSION', 'RESUBMISSION_REQUIRED', 'AWAITING_RESUBMISSION_REQUIRED'].includes(rawStatus)) {
                newKyc = 'resubmission_required'
            } else if (['PENDING', 'PROCESSING', 'IN_REVIEW', 'AWAITING_DOCUMENTS', 'SUBMITTED', 'REQUESTED', 'UNDER_REVIEW', 'PENDING_VERIFICATION', 'VERIFICATION_IN_PROGRESS'].includes(rawStatus)) {
                newKyc = 'submitted'
            }

            if (!accountHolderId || !newKyc) {
                console.log(`🪪 KYC webhook ignored (holder=${accountHolderId}, status=${rawStatus} → ${newKyc})`)
                return new Response(
                    JSON.stringify({ success: true, status: 'ignored', kyc_status: rawStatus }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Find the partner by account holder id, falling back to the sub-account id
            let { data: partner } = await supabaseClient
                .from('partners')
                .select('id, user_id, business_name, kyc_status')
                .eq('xendit_account_holder_id', accountHolderId)
                .maybeSingle()

            if (!partner) {
                const { data: byAccount } = await supabaseClient
                    .from('partners')
                    .select('id, user_id, business_name, kyc_status')
                    .eq('xendit_account_id', accountHolderId)
                    .maybeSingle()
                partner = byAccount
            }

            // account_verification callbacks reference the verification id / sub-account
            // business id, not the legacy account_holder_id — fall back to the gateway row.
            if (!partner) {
                const { data: byGateway } = await supabaseClient
                    .from('partner_gateway_accounts')
                    .select('partner_id')
                    .eq('provider', 'xendit')
                    .or(`verification_id.eq.${accountHolderId},account_id.eq.${accountHolderId},account_holder_id.eq.${accountHolderId}`)
                    .maybeSingle()
                if (byGateway?.partner_id) {
                    const { data: p } = await supabaseClient
                        .from('partners')
                        .select('id, user_id, business_name, kyc_status')
                        .eq('id', byGateway.partner_id)
                        .maybeSingle()
                    partner = p
                }
            }

            if (!partner) {
                console.log(`🪪 No partner for account holder ${accountHolderId} (likely a test webhook)`)
                return new Response(
                    JSON.stringify({ success: true, message: 'No matching partner (test passed)' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Idempotency: already in the target state
            if (partner.kyc_status === newKyc) {
                console.log(`⚡ Partner ${partner.id} kyc_status already ${newKyc}, skipping`)
                return new Response(
                    JSON.stringify({ success: true, message: `Already ${newKyc}` }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const update: Record<string, unknown> = { kyc_status: newKyc }
            if (newKyc === 'rejected' || newKyc === 'resubmission_required') {
                update.kyc_rejection_reason = Array.isArray(failureReasons)
                    ? failureReasons.join('; ')
                    : (failureReasons || (newKyc === 'resubmission_required'
                        ? 'Additional information required — please review and resubmit'
                        : 'Verification failed — please review and resubmit'))
            } else if (newKyc === 'verified') {
                update.kyc_rejection_reason = null
            }

            const { error: kycUpdateError } = await supabaseClient
                .from('partners')
                .update(update)
                .eq('id', partner.id)

            if (kycUpdateError) {
                console.error(`❌ Failed to update kyc_status for partner ${partner.id}:`, kycUpdateError)
                return new Response(JSON.stringify({ error: kycUpdateError.message }), { status: 500, headers: corsHeaders })
            }

            console.log(`✅ Partner ${partner.id} kyc_status → ${newKyc}`)

            // Mirror the raw gateway status onto the xendit gateway-account row.
            await supabaseClient
                .from('partner_gateway_accounts')
                .update({ kyc_status: rawStatus, updated_at: new Date().toISOString() })
                .eq('partner_id', partner.id)
                .eq('provider', 'xendit')

            // 💳 On KYC PASSED, request the Cards + GCash capabilities. These can
            // only be requested once verification is PASSED, and Xendit notifies us
            // via account_holder.capabilities.status:live (handled above → flips the
            // xendit_cards_gcash_live flag). Best-effort; failures are logged only.
            if (newKyc === 'verified' && accountHolderId) {
                try {
                    const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
                    if (xenditKey) {
                        const capRes = await fetch(`https://api.xendit.co/account_holders/${accountHolderId}`, {
                            method: 'PATCH',
                            headers: { Authorization: `Basic ${btoa(xenditKey + ':')}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                capabilities: [
                                    { type: 'MONEY_IN', channel_code: 'PH_CARDS' },
                                    { type: 'MONEY_IN', channel_code: 'GCASH' },
                                ],
                            }),
                        })
                        const capJson = await capRes.json().catch(() => ({}))
                        console.log(`💳 Requested Cards/GCash capabilities for ${accountHolderId}: ${capRes.status}`, JSON.stringify(capJson))
                    }
                } catch (capErr) {
                    console.error('⚠️ Capabilities request failed (non-fatal):', capErr)
                }
            }

            // Notify the organizer on actionable states (in-app notification + best-effort push)
            if (partner.user_id && (newKyc === 'verified' || newKyc === 'rejected' || newKyc === 'resubmission_required')) {
                const notif = newKyc === 'verified'
                    ? {
                        type: 'kyc_verified',
                        title: 'Your account is verified ✅',
                        body: 'Your business is verified — you can now accept GCash and card payments.',
                    }
                    : newKyc === 'resubmission_required'
                    ? {
                        type: 'kyc_rejected',
                        title: 'More information needed',
                        body: `Our payment provider needs more from your KYC${update.kyc_rejection_reason ? ': ' + update.kyc_rejection_reason : ''}. Please review and resubmit.`,
                    }
                    : {
                        type: 'kyc_rejected',
                        title: 'Verification needs attention',
                        body: `Your KYC could not be verified${update.kyc_rejection_reason ? ': ' + update.kyc_rejection_reason : ''}. Please review and resubmit.`,
                    }

                const { error: notifError } = await supabaseClient.from('notifications').insert({
                    user_id: partner.user_id,
                    actor_id: null,
                    type: notif.type,
                    title: notif.title,
                    body: notif.body,
                    entity_id: partner.id,
                    metadata: { partner_id: partner.id, kyc_status: newKyc },
                })
                if (notifError) console.error('⚠️ Failed to insert KYC notification:', notifError)

                const { error: pushQueueError } = await supabaseClient.rpc('pgmq_send', {
                    queue_name: 'payment_side_effects',
                    message: {
                        type: 'send_push',
                        data: {
                            user_id: partner.user_id,
                            title: notif.title,
                            body: notif.body,
                            data: { type: notif.type, partner_id: partner.id },
                        },
                    },
                })
                if (pushQueueError) console.error('⚠️ Failed to enqueue KYC push:', pushQueueError)
            }

            return new Response(
                JSON.stringify({ success: true, partner_id: partner.id, kyc_status: newKyc }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Unknown event type
        console.log('Unhandled webhook event:', eventType)
        return new Response(
            JSON.stringify({ success: true, status: 'ignored', event: eventType }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
