/**
 * sync-payout-statuses
 *
 * Safety net for payouts stuck in flight because Xendit's payout.succeeded /
 * payout.failed webhooks were missed or not configured.
 *
 * Runs on pg_cron every 4 hours. For each payout that has been in flight for more
 * than 2 hours, calls GET /v2/payouts/{xendit_disbursement_id} and syncs the
 * result back to our payouts table.
 *
 * IN-FLIGHT IS 'approved', NOT 'processing'. approve-payout sets 'processing'
 * only as a brief optimistic-concurrency lock while it calls Xendit, then rests
 * at 'approved' once the disbursement is accepted. This job used to query
 * 'processing' alone, so it matched a state that exists for milliseconds and
 * reported "no stuck payouts" on every run — a ₱24,000 payout sat at 'approved'
 * for six days with nothing able to advance it.
 *
 * Xendit V2 payout statuses:
 *   ACCEPTED, LOCKED  → still in-flight → leave as-is
 *   SUCCEEDED         → completed
 *   FAILED, CANCELLED → failed (also unlinks transactions so balance is restored)
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

  // Fetch payouts in flight for > 2 hours. 'processing' is kept in the filter so a
  // payout whose approve-payout run died mid-call still gets reconciled.
  const { data: stuckPayouts, error: fetchError } = await supabase
    .from('payouts')
    .select('id, xendit_disbursement_id, partner_id, amount, status')
    .in('status', ['approved', 'processing'])
    .lt('updated_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .not('xendit_disbursement_id', 'is', null)

  if (fetchError) {
    console.error('❌ Failed to fetch stuck payouts:', fetchError)
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!stuckPayouts || stuckPayouts.length === 0) {
    console.log('✅ No stuck payouts found')
    return new Response(JSON.stringify({ synced: 0, skipped: 0, results: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log(`🔍 Checking ${stuckPayouts.length} in-flight payout(s)...`)

  const authHeader = `Basic ${btoa(xenditKey + ':')}`
  let synced = 0
  let skipped = 0
  const results: { id: string; amount: number; xendit_status: string; action: string }[] = []

  for (const payout of stuckPayouts) {
    try {
      const res = await fetch(
        `https://api.xendit.co/v2/payouts/${payout.xendit_disbursement_id}`,
        { headers: { Authorization: authHeader } },
      )

      if (!res.ok) {
        console.warn(`⚠️ Xendit returned ${res.status} for payout ${payout.id} — skipping`)
        results.push({ id: payout.id, amount: Number(payout.amount), xendit_status: `HTTP ${res.status}`, action: 'skipped' })
        skipped++
        continue
      }

      const xenditPayout = await res.json()
      const xenditStatus: string = xenditPayout.status ?? ''

      console.log(`  Payout ${payout.id}: Xendit status = ${xenditStatus}`)

      if (xenditStatus === 'SUCCEEDED') {
        await supabase
          .from('payouts')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', payout.id)
        console.log(`  ✅ Marked completed`)
        results.push({ id: payout.id, amount: Number(payout.amount), xendit_status: xenditStatus, action: 'completed' })
        synced++

      } else if (xenditStatus === 'FAILED' || xenditStatus === 'CANCELLED') {
        await supabase
          .from('payouts')
          .update({
            status: 'failed',
            admin_notes: `Auto-synced from Xendit: ${xenditStatus}`,
          })
          .eq('id', payout.id)

        // Unlink transactions so balance is restored
        await Promise.all([
          supabase.from('transactions').update({ payout_id: null }).eq('payout_id', payout.id),
          supabase.from('experience_transactions').update({ payout_id: null }).eq('payout_id', payout.id),
        ])

        console.log(`  ❌ Marked failed, transactions unlinked`)
        results.push({ id: payout.id, amount: Number(payout.amount), xendit_status: xenditStatus, action: 'failed+unlinked' })
        synced++

      } else {
        // ACCEPTED, LOCKED — still in-flight, leave it
        console.log(`  ⏳ Still in-flight (${xenditStatus}) — leaving as-is`)
        results.push({ id: payout.id, amount: Number(payout.amount), xendit_status: xenditStatus, action: 'left in-flight' })
        skipped++
      }
    } catch (e) {
      console.error(`  ❌ Error processing payout ${payout.id}:`, e)
      results.push({ id: payout.id, amount: Number(payout.amount), xendit_status: 'error', action: 'skipped' })
      skipped++
    }
  }

  console.log(`Done — synced: ${synced}, skipped: ${skipped}`)

  return new Response(JSON.stringify({ synced, skipped, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
