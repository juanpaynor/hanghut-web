/**
 * reconcile-disbursements
 *
 * Safety net for refund disbursements stuck in 'pending' because Xendit's
 * payout.succeeded / payout.failed webhook was missed. Without this, a missed
 * webhook leaves the order locked forever (refunded_at set, tickets not voided).
 *
 * Meant to run on pg_cron (e.g. every 4 hours). For each refund_disbursements row
 * that has been 'pending' for > 2 hours, calls GET /v2/payouts/{id} and routes the
 * result to the same RPCs the webhook uses:
 *   SUCCEEDED          → complete_disbursement_refund (reversal + void tickets)
 *   FAILED / CANCELLED → fail_disbursement_refund     (release the lock)
 *   ACCEPTED / LOCKED / PENDING / REQUIRES_ACTION → still in-flight, leave it.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!xenditKey) {
        return new Response(JSON.stringify({ error: 'Missing XENDIT_SECRET_KEY' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // Pending refund disbursements older than 2h (give the webhook ample time first),
    // that actually reached Xendit (have a disbursement id).
    const { data: stuck, error: fetchError } = await supabase
        .from('refund_disbursements')
        .select('id, xendit_disbursement_id, partner:partners!partner_id ( xendit_account_id )')
        .eq('status', 'pending')
        .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .not('xendit_disbursement_id', 'is', null)

    if (fetchError) {
        console.error('❌ Failed to fetch stuck disbursements:', fetchError)
        return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    if (!stuck || stuck.length === 0) {
        return new Response(JSON.stringify({ reconciled: 0, skipped: 0 }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    console.log(`🔍 Reconciling ${stuck.length} pending disbursement(s)...`)

    const authHeader = `Basic ${btoa(xenditKey + ':')}`
    let reconciled = 0
    let skipped = 0

    for (const row of stuck as any[]) {
        try {
            const subAccountId = row.partner?.xendit_account_id || null
            const headers: Record<string, string> = { Authorization: authHeader }
            if (subAccountId) headers['for-user-id'] = subAccountId

            const res = await fetch(
                `https://api.xendit.co/v2/payouts/${row.xendit_disbursement_id}`,
                { headers },
            )

            if (!res.ok) {
                console.warn(`⚠️ Xendit returned ${res.status} for disbursement ${row.id} — skipping`)
                skipped++
                continue
            }

            const payout = await res.json()
            const status: string = payout.status ?? ''
            console.log(`  Disbursement ${row.id}: Xendit status = ${status}`)

            if (status === 'SUCCEEDED') {
                const { error } = await supabase.rpc('complete_disbursement_refund', { p_disbursement_id: row.id })
                if (error) { console.error(`  ❌ complete RPC failed:`, error); skipped++; continue }
                console.log('  ✅ Completed via reconcile')
                reconciled++
            } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REVERSED') {
                await supabase.rpc('fail_disbursement_refund', {
                    p_disbursement_id: row.id,
                    p_reason: `Auto-reconciled from Xendit: ${status}`,
                })
                console.log('  ↩️ Failed via reconcile — lock released')
                reconciled++
            } else {
                // ACCEPTED, LOCKED, PENDING, REQUIRES_ACTION — still in-flight, leave it.
                console.log(`  ⏳ Still in-flight (${status}) — leaving pending`)
                skipped++
            }
        } catch (e) {
            console.error(`  ❌ Error reconciling disbursement ${row.id}:`, e)
            skipped++
        }
    }

    console.log(`Done — reconciled: ${reconciled}, skipped: ${skipped}`)
    return new Response(JSON.stringify({ reconciled, skipped }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
})
