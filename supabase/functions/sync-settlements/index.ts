import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Normalise a reference so both sides of the match agree.
 *
 * We send Xendit `intent_<uuid>` as reference_id, but the Transactions API returns
 * it with a random suffix appended — `intent_<uuid>_f0wREoqshb`. The old exact-match
 * therefore never matched card payments, which is why settlement data stayed empty.
 * Keying on the embedded UUID is stable across both forms.
 */
const REF_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
function refKey(ref: string | null | undefined): string {
    if (!ref) return ''
    const m = REF_UUID_RE.exec(ref)
    return m ? m[0].toLowerCase() : ref
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * sync-settlements
 *
 * Pulls the REAL Xendit numbers onto purchase_intents so the payouts UI and the
 * platform solvency guard read truth instead of arithmetic:
 *   - settlement_status / estimated_settlement_time / settled_at
 *   - net_amount + fee.xendit_fee + fee.value_added_tax  (what Xendit ACTUALLY charged;
 *     the webhook's PROCESSING_FEE_RATES table is only an estimate and has already
 *     drifted — a ₱9 gap on one payout, and 6 transactions recorded at ₱0 fee)
 *
 * TWO MODES
 *   - User mode: called with a user JWT + { partner_id }. Caller must be that partner
 *     or an admin. This is what the organizer payouts page triggers on mount.
 *   - Service mode: called with the service-role key (cron). partner_id optional; with
 *     none, sweeps every partner that has pending intents.
 *
 * SAFE BY CONSTRUCTION: read-only against Xendit (GET /transactions); writes only our
 * own nullable settlement_* / xendit_* columns. No match → nothing written.
 */

interface SyncResult { partner_id: string; checked: number; matched: number; updated: number }

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('Missing XENDIT_SECRET_KEY')

        const admin = createClient(sbUrl, sbServiceKey)

        // Is this the cron calling with the service-role key, or a signed-in organizer?
        const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
        const isServiceRole = !!sbServiceKey && bearer === sbServiceKey

        let body: any = {}
        try { body = await req.json() } catch { /* cron may post {} or nothing */ }
        const requestedPartnerId: string | null = body?.partner_id ?? null

        let partnerIds: string[] = []

        if (isServiceRole) {
            if (requestedPartnerId) {
                partnerIds = [requestedPartnerId]
            } else {
                // Sweep: every partner with a completed intent still missing real data.
                const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
                const { data: rows } = await admin
                    .from('purchase_intents')
                    .select('events!inner(organizer_id)')
                    .eq('status', 'completed')
                    .gte('paid_at', ninetyDaysAgo)
                    .not('xendit_external_id', 'is', null)
                    .limit(2000)
                partnerIds = [...new Set((rows ?? []).map((r: any) =>
                    Array.isArray(r.events) ? r.events[0]?.organizer_id : r.events?.organizer_id
                ).filter(Boolean))]
            }
        } else {
            const supabaseClient = createClient(sbUrl, sbAnonKey, {
                global: { headers: { Authorization: req.headers.get('Authorization')! } },
            })
            const { data: { user } } = await supabaseClient.auth.getUser()
            if (!user) return json({ error: 'Unauthorized' }, 401)
            if (!requestedPartnerId) return json({ error: 'Missing partner_id' }, 400)

            const { data: partner } = await admin
                .from('partners').select('id, user_id').eq('id', requestedPartnerId).single()
            if (!partner) return json({ error: 'Partner not found' }, 404)

            let isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.is_admin === true
            if (!isAdmin) {
                const { data: dbUser } = await admin.from('users').select('is_admin').eq('id', user.id).maybeSingle()
                if (dbUser?.is_admin === true) isAdmin = true
            }
            if (!isAdmin && partner.user_id !== user.id) return json({ error: 'Unauthorized' }, 403)
            partnerIds = [requestedPartnerId]
        }

        const results: SyncResult[] = []
        for (const pid of partnerIds) {
            results.push(await syncPartner(admin, xenditKey, pid))
        }

        const totals = results.reduce((a, r) => ({
            checked: a.checked + r.checked, matched: a.matched + r.matched, updated: a.updated + r.updated,
        }), { checked: 0, matched: 0, updated: 0 })

        return json({ ok: true, mode: isServiceRole ? 'service' : 'user', partners: results.length, ...totals, results }, 200)
    } catch (error: any) {
        console.error('[sync-settlements] ERROR:', error)
        return json({ error: 'Internal Server Error', message: error.message }, 500)
    }

    function json(payload: unknown, status: number) {
        return new Response(JSON.stringify(payload), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status,
        })
    }
})

async function syncPartner(admin: any, xenditKey: string, partnerId: string): Promise<SyncResult> {
    const empty: SyncResult = { partner_id: partnerId, checked: 0, matched: 0, updated: 0 }

    const { data: partner } = await admin
        .from('partners').select('id, xendit_account_id, use_main_wallet').eq('id', partnerId).single()
    if (!partner) return empty

    // Paid intents from the last 90 days that still lack real settlement OR real fees.
    // FREE tickets are excluded: they have an external id but no Xendit transaction, so
    // they can never match and would keep the early-exit from ever firing.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: intents } = await admin
        .from('purchase_intents')
        .select('id, xendit_external_id, paid_at, events!inner(organizer_id)')
        .eq('events.organizer_id', partnerId)
        // purchase_intent_status enum has no 'paid' — a paid intent is 'completed'.
        .eq('status', 'completed')
        .or('settlement_status.is.null,settlement_status.eq.PENDING,xendit_fee.is.null,xendit_channel_code.is.null')
        .gte('paid_at', ninetyDaysAgo)
        .not('xendit_external_id', 'is', null)
        .neq('payment_method', 'FREE')
        .limit(300)

    if (!intents || intents.length === 0) return empty

    const byRef = new Map<string, string>()
    let earliestPaid = Date.now()
    for (const i of intents as any[]) {
        if (i.xendit_external_id) byRef.set(refKey(i.xendit_external_id), i.id)
        const t = i.paid_at ? new Date(i.paid_at).getTime() : NaN
        if (!Number.isNaN(t) && t < earliestPaid) earliestPaid = t
    }
    const createdGte = new Date(earliestPaid - 24 * 60 * 60 * 1000).toISOString()

    const xHeaders: Record<string, string> = { 'Authorization': `Basic ${btoa(xenditKey + ':')}` }
    if (partner.xendit_account_id && !partner.use_main_wallet) {
        xHeaders['for-user-id'] = partner.xendit_account_id
    }

    const found = new Map<string, {
        settlement_status?: string; estimated_settlement_time?: string
        net_amount?: number; fee?: number; fee_vat?: number; fee_status?: string; channel_code?: string
    }>()
    let afterId: string | null = null
    for (let page = 0; page < 12 && found.size < byRef.size; page++) {
        const url = new URL('https://api.xendit.co/transactions')
        url.searchParams.set('limit', '50')
        url.searchParams.set('types', 'PAYMENT')
        // Successful attempts only. A retried card can leave several transactions
        // sharing one intent UUID; without this the reference match could land on a
        // FAILED/VOIDED attempt and read its settlement status instead.
        url.searchParams.set('statuses', 'SUCCESS')
        // The transaction object's currency defaults to IDR — be explicit.
        url.searchParams.set('currency', 'PHP')
        url.searchParams.set('created[gte]', createdGte)
        if (afterId) url.searchParams.set('after_id', afterId)

        const res = await fetch(url.toString(), { headers: xHeaders })
        if (!res.ok) {
            console.error(`[sync-settlements] ${partnerId} Xendit ${res.status}: ${await res.text()}`)
            break
        }
        const bodyJson = await res.json()
        const rows: any[] = bodyJson?.data ?? []
        if (rows.length === 0) break

        for (const t of rows) {
            const ref = refKey(t.reference_id)
            if (ref && byRef.has(ref) && !found.has(ref)) {
                found.set(ref, {
                    settlement_status: (t.settlement_status || '').toUpperCase() || undefined,
                    estimated_settlement_time: t.estimated_settlement_time || undefined,
                    net_amount: t.net_amount != null ? Number(t.net_amount) : undefined,
                    fee: t.fee?.xendit_fee != null ? Number(t.fee.xendit_fee) : undefined,
                    fee_vat: t.fee?.value_added_tax != null ? Number(t.fee.value_added_tax) : undefined,
                    fee_status: t.fee?.status || undefined,
                    channel_code: t.channel_code || undefined,
                })
            }
        }

        afterId = rows[rows.length - 1]?.id ?? null
        if (!bodyJson?.has_more || !afterId) break
    }

    let updated = 0
    for (const [ref, data] of found) {
        const intentId = byRef.get(ref)!
        const isSettled = data.settlement_status === 'SETTLED' || data.settlement_status === 'EARLY_SETTLED'
        const patch: Record<string, unknown> = {
            settlement_status: data.settlement_status ?? null,
            estimated_settlement_time: data.estimated_settlement_time ?? null,
            settled_at: isSettled ? new Date().toISOString() : null,
            settlement_synced_at: new Date().toISOString(),
        }
        if (data.channel_code !== undefined) patch.xendit_channel_code = data.channel_code
        if (data.fee_status !== undefined) patch.xendit_fee_status = data.fee_status

        // Xendit reports fee 0 / status PENDING until the transaction settles. Writing
        // that 0 would look authoritative and claim the sale cost us nothing, so only
        // record the money figures once the fee is COMPLETED. Left null, the intent stays
        // in the sync's candidate filter and is picked up again on the next run.
        const feeIsReal = data.fee_status === 'COMPLETED'
        if (feeIsReal) {
            if (data.net_amount !== undefined) patch.xendit_net_amount = data.net_amount
            if (data.fee !== undefined) patch.xendit_fee = data.fee
            if (data.fee_vat !== undefined) patch.xendit_fee_vat = data.fee_vat
        }

        const { error } = await admin.from('purchase_intents').update(patch).eq('id', intentId)
        if (!error) updated++
    }

    return { partner_id: partnerId, checked: byRef.size, matched: found.size, updated }
}
