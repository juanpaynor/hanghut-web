import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // @ts-ignore
        // Validate Env Vars
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY');
        const resendKey = Deno.env.get('RESEND_API_KEY');
        const masterAccountId = Deno.env.get('XENDIT_MASTER_ACCOUNT_ID');

        if (!sbUrl) throw new Error('Missing SUPABASE_URL');
        if (!sbAnonKey) throw new Error('Missing SUPABASE_ANON_KEY');
        if (!sbServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
        if (!xenditKey) throw new Error('Missing XENDIT_SECRET_KEY');

        // @ts-ignore
        const supabaseClient = createClient(
            sbUrl,
            sbAnonKey,
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Init Admin Client for fetching user email if needed
        const supabaseAdmin = createClient(sbUrl, sbServiceKey)

        // Get current user
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const { intent_id, amount, reason, intent_type } = await req.json()

        if (!intent_id || !reason) {
            return new Response(JSON.stringify({ error: 'Missing intent_id or reason', code: 'MISSING_FIELD' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const isExperience = intent_type === 'experience';

        // 1. Fetch Purchase Intent & Event/Experience to verify ownership
        let intent;
        let intentError;
        let organizerUserId;
        let eventOrExperienceTitle;
        let partnerData: any = null;

        if (isExperience) {
            // Use admin client — RLS on experience_purchase_intents restricts to buyer (user_id),
            // but the host (who issues refunds) is not the buyer. Auth check is done manually below.
            const { data, error } = await supabaseAdmin
                .from('experience_purchase_intents')
                .select('*, experience:tables!table_id(title, host_id, partner_id), transactions:experience_transactions(xendit_transaction_id, status)')
                .eq('id', intent_id)
                .single();

            intent = data;
            intentError = error;
            organizerUserId = intent?.experience?.host_id;
            eventOrExperienceTitle = intent?.experience?.title;

            // Look up partner XenPlatform details
            if (intent?.experience?.partner_id) {
                const { data: p } = await supabaseAdmin
                    .from('partners')
                    .select('xendit_account_id, split_rule_id, custom_percentage, platform_fee_receivable')
                    .eq('id', intent.experience.partner_id)
                    .single();
                partnerData = p;
            }
        } else {
            const { data, error } = await supabaseClient
                .from('purchase_intents')
                .select('*, event:events(title, organizer_id, organizer:partners!organizer_id(user_id, xendit_account_id, split_rule_id, custom_percentage, platform_fee_receivable)), transactions(xendit_transaction_id, status)')
                .eq('id', intent_id)
                .single();

            intent = data;
            intentError = error;
            organizerUserId = intent?.event?.organizer?.user_id;
            eventOrExperienceTitle = intent?.event?.title;
            partnerData = intent?.event?.organizer || null;
        }

        if (intentError || !intent) {
            return new Response(JSON.stringify({ error: `${isExperience ? 'Experience' : 'Event'} Purchase intent not found` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        // 2. Authorization Check: Only Organizer can refund (unless Admin)
        // Check if user is admin/service_role/superuser
        const isAdmin = user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'service_role' || user.user_metadata?.is_admin === true;

        if (organizerUserId !== user.id && !isAdmin) {
            console.error(`Auth mismatch: organizer.user_id=${organizerUserId}, caller=${user.id}`)
            return new Response(JSON.stringify({ error: `Unauthorized: Only ${isExperience ? 'host' : 'event organizer'} can refund` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 3. Check locally if refundable (idempotency guard)
        if (intent.status === 'refunded') {
            return new Response(JSON.stringify({
                error: 'This transaction has already been refunded',
                code: 'ALREADY_REFUNDED',
                current_status: intent.status
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        if (intent.refunded_at) {
            return new Response(JSON.stringify({
                error: 'A refund has already been initiated for this transaction. Please wait for it to complete.',
                code: 'REFUND_IN_PROGRESS',
                refunded_at: intent.refunded_at
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 409,
            })
        }

        if (intent.status !== 'completed') {
            console.error(`Refund failed: Intent ${intent.id} status is ${intent.status}`)
            return new Response(JSON.stringify({
                error: `Transaction is not in a refundable state (Status: ${intent.status})`,
                code: 'NOT_COMPLETED',
                current_status: intent.status
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // ============================================================
        // RESOLVE XENDIT REFERENCE for Refund
        // Xendit's /refunds API strictly requires either:
        //   - payment_request_id (pr-xxx)  — for Payment Request / Sessions API
        //   - invoice_id (inv-xxx / hex)   — for Invoice API
        //
        // Strategy:
        //   1. Check intent.xendit_invoice_id (if starts with pr- or inv-)
        //   2. Check transactions table xendit_transaction_id (if starts with pr- or inv-)
        //   3. Fallback: Search Xendit API by our reference_id / external_id
        // ============================================================
        const authHeader = `Basic ${btoa(xenditKey + ':')}`

        // Helper: check if an ID is a usable Xendit refund reference
        function isValidXenditRefundId(id: string | null | undefined): boolean {
            if (!id) return false;
            return id.startsWith('pr-') || id.startsWith('inv-') || id.startsWith('in-');
        }

        let xenditReference: string | null = null;

        // --- Candidate 1: intent.xendit_invoice_id ---
        if (isValidXenditRefundId(intent.xendit_invoice_id)) {
            xenditReference = intent.xendit_invoice_id;
            console.log(`✅ Using xendit_invoice_id from intent: ${xenditReference}`);
        }

        // --- Candidate 2: transactions table ---
        if (!xenditReference) {
            const txId = intent.transactions?.[0]?.xendit_transaction_id;
            if (isValidXenditRefundId(txId)) {
                xenditReference = txId;
                console.log(`✅ Using xendit_transaction_id from transactions: ${xenditReference}`);
            } else if (txId) {
                console.log(`⚠️ transactions.xendit_transaction_id exists but not refund-compatible: ${txId}`);
            }
        }

        // --- Candidate 3: Raw hex xendit_invoice_id (old Invoice API format) ---
        // Old Xendit Invoice IDs are 24-char hex strings (no prefix)
        if (!xenditReference && intent.xendit_invoice_id && /^[0-9a-f]{24}$/.test(intent.xendit_invoice_id)) {
            xenditReference = intent.xendit_invoice_id;
            console.log(`✅ Using raw hex xendit_invoice_id (legacy Invoice): ${xenditReference}`);
        }

        // --- Candidate 4: Search Xendit API by our reference/external ID ---
        if (!xenditReference && intent.xendit_external_id) {
            console.log(`🔍 Searching Xendit APIs for external_id: ${intent.xendit_external_id}`);

            // 4a. Try Payment Requests API (Sessions API creates these)
            try {
                const prRes = await fetch(
                    `https://api.xendit.co/payment_requests?reference_id=${intent.xendit_external_id}`,
                    { headers: { 'Authorization': authHeader } }
                );

                if (prRes.ok) {
                    const prData = await prRes.json();
                    if (prData.data && Array.isArray(prData.data) && prData.data.length > 0) {
                        const successfulPr = prData.data.find((pr: any) => pr.status === 'SUCCEEDED');
                        const targetPr = successfulPr || prData.data[0];
                        if (targetPr) {
                            xenditReference = targetPr.id; // pr-xxx
                            console.log(`✅ Found via Payment Request API: ${xenditReference}`);
                        }
                    }
                } else {
                    console.warn(`Payment Request search returned: ${prRes.status}`);
                }
            } catch (e) {
                console.warn('Failed to search Payment Requests:', e);
            }

            // 4b. Try Invoice API (Legacy)
            if (!xenditReference) {
                try {
                    const invRes = await fetch(
                        `https://api.xendit.co/v2/invoices?external_id=${intent.xendit_external_id}`,
                        { headers: { 'Authorization': authHeader } }
                    );

                    if (invRes.ok) {
                        const invData = await invRes.json();
                        if (Array.isArray(invData) && invData.length > 0) {
                            xenditReference = invData[0].id;
                            console.log(`✅ Found via Invoice API: ${xenditReference}`);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to search Invoices:', e);
                }
            }

            // Self-heal: backfill xendit_invoice_id in DB so next time it's instant
            if (xenditReference) {
                const table = isExperience ? 'experience_purchase_intents' : 'purchase_intents';
                await supabaseAdmin.from(table)
                    .update({ xendit_invoice_id: xenditReference })
                    .eq('id', intent.id);
                console.log(`🔧 Self-healed xendit_invoice_id for ${intent.id}`);
            }
        }

        // Self-heal: backfill payment_method if unknown
        if (xenditReference && (!intent.payment_method || intent.payment_method === 'unknown' || intent.payment_method === 'UNKNOWN')) {
            try {
                const endpoint = xenditReference.startsWith('pr-')
                    ? `https://api.xendit.co/payment_requests/${xenditReference}`
                    : `https://api.xendit.co/v2/invoices/${xenditReference}`;

                const detailRes = await fetch(endpoint, { headers: { 'Authorization': authHeader } });

                if (detailRes.ok) {
                    const data = await detailRes.json();
                    let fetchedMethod = data.payment_channel || null;

                    if (!fetchedMethod && data.payment_method) {
                        const pm = data.payment_method;
                        fetchedMethod = typeof pm === 'string' ? pm : (
                            pm.ewallet?.channel_code || pm.retail_outlet?.channel_code ||
                            pm.qr_code?.channel_code || pm.direct_debit?.channel_code ||
                            pm.card?.channel_code || pm.virtual_account?.channel_code || pm.type
                        );
                    }

                    if (fetchedMethod) {
                        const table = isExperience ? 'experience_purchase_intents' : 'purchase_intents';
                        await supabaseAdmin.from(table)
                            .update({ payment_method: fetchedMethod })
                            .eq('id', intent.id);
                        intent.payment_method = fetchedMethod;
                        console.log(`🔧 Self-healed payment_method: ${fetchedMethod}`);
                    }
                }
            } catch (e) {
                console.warn('Failed to backfill payment_method:', e);
            }
        }

        // --- Final check ---
        if (!xenditReference) {
            console.error(`❌ Refund failed: No valid Xendit ID found for Intent ${intent.id}`);
            console.error(`   xendit_invoice_id: ${intent.xendit_invoice_id}`);
            console.error(`   xendit_external_id: ${intent.xendit_external_id}`);
            console.error(`   transactions[0].xendit_transaction_id: ${intent.transactions?.[0]?.xendit_transaction_id}`);
            return new Response(JSON.stringify({
                error: 'Could not resolve a valid Xendit reference for refund',
                code: 'MISSING_XENDIT_REF',
                details: 'No payment_request_id or invoice_id found. The payment may be too old or was not recorded properly.'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // ============================================================
        // 4. Pre-check: Sub-wallet has enough to refund the customer
        // ============================================================
        // Organizer shoulders the full refund cost. Hanghut keeps its take.
        // The sub-wallet must already hold the full refund amount.
        const refundAmount = amount || intent.total_amount;
        const hasSubAccount = partnerData?.xendit_account_id;

        if (hasSubAccount) {
            try {
                const balanceRes = await fetch('https://api.xendit.co/balance', {
                    headers: {
                        'Authorization': authHeader,
                        'for-user-id': partnerData.xendit_account_id,
                    },
                });
                const balanceData = await balanceRes.json();
                const subWalletBalance = Number(balanceData.balance ?? 0);

                if (subWalletBalance < refundAmount) {
                    const shortfall = refundAmount - subWalletBalance;
                    console.log(`❌ Sub-wallet ${partnerData.xendit_account_id} short by ₱${shortfall} for refund`);
                    return new Response(JSON.stringify({
                        error: `Insufficient sub-wallet balance to refund this customer.`,
                        code: 'INSUFFICIENT_SUBWALLET_BALANCE',
                        available_balance: subWalletBalance,
                        required: refundAmount,
                        shortfall,
                        message: `Your Xendit sub-wallet has ₱${subWalletBalance.toFixed(2)} available. You need ₱${refundAmount.toFixed(2)} to refund this customer. Please top up your account or wait for more ticket sales.`
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 402,
                    });
                }
            } catch (e) {
                console.warn('Failed to check sub-wallet balance, proceeding anyway...', e);
            }
        } else {
            // Legacy non-XenPlatform flow: balance check on master wallet
            try {
                const balanceRes = await fetch('https://api.xendit.co/balance', {
                    headers: { 'Authorization': authHeader }
                });
                const balanceData = await balanceRes.json();

                if (balanceData.balance < refundAmount) {
                    return new Response(JSON.stringify({
                        error: `Insufficient Xendit Balance. Available: ${balanceData.balance}, Required: ${refundAmount}`,
                        code: 'INSUFFICIENT_BALANCE',
                        available_balance: balanceData.balance
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 402,
                    });
                }
            } catch (e) {
                console.warn('Failed to check Xendit balance, proceeding anyway...', e);
            }
        }

        // Build Refund Payload
        const idempotencyKey = `refund-${intent_id}-${Date.now()}`;
        const validReasons = ["FRAUDULENT", "DUPLICATE", "REQUESTED_BY_CUSTOMER", "CANCELLATION", "OTHERS"];
        const xenditReason = validReasons.includes(reason.toUpperCase()) ? reason.toUpperCase() : "OTHERS";

        console.log(`📤 xenditReference resolved to: ${xenditReference}`);

        let refundIdField: Record<string, string> = {};
        if (xenditReference.startsWith('pr-')) {
            refundIdField = { payment_request_id: xenditReference };
        } else {
            refundIdField = { invoice_id: xenditReference };
        }

        const refundPayload = {
            ...refundIdField,
            amount: refundAmount,
            reason: xenditReason,
            metadata: {
                intent_id: intent_id,
                user_id: user.id,
                custom_reason: reason,
                intent_type: isExperience ? 'experience' : 'event'
            }
        }

        // @ts-ignore
        Object.keys(refundPayload).forEach(key => refundPayload[key] === undefined && delete refundPayload[key])

        console.log('Sending Refund Request to Xendit:', refundPayload)

        // Build refund headers — add for-user-id if XenPlatform
        const refundHeaders: Record<string, string> = {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
        };
        if (hasSubAccount) {
            refundHeaders['for-user-id'] = partnerData.xendit_account_id;
        }

        const xenditResponse = await fetch('https://api.xendit.co/refunds', {
            method: 'POST',
            headers: refundHeaders,
            body: JSON.stringify(refundPayload)
        })

        const xenditData = await xenditResponse.json()

        if (!xenditResponse.ok) {
            console.error('Xendit Refund Error:', xenditData)
            return new Response(JSON.stringify({ error: xenditData.message || 'Failed to request refund from Xendit', details: xenditData }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: xenditResponse.status,
            })
        }

        // 5. Success - Update Refund Tracking
        try {
            const refundAmount = amount || intent.total_amount;
            if (isExperience) {
                await supabaseAdmin
                    .from('experience_purchase_intents')
                    .update({
                        refunded_amount: refundAmount,
                        refunded_at: new Date().toISOString()
                    })
                    .eq('id', intent_id)

                // Record a negative experience_transaction so refunds
                // reduce the host's available balance and appear in history
                try {
                    await supabaseAdmin
                        .from('experience_transactions')
                        .insert({
                            purchase_intent_id: intent_id,
                            table_id: intent.table_id,
                            host_id: intent.experience?.host_id,
                            user_id: intent.user_id,
                            partner_id: intent.experience?.partner_id || null,
                            gross_amount: -refundAmount,
                            platform_fee: 0,
                            host_payout: -refundAmount,
                            xendit_transaction_id: xenditData.id || null,
                            status: 'refunded',
                        })
                    console.log(`✅ Recorded refund transaction for intent ${intent_id}: -${refundAmount}`)
                } catch (txError) {
                    console.error('Failed to record refund transaction:', txError)
                }
            } else {
                await supabaseAdmin
                    .from('purchase_intents')
                    .update({
                        refunded_amount: refundAmount,
                        refunded_at: new Date().toISOString()
                    })
                    .eq('id', intent_id)
            }
            console.log(`Updated refund tracking for ${intent_id}: ${refundAmount}`)
        } catch (updateError) {
            console.error('Failed to update refund tracking:', updateError)
        }

        // 6. Send Email Notification
        const resendApiKey = resendKey
        if (resendApiKey) {
            try {
                // Determine recipient email
                let recipientEmail = intent.guest_email
                if (!recipientEmail && intent.user_id) {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(intent.user_id)
                    recipientEmail = userData.user?.email
                }

                if (recipientEmail) {
                    await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: 'HangHut Refunds <support@hanghut.com>',
                            to: [recipientEmail],
                            subject: `Refund Initiated for ${eventOrExperienceTitle || 'Your Booking'} 💸`,
                            html: `
                              <div style="font-family: sans-serif; padding: 20px;">
                                <h2>Refund Initiated</h2>
                                <p>Hi there,</p>
                                <p>We've initiated a refund of <strong>PHP ${amount || intent.total_amount}</strong> for your order.</p>
                                <p>It may take 5-10 business days for the funds to appear in your account${intent.payment_method ? ` (${intent.payment_method.toUpperCase()})` : ''}, depending on your bank.</p>
                                <br>
                                <p>Reason: ${reason}</p>
                                <br>
                                <p>Thanks,<br>The HangHut Team</p>
                              </div>
                            `
                        })
                    })
                    console.log(`Refund email sent to ${recipientEmail}`)
                } else {
                    console.log('No recipient email found for refund notification')
                }
            } catch (emailError) {
                console.error('Failed to send refund email:', emailError)
                // Don't fail the request, just log it
            }
        }

        return new Response(JSON.stringify({ success: true, data: xenditData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('CRITICAL UNHANDLED ERROR:', error)

        let errorDetails = error.message;
        if (error.cause) errorDetails += ` (Cause: ${error.cause})`;
        if (error.stack) errorDetails += `\nStack: ${error.stack}`;

        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error.message,
            debug_details: errorDetails
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
