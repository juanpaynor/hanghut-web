import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Xendit disbursement fee (Philippines): flat ₱10 + 12% VAT = ₱11.20 per payout,
// charged on top of the requested amount and debited from the sub-wallet. Must be
// reserved so a payout (amount + fee) can never overdraw the wallet at Xendit.
const DISBURSEMENT_FEE_TOTAL = 11.2

// Business days Xendit holds funds per channel. Mirrors src/lib/utils/settlement.ts;
// the default leans slow so an unrecognised method is never released early.
const SETTLEMENT_DAYS: Record<string, number> = {
    gcash: 2, grabpay: 2, shopeepay: 2, maya: 2, paymaya: 2,
    qrph: 1, qr_code: 1,
    card: 5, cards: 5, credit_card: 5, debit_card: 5,
    direct_debit: 1, bpi: 1, ubp: 1,
    bank_transfer: 2, virtual_account: 2,
    otc: 3, over_the_counter: 3, '7eleven': 3, cebuana: 3,
    multiple: 5, unknown: 5,
}
const DEFAULT_SETTLEMENT_DAYS = 5

function addBusinessDays(date: Date, days: number): Date {
    const d = new Date(date)
    let added = 0
    while (added < days) {
        d.setUTCDate(d.getUTCDate() + 1)
        const day = d.getUTCDay()
        if (day !== 0 && day !== 6) added++
    }
    return d
}

/**
 * Has Xendit released this money yet?
 *
 * Real settlement data always wins. The estimate is only a fallback, and it skips
 * weekends but not PH bank holidays — so it can read very slightly early in a
 * holiday week. The +2 business-day buffer covers that; the durable fix is the
 * sync-settlements cron populating real data.
 */
function isSettled(createdAt: string, intent: any): boolean {
    const status = String(intent?.settlement_status || '').toUpperCase()
    if (intent?.settled_at || status === 'SETTLED' || status === 'EARLY_SETTLED') return true

    // Xendit told us when it lands — trust that over any guess.
    if (intent?.estimated_settlement_time) {
        return new Date() >= new Date(intent.estimated_settlement_time)
    }
    if (status === 'PENDING') return false

    const method = String(intent?.payment_method || '').toLowerCase().replace(/\s+/g, '_')
    const days = SETTLEMENT_DAYS[method] ?? DEFAULT_SETTLEMENT_DAYS
    return new Date() >= addBusinessDays(addBusinessDays(new Date(createdAt), days), 2)
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Initialize Supabase Client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Validate User Session (Authorization Header)
        // We manually verify the JWT because we need the user_id securely
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
        }

        // 3. Parse Input
        const { amount, bank_account_id } = await req.json()
        if (!amount || amount <= 0) throw new Error('Invalid amount')
        if (!bank_account_id) throw new Error('Missing bank_account_id')

        // 4. Get Partner & Bank Details
        // Find the partner associated with this user
        const { data: partner, error: partnerError } = await supabaseClient
            .from('partners')
            .select('*, xendit_account_id, split_rule_id, platform_fee_receivable')
            .eq('user_id', user.id)
            .single()

        if (partnerError || !partner) {
            throw new Error('Partner account not found for this user')
        }

        console.log(`🔍 PAYOUT DEBUG: user.id=${user.id}, partner.id=${partner.id}, partner.business_name=${partner.business_name}`)

        // Validate Bank Account ownership
        const { data: bankAccount, error: bankError } = await supabaseClient
            .from('bank_accounts')
            .select('*')
            .eq('id', bank_account_id)
            .eq('partner_id', partner.id)
            .single()

        if (bankError || !bankAccount) {
            throw new Error('Invalid bank account')
        }

        // 5. FETCH ELIGIBLE TRANSACTIONS (used for reconciliation/linking below)
        // Fetch Event Transactions
        const { data: eventTransactionsRaw, error: eventTxError } = await supabaseClient
            .from('transactions')
            .select('id, organizer_payout, created_at, purchase_intent:purchase_intents(payment_method, settlement_status, settled_at, estimated_settlement_time)')
            .eq('partner_id', partner.id)
            .eq('status', 'completed')
            .is('payout_id', null)

        const eventTransactions = eventTransactionsRaw || []

        // Money Xendit still holds is NOT withdrawable. Used for the LEDGER BALANCE
        // ONLY (main-wallet partners), never for linking: a sub-wallet partner's
        // amount comes from Xendit's real balance, so filtering their link list by
        // our *estimate* could leave paid-out transactions unlinked — they'd then be
        // counted again in a later payout.
        const settledEventTransactions = eventTransactions.filter((tx: any) => {
            const intent = Array.isArray(tx.purchase_intent) ? tx.purchase_intent[0] : tx.purchase_intent
            return isSettled(tx.created_at, intent)
        })

        const heldBack = eventTransactions.length - settledEventTransactions.length
        if (heldBack > 0) {
            console.log(`⏳ ${heldBack} unsettled transaction(s) excluded from ledger-balance eligibility`)
        }

        console.log(`🔍 PAYOUT DEBUG: eventTransactions count=${eventTransactions.length}, settled=${settledEventTransactions.length}, error=${eventTxError?.message ?? 'none'}`)

        if (eventTxError) throw new Error('Failed to fetch eligible event transactions')

        // Fetch Experience Transactions
        const { data: expTransactions, error: expTxError } = await supabaseClient
            .from('experience_transactions')
            .select('id, host_payout')
            .eq('partner_id', partner.id)
            .eq('status', 'completed')
            .is('payout_id', null)

        console.log(`🔍 PAYOUT DEBUG: expTransactions count=${expTransactions?.length ?? 0}, error=${expTxError?.message ?? 'none'}`)

        if (expTxError) throw new Error('Failed to fetch eligible experience transactions')

        // 6. CALCULATE AVAILABLE BALANCE
        // Xendit applies the split rule + PLATFORM fee + processing AT SETTLEMENT
        // (see create-purchase-intent: fees:[{type:'PLATFORM'}] + with-split-rule +
        // for-user-id), so a sub-account partner's wallet balance IS their net earnings.
        // Source of truth = the Xendit sub-wallet, NOT the recomputed transactions ledger
        // (which can drift/go negative on edge-case pricing).
        let calculatedAmount = 0
        if (partner.xendit_account_id && partner.use_main_wallet !== true) {
            const xenditSecret = Deno.env.get('XENDIT_SECRET_KEY')
            if (!xenditSecret) throw new Error('Payment service not configured (Missing API Key)')

            const balRes = await fetch('https://api.xendit.co/balance?account_type=CASH', {
                headers: {
                    'Authorization': `Basic ${btoa(xenditSecret + ':')}`,
                    'for-user-id': partner.xendit_account_id,
                },
            })
            const balData = await balRes.json()
            if (!balRes.ok) {
                throw new Error(`Failed to fetch wallet balance: ${balData.message || balRes.status}`)
            }
            const walletBalance = Number(balData.balance) || 0

            // Reserve payouts already requested but NOT yet disbursed through Xendit
            // (those haven't debited the Xendit balance yet), so they can't be double-spent.
            const { data: openPayouts } = await supabaseClient
                .from('payouts')
                .select('amount, xendit_disbursement_id')
                .eq('partner_id', partner.id)
                .in('status', ['pending_request', 'approved', 'processing'])
            const reserved = (openPayouts || [])
                .filter((p: any) => !p.xendit_disbursement_id)
                .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)

            calculatedAmount = walletBalance - reserved
            console.log(`🔍 PAYOUT DEBUG (wallet): walletBalance=${walletBalance}, reserved=${reserved}, available=${calculatedAmount}, requestedAmount=${amount}`)
        } else {
            // Main-wallet partners have no sub-wallet — their money sits in the HangHut
            // platform account, so the ledger IS the balance.
            //
            // Use the CANONICAL definition (get_partner_balance) rather than summing here.
            // Three surfaces used to re-implement this with different filters and disagreed:
            // the old predicate (status='completed' AND payout_id IS NULL) is blind to
            // refund rows, to payouts whose transaction linking silently failed, and to
            // rejected payouts that never released their links. It already mis-stated two
            // live accounts. Canonical sums signed rows across all three revenue streams
            // and subtracts payouts by status, so none of those can hide.
            const { data: balRows, error: balErr } = await supabaseClient
                .rpc('get_partner_balance', { p_partner_id: partner.id })
            if (balErr) throw new Error(`Failed to compute balance: ${balErr.message}`)
            const canonicalBalance = Number(balRows?.[0]?.balance ?? 0)

            // Money Xendit hasn't released yet is owed but NOT withdrawable.
            const unsettledAmount = eventTransactions.reduce((sum: number, tx: any) => {
                const intent = Array.isArray(tx.purchase_intent) ? tx.purchase_intent[0] : tx.purchase_intent
                return isSettled(tx.created_at, intent) ? sum : sum + (Number(tx.organizer_payout) || 0)
            }, 0)

            calculatedAmount = Math.max(0, canonicalBalance - unsettledAmount)
            console.log(`🔍 PAYOUT DEBUG (ledger): canonical=${canonicalBalance}, unsettled=${unsettledAmount}, available=${calculatedAmount}, requestedAmount=${amount}`)

            // ---- SOLVENCY GUARD ----
            // Every main-wallet partner is paid from ONE Xendit account. A withdrawal that
            // is correct for THIS partner can still be funded by another partner's money —
            // Xendit sees one account and one valid transfer, so nothing errors and no
            // per-partner check can catch it. The only detector is:
            //     master balance  vs  SUM(obligations across all main-wallet partners)
            const xenditSecret = Deno.env.get('XENDIT_SECRET_KEY')
            if (!xenditSecret) throw new Error('Payment service not configured (Missing API Key)')

            const mainBalRes = await fetch('https://api.xendit.co/balance?account_type=CASH', {
                headers: { 'Authorization': `Basic ${btoa(xenditSecret + ':')}` },
            })
            const mainBalData = await mainBalRes.json()
            if (!mainBalRes.ok) {
                throw new Error(`Failed to fetch platform balance: ${mainBalData.message || mainBalRes.status}`)
            }
            const masterBalance = Number(mainBalData.balance) || 0

            const { data: oblRows, error: oblErr } = await supabaseClient.rpc('get_main_wallet_obligations')
            if (oblErr) throw new Error(`Failed to compute platform obligations: ${oblErr.message}`)
            const totalObligation = Number(oblRows?.[0]?.total_obligation ?? 0)
            const freeCash = masterBalance - totalObligation

            console.log(`🏦 SOLVENCY: master=${masterBalance}, obligations=${totalObligation}, freeCash=${freeCash}`)

            // Insolvent means partner money has already been spent. Paying ANYONE now uses
            // someone else's funds, so refuse and surface it rather than compounding it.
            if (freeCash < 0) {
                console.error(`🚨 MAIN WALLET SHORT by ₱${Math.abs(freeCash)} — blocking all main-wallet payouts`)
                return new Response(JSON.stringify({
                    error: 'Payouts are temporarily unavailable. Our team has been notified.',
                    code: 'PLATFORM_BALANCE_SHORTFALL',
                }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            // Cash on hand still has to cover this specific transfer.
            if (amount > masterBalance) {
                return new Response(JSON.stringify({
                    error: 'Payouts are temporarily unavailable. Our team has been notified.',
                    code: 'PLATFORM_BALANCE_SHORTFALL',
                }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // Validate Balance
        if (calculatedAmount <= 0) {
            throw new Error('No funds available for payout')
        }

        if (amount > calculatedAmount) {
            throw new Error(`Insufficient balance. Available: ${calculatedAmount}, Requested: ${amount}`)
        }

        // 7. CHECK AUTO-APPROVAL
        const limit = Number(partner.payout_limit) || 50000 // Default 50k
        const isAutoApprovable = partner.auto_approve_enabled && amount <= limit
        const initialStatus = isAutoApprovable ? 'processing' : 'pending_request'

        // 7. Insert Payout Record — uses the REQUESTED amount, not the full balance
        const { data: payout, error: insertError } = await supabaseClient
            .from('payouts')
            .insert({
                partner_id: partner.id,
                amount: amount, // Use the partner's requested amount
                currency: 'PHP',
                bank_name: bankAccount.bank_code,
                bank_account_number: bankAccount.account_number,
                bank_account_name: bankAccount.account_holder_name,
                status: initialStatus,
                admin_notes: isAutoApprovable ? 'Auto-approved via Edge Function' : 'Pending Manual Review'
            })
            .select()
            .single()

        if (insertError) throw new Error('Failed to create payout record: ' + insertError.message)

        // 9. RECONCILIATION: LINK ONLY ENOUGH TRANSACTIONS TO COVER REQUESTED AMOUNT
        let linkFailed = false;
        let accumulated = 0;
        const eventTxIdsToLink: string[] = [];
        const expTxIdsToLink: string[] = [];

        // Accumulate event transactions until we cover the requested amount
        for (const tx of (eventTransactions || []) as any[]) {
            if (accumulated >= amount) break;
            eventTxIdsToLink.push(tx.id);
            accumulated += Number(tx.organizer_payout) || 0;
        }

        // If event transactions weren't enough, accumulate experience transactions
        if (accumulated < amount) {
            for (const tx of (expTransactions || []) as any[]) {
                if (accumulated >= amount) break;
                expTxIdsToLink.push(tx.id);
                accumulated += Number(tx.host_payout) || 0;
            }
        }

        console.log(`🔍 PAYOUT LINK: linking ${eventTxIdsToLink.length} event txs + ${expTxIdsToLink.length} exp txs (accumulated=${accumulated} for requested=${amount})`);

        // Link selected event transactions
        if (eventTxIdsToLink.length > 0) {
            const { error: linkError } = await supabaseClient
                .from('transactions')
                .update({ payout_id: payout.id })
                .in('id', eventTxIdsToLink)

            if (linkError) {
                console.error('CRITICAL: Failed to link event transactions to payout', linkError)
                linkFailed = true;
            }
        }

        // Link selected experience transactions
        if (expTxIdsToLink.length > 0) {
            const { error: linkError } = await supabaseClient
                .from('experience_transactions')
                .update({ payout_id: payout.id })
                .in('id', expTxIdsToLink)

            if (linkError) {
                console.error('CRITICAL: Failed to link experience transactions to payout', linkError)
                linkFailed = true;
            }
        }

        if (linkFailed) {
            await supabaseClient.from('payouts').update({ admin_notes: 'WARNING: Transaction linking failed. Manual reconciliation needed.' }).eq('id', payout.id)
        }

        // 8. EXECUTE XENDIT PAYOUT (If Auto-Approved)
        let xenditResponse = null
        if (isAutoApprovable) {
            const xenditSecret = Deno.env.get('XENDIT_SECRET_KEY')
            if (!xenditSecret) {
                // Log critical error but don't fail the request to user, keep it as 'processing' (admin will see it stuck)
                console.error('CRITICAL: Missing XENDIT_SECRET_KEY')
                await supabaseClient.from('payouts').update({ admin_notes: 'Auto-approve failed: Missing Xendit Key' }).eq('id', payout.id)
            } else {
                try {
                    // Xendit Payouts V2 API
                    // XenPlatform: Disburse from partner's sub-wallet
                    const payoutHeaders: Record<string, string> = {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${btoa(xenditSecret + ':')}`,
                        'Idempotency-key': payout.id,
                    };
                    if (partner.xendit_account_id) {
                        payoutHeaders['for-user-id'] = partner.xendit_account_id;
                    }

                    // Auto-deduct platform_fee_receivable from payout
                    let payoutAmount = amount;
                    let feeDeducted = 0;
                    const receivable = Number(partner.platform_fee_receivable) || 0;
                    if (receivable > 0 && partner.xendit_account_id) {
                        feeDeducted = Math.min(receivable, amount);
                        payoutAmount = amount - feeDeducted;
                        console.log(`💰 Auto-deducting ₱${feeDeducted} from payout (platform_fee_receivable: ₱${receivable})`);

                        if (payoutAmount <= 0) {
                            // Entire payout goes to settling receivable
                            await supabaseClient.from('payouts').update({
                                status: 'completed',
                                admin_notes: `Entire payout of ₱${amount} used to settle platform fee receivable`,
                            }).eq('id', payout.id);

                            await supabaseClient.from('partners').update({
                                platform_fee_receivable: receivable - amount,
                            }).eq('id', partner.id);

                            return new Response(JSON.stringify({
                                success: true,
                                payout: payout,
                                fee_deducted: amount,
                                message: `Entire payout used to settle ₱${amount} of outstanding platform fees`,
                            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                        }
                    }

                    const response = await fetch('https://api.xendit.co/v2/payouts', {
                        method: 'POST',
                        headers: payoutHeaders,
                        body: JSON.stringify({
                            reference_id: payout.id,
                            channel_code: bankAccount.bank_code,
                            channel_properties: {
                                account_holder_name: bankAccount.account_holder_name,
                                account_number: bankAccount.account_number
                            },
                            amount: payoutAmount,
                            currency: 'PHP',
                            description: `Payout for ${partner.business_name}${feeDeducted > 0 ? ` (₱${feeDeducted} deducted for platform fees)` : ''}`
                        })
                    })

                    const responseData = await response.json()

                    if (!response.ok) {
                        throw new Error(`Xendit Error: ${responseData.message || JSON.stringify(responseData)}`)
                    }

                    xenditResponse = responseData

                    await supabaseClient
                        .from('payouts')
                        .update({
                            xendit_external_id: responseData.reference_id,
                            xendit_disbursement_id: responseData.id,
                            status: 'processing'
                        })
                        .eq('id', payout.id)

                    // Update platform_fee_receivable if we deducted
                    if (feeDeducted > 0) {
                        await supabaseClient.from('partners').update({
                            platform_fee_receivable: receivable - feeDeducted,
                        }).eq('id', partner.id);
                        console.log(`✅ Settled ₱${feeDeducted} of platform_fee_receivable`);
                    }

                } catch (xenditErr) {
                    console.error('Xendit Payout Failed:', xenditErr)
                    // Revert status to pending_request or failed so admin notices
                    await supabaseClient
                        .from('payouts')
                        .update({
                            status: 'pending_request', // Fallback to manual
                            admin_notes: `Auto-approval failed: ${xenditErr.message}`
                        })
                        .eq('id', payout.id)

                    // 🔧 FIX: Unlink transactions so balance is correct for next attempt
                    await supabaseClient
                        .from('transactions')
                        .update({ payout_id: null })
                        .eq('payout_id', payout.id)

                    await supabaseClient
                        .from('experience_transactions')
                        .update({ payout_id: null })
                        .eq('payout_id', payout.id)

                    console.log(`🔓 Transactions unlinked from failed auto-payout ${payout.id}`)
                }
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                payout: payout,
                balance_after: calculatedAmount - amount // Remaining balance
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Request Payout Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: corsHeaders }
        )
    }
})
