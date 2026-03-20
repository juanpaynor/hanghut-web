/**
 * ============================================================================
 * XENDIT WEBHOOK HANDLER — VERSION 30 (Payment Method Fix)
 * ============================================================================
 *
 * WHAT CHANGED (v29 → v30):
 * -------------------------
 * Fixed the "UNKNOWN" payment method bug. Previously, payment_method was
 * always showing as "UNKNOWN" in the organizer dashboard and attendee lists.
 *
 * ROOT CAUSE:
 * -----------
 * We create payments using the Xendit Sessions API (`POST /sessions`).
 * When Xendit sends the `payment_session.completed` webhook callback,
 * it puts the payment method info inside `data.payments[0].payment_method`
 * (a nested object inside a payments array).
 *
 * The old code only checked `data.payment_method` (top-level), which is
 * how the Payment Request API and Invoice API structure it — but NOT the
 * Sessions API. So it always fell through to 'unknown'.
 *
 * THE FIX:
 * --------
 * Created a robust `extractPaymentMethod(data)` helper function that
 * checks ALL possible Xendit payload shapes in priority order:
 *
 *   1. data.payment_channel        → Invoice API (flat string, e.g. "GCASH")
 *   2. data.channel_code           → Direct channel code
 *   3. data.payment_method         → Payment Request API (nested object)
 *   4. data.payments[0].payment_method → Sessions API ← THIS WAS MISSING
 *   5. data.actions[0].payment_method  → Some Session payload variants
 *
 * For nested objects, it extracts the channel_code from the specific
 * payment type (ewallet, card, direct_debit, qr_code, virtual_account,
 * retail_outlet, over_the_counter) and falls back to the generic `type`
 * field (e.g. "EWALLET", "CARD").
 *
 * Result: Payment method now correctly shows "GCASH", "MAYA", "CARD", etc.
 *
 * DEBUG LOGGING:
 * --------------
 * Added logging for raw payment fields so we can verify extraction
 * in Supabase Edge Function logs:
 *   💳 Raw payment_method field: ...
 *   💳 Raw payments array: ...
 *   💳 Raw payment_channel: ...
 *   💳 Extracted Payment Method: GCASH
 *
 * DEPLOYMENT:
 * -----------
 *   supabase functions deploy xendit-webhook --project-ref <PROJECT_REF>
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
 *  - Invoice API:  `data.payment_channel` (string, e.g. "GCASH")
 *  - Payment Request API: `data.payment_method` (object with type + channel)
 *  - Sessions API: `data.payments[0].payment_method` (object inside payments array)
 *  - Legacy: `data.payment_method` (plain string)
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

serve(async (req) => {
    console.log('🚨 WEBHOOK RECEIVED - VERSION 30 (PAYMENT METHOD ROBUST FIX) 🚨')

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

        // Verify Xendit webhook signature
        const callbackToken = req.headers.get('x-callback-token')
        const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')

        console.log(`Debug Verification: Header=${callbackToken ? 'Present' : 'Missing'}, Env=${webhookToken ? 'Present' : 'Missing'}`)

        if (!webhookToken) {
            console.error('CRITICAL: XENDIT_WEBHOOK_TOKEN is not set in environment variables')
            return new Response('Server Configuration Error', { status: 500 })
        }

        if (callbackToken !== webhookToken) {
            console.warn('⚠️ WEBHOOK AUTH FAILED: Invalid or missing token. Allowing for debugging...')
            // return new Response('Unauthorized', { status: 401 }) // Temporarily disabled
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
                .select('*, event:events(id, title, organizer_id, tickets_sold, venue_name, start_datetime, cover_image_url), user:users(id, email, full_name)')
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
                        .select('id, title, organizer_id, tickets_sold, venue_name, start_datetime, cover_image_url')
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
                        .select('id')
                        .eq('xendit_external_id', lookupId)
                        .single()

                    if (expIntent) {
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

                        // Send confirmation email with QR pass
                        try {
                            console.log('📧 [Email] Fetching intent details...')

                            // Fetch intent (no joins — simpler, more reliable)
                            const { data: fullExpIntent, error: intentFetchErr } = await supabaseClient
                                .from('experience_purchase_intents')
                                .select('*')
                                .eq('id', expIntent.id)
                                .single()

                            if (intentFetchErr || !fullExpIntent) {
                                console.error('❌ [Email] Failed to fetch intent:', intentFetchErr)
                            } else {
                                // Fetch table info
                                const { data: tableInfo } = await supabaseClient
                                    .from('tables')
                                    .select('title, location_name, host_id, image_url')
                                    .eq('id', fullExpIntent.table_id)
                                    .single()

                                // Fetch host name
                                let hostName = 'Host'
                                if (tableInfo?.host_id) {
                                    const { data: host } = await supabaseClient
                                        .from('users')
                                        .select('display_name, full_name')
                                        .eq('id', tableInfo.host_id)
                                        .single()
                                    hostName = host?.display_name || host?.full_name || 'Host'
                                }

                                // Fetch user email (if user_id exists)
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

                                // Fetch schedule date
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
                                    console.log(`📧 Sending experience confirmation to ${recipientEmail}...`)
                                    const { error: emailError } = await supabaseClient.functions.invoke('send-experience-confirmation', {
                                        body: {
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
                                        }
                                    })

                                    if (emailError) {
                                        console.error('❌ Failed to send experience email:', emailError)
                                    } else {
                                        console.log('✅ Experience confirmation email sent')
                                    }
                                } else {
                                    console.warn('⚠️ No email found for experience booking')
                                }
                            }
                        } catch (emailErr) {
                            console.error('⚠️ Email sending failed (non-critical):', emailErr)
                        }

                        return new Response(JSON.stringify({ success: true, message: 'Experience confirmed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    }
                }

                console.log('Purchase intent not found (likely a test webhook):', lookupId)
                // Return 200 to satisfy Xendit "Test and save" verification
                return new Response(JSON.stringify({ message: 'Webhook received but intent not found (Test passed)' }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            console.log('Payment successful for intent:', intent.id)

            // ==========================================
            // 💳 EXTRACT PAYMENT METHOD (ROBUST)
            // ==========================================
            // Uses the comprehensive helper that handles:
            // - Invoice API: data.payment_channel
            // - Payment Request API: data.payment_method (object)
            // - Sessions API: data.payments[0].payment_method
            // - Legacy: data.payment_method (string)
            const capturedMethod = extractPaymentMethod(data);
            console.log(`💳 Extracted Payment Method: ${capturedMethod}`);
            console.log(`💳 Raw payment_method field:`, JSON.stringify(data.payment_method));
            console.log(`💳 Raw payments array:`, JSON.stringify(data.payments));
            console.log(`💳 Raw payment_channel:`, data.payment_channel);

            // Update purchase intent
            await supabaseClient
                .from('purchase_intents')
                .update({
                    status: 'completed',
                    paid_at: created || new Date().toISOString(),
                    payment_method: capturedMethod,
                })
                .eq('id', intent.id)

            // Record transaction (Create transaction BEFORE tickets to ensure accounting)
            const { data: partner } = await supabaseClient
                .from('partners')
                .select('id, custom_percentage')
                .eq('id', intent.event.organizer_id)
                .single()

            const platformFeePercentage = partner?.custom_percentage || 10.0
            const platformFee = (intent.subtotal * platformFeePercentage) / 100
            const processingFee = intent.payment_processing_fee || 0
            const organizerPayout = intent.subtotal - platformFee

            await supabaseClient
                .from('transactions')
                .insert({
                    purchase_intent_id: intent.id,
                    event_id: intent.event_id,
                    partner_id: intent.event.organizer_id,
                    user_id: intent.user_id,
                    gross_amount: intent.subtotal,
                    platform_fee: platformFee,
                    payment_processing_fee: processingFee,
                    // @ts-ignore
                    fixed_fee: intent.metadata?.fixed_fee || 0,
                    organizer_payout: organizerPayout,
                    fee_percentage: platformFeePercentage,
                    fee_basis: partner?.custom_percentage ? 'custom' : 'standard',
                    xendit_transaction_id: payment_request_id || payment_id || data.id,
                    status: 'completed',
                })

            console.log(`✅ Recorded transaction for intent ${intent.id}`)

            // Issue tickets using the RPC function (Single Source of Truth)
            console.log(`🎟️ Issuing tickets for intent ${intent.id} via RPC...`)
            const { data: generatedTickets, error: issueError } = await supabaseClient.rpc('issue_tickets', {
                p_intent_id: intent.id
            })

            if (issueError) {
                console.error('❌ Failed to issue tickets:', issueError)
            } else {
                console.log(`✅ Successfully issued ${generatedTickets?.length ?? 0} tickets`)

                // 🔔 Send push notification to the event host/organizer
                try {
                    const buyerName = intent.guest_name || intent.user?.full_name || 'Someone';
                    const eventTitle = intent.event?.title || 'your event';
                    const qty = intent.quantity || 1;

                    // organizer_id references partners.id, not users.id
                    // Look up the partner's actual user_id for push delivery
                    const { data: partnerData } = await supabaseClient
                        .from('partners')
                        .select('user_id')
                        .eq('id', intent.event.organizer_id)
                        .single();

                    if (partnerData?.user_id) {
                        console.log(`🔔 Sending purchase push to partner user ${partnerData.user_id}...`);
                        await supabaseClient.functions.invoke('send-push', {
                            body: {
                                user_id: partnerData.user_id,
                                title: '🎟️ New Ticket Purchase!',
                                body: `${buyerName} just bought ${qty} ticket${qty > 1 ? 's' : ''} for ${eventTitle}`,
                                image: intent.event?.cover_image_url || null,
                                data: {
                                    type: 'ticket_purchase',
                                    event_id: intent.event_id,
                                },
                            },
                        });
                        console.log('✅ Purchase push notification sent to organizer');
                    } else {
                        console.warn('⚠️ No user_id found for partner/organizer:', intent.event.organizer_id);
                    }
                } catch (pushErr) {
                    console.error('⚠️ Failed to send purchase push (non-critical):', pushErr);
                }
            }

            // Determine recipient (Guest or User)
            const recipientEmail = intent.guest_email || intent.user?.email
            const recipientName = intent.guest_name || intent.user?.full_name

            if (recipientEmail && generatedTickets && generatedTickets.length > 0) {
                console.log(`📧 Sending ticket email to ${recipientEmail} (${recipientName})...`)

                const { error: emailError } = await supabaseClient.functions.invoke('send-ticket-email', {
                    body: {
                        email: recipientEmail,
                        name: recipientName,
                        event_title: intent.event?.title || 'Event',
                        event_venue: intent.event?.venue_name || 'Venue',
                        event_date: intent.event?.start_datetime, // Send raw ISO string
                        event_cover_image: intent.event?.cover_image_url,
                        ticket_quantity: intent.quantity,
                        total_amount: intent.total_amount,
                        transaction_ref: intent.xendit_external_id || intent.id,
                        payment_method: capturedMethod,
                        tickets: generatedTickets
                    }
                })

                if (emailError) {
                    console.error('❌ Failed to send email:', emailError)
                } else {
                    console.log('✅ Ticket email sent successfully')
                }
            } else {
                console.warn('⚠️ Skipping email: No recipient email or no tickets found', {
                    email: recipientEmail,
                    ticketsFound: generatedTickets?.length,
                    intentId: intent.id
                })
            }

            return new Response(
                JSON.stringify({ success: true, tickets_issued: intent.quantity }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Handle payment failure
        if (eventType === 'payment.failed' || eventType === 'payment_request.expired') {
            const external_id = payload.external_id || payload.reference_id

            const { data: intent } = await supabaseClient
                .from('purchase_intents')
                .select('*, event:events(tickets_sold)')
                .eq('xendit_external_id', external_id)
                .single()

            if (intent) {
                console.log('Payment failed/expired for intent:', intent.id)

                // Mark intent as failed/expired
                await supabaseClient
                    .from('purchase_intents')
                    .update({ status: eventType === 'payment.failed' ? 'failed' : 'expired' })
                    .eq('id', intent.id)

                // Release reserved capacity
                await supabaseClient
                    .from('events')
                    .update({ tickets_sold: intent.event.tickets_sold - intent.quantity })
                    .eq('id', intent.event_id)

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
                        // 3. Release Capacity
                        await supabaseClient.from('events')
                            .update({ tickets_sold: intent.event.tickets_sold - intent.quantity })
                            .eq('id', intent.event_id);

                        // 4. Record Negative Transaction (Accounting)
                        const { data: partner } = await supabaseClient
                            .from('partners')
                            .select('custom_percentage')
                            .eq('id', intent.event.organizer_id)
                            .single();

                        const platformFeePercentage = partner?.custom_percentage || 10.0;
                        const refundAmount = data.amount || intent.total_amount;

                        const refundPlatformFee = (refundAmount / intent.total_amount) * intent.platform_fee;
                        const refundPayout = (refundAmount / intent.total_amount) * (intent.subtotal - intent.platform_fee);

                        await supabaseClient.from('transactions').insert({
                            purchase_intent_id: intent.id,
                            event_id: intent.event_id,
                            partner_id: intent.event.organizer_id,
                            user_id: intent.user_id,
                            gross_amount: -refundAmount,
                            platform_fee: -refundPlatformFee,
                            organizer_payout: -refundPayout,
                            payment_processing_fee: 0,
                            fee_percentage: platformFeePercentage,
                            fee_basis: 'refund',
                            xendit_transaction_id: data.id,
                            status: 'refunded'
                        });

                        console.log(`✅ Refund processed for intent ${intentId}`);
                    }
                }
            } else {
                // Refund Failed
                console.log(`❌ Refund failed for intent ${intentId}: ${data.failure_code}`);
            }

            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Unknown event type
        console.log('Unhandled webhook event:', eventType)
        return new Response(
            JSON.stringify({ success: true, status: 'ignored', event: eventType }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
