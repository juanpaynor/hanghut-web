import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * sync-settlements
 *
 * Populates the REAL Xendit settlement status onto purchase_intents so the
 * payouts UI shows the truth instead of a T+N estimate. Reads Xendit's
 * Transactions API (settlement_status + estimated_settlement_time) and matches
 * each transaction to our intent by reference_id === purchase_intents.xendit_external_id.
 *
 * SAFE BY CONSTRUCTION:
 *  - Read-only against Xendit (GET /transactions); writes only our own nullable
 *    settlement_* columns.
 *  - Only writes on an EXACT reference_id match, and only ever stores Xendit's
 *    own settlement_status verbatim (never a computed guess). No match → nothing
 *    written → the UI keeps its honest estimate fallback.
 *  - Throttled: only touches paid, not-yet-settled intents from the last 90 days.
 */

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('Missing XENDIT_SECRET_KEY')

        const supabaseClient = createClient(sbUrl, sbAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } },
        })
        const admin = createClient(sbUrl, sbServiceKey)

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) {
            return json({ error: 'Unauthorized' }, 401)
        }

        const { partner_id } = await req.json()
        if (!partner_id) return json({ error: 'Missing partner_id' }, 400)

        // Authorization: admin or partner owner
        const { data: partner } = await admin
            .from('partners')
            .select('id, user_id, xendit_account_id, use_main_wallet')
            .eq('id', partner_id)
            .single()
        if (!partner) return json({ error: 'Partner not found' }, 404)

        let isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.is_admin === true
        if (!isAdmin) {
            const { data: dbUser } = await admin.from('users').select('is_admin').eq('id', user.id).maybeSingle()
            if (dbUser?.is_admin === true) isAdmin = true
        }
        if (!isAdmin && partner.user_id !== user.id) return json({ error: 'Unauthorized' }, 403)

        // 1. Our paid, not-yet-settled intents (last 90 days) that still need a real status.
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        const { data: intents } = await admin
            .from('purchase_intents')
            .select('id, xendit_external_id, paid_at, events!inner(organizer_id)')
            .eq('events.organizer_id', partner_id)
            // purchase_intent_status enum has no 'paid' — a paid intent is 'completed'.
            // (Passing 'paid' made Postgres reject the whole query → sync silently no-op'd.)
            .eq('status', 'completed')
            .or('settlement_status.is.null,settlement_status.eq.PENDING')
            .gte('paid_at', ninetyDaysAgo)
            .not('xendit_external_id', 'is', null)
            .limit(300)

        if (!intents || intents.length === 0) {
            return json({ ok: true, updated: 0, checked: 0, reason: 'nothing pending' }, 200)
        }

        const byRef = new Map<string, string>() // reference_id → intent id
        let earliestPaid = Date.now()
        for (const i of intents as any[]) {
            if (i.xendit_external_id) byRef.set(i.xendit_external_id, i.id)
            const t = i.paid_at ? new Date(i.paid_at).getTime() : NaN
            if (!Number.isNaN(t) && t < earliestPaid) earliestPaid = t
        }
        // Scope the Xendit query to the window our pending intents live in (minus a
        // day of slack), so a busy merchant's older pending payments aren't missed
        // past the pagination window.
        const createdGte = new Date(earliestPaid - 24 * 60 * 60 * 1000).toISOString()

        // 2. Pull Xendit transactions for this account (sub-account via for-user-id).
        const authHeader = `Basic ${btoa(xenditKey + ':')}`
        const xHeaders: Record<string, string> = { 'Authorization': authHeader }
        if (partner.xendit_account_id && !partner.use_main_wallet) {
            xHeaders['for-user-id'] = partner.xendit_account_id
        }

        // Match by reference_id; stop early once all our refs are found or pages run out.
        const found = new Map<string, { settlement_status?: string; estimated_settlement_time?: string; settledFlag?: boolean }>()
        let afterId: string | null = null
        for (let page = 0; page < 12 && found.size < byRef.size; page++) {
            const url = new URL('https://api.xendit.co/transactions')
            url.searchParams.set('limit', '50')
            url.searchParams.set('types', 'PAYMENT')
            url.searchParams.set('created[gte]', createdGte)
            if (afterId) url.searchParams.set('after_id', afterId)

            const res = await fetch(url.toString(), { headers: xHeaders })
            if (!res.ok) {
                console.error(`[sync-settlements] Xendit ${res.status}: ${await res.text()}`)
                break
            }
            const body = await res.json()
            const rows: any[] = body?.data ?? []
            if (rows.length === 0) break

            for (const t of rows) {
                const ref = t.reference_id
                if (ref && byRef.has(ref) && !found.has(ref)) {
                    found.set(ref, {
                        settlement_status: (t.settlement_status || '').toUpperCase() || undefined,
                        estimated_settlement_time: t.estimated_settlement_time || undefined,
                    })
                }
            }

            afterId = rows[rows.length - 1]?.id ?? null
            if (!body?.has_more || !afterId) break
        }

        // 3. Persist Xendit's verbatim status onto the matched intents.
        let updated = 0
        for (const [ref, data] of found) {
            const intentId = byRef.get(ref)!
            // SETTLED and EARLY_SETTLED both mean funds are in the balance.
            const isSettled = data.settlement_status === 'SETTLED' || data.settlement_status === 'EARLY_SETTLED'
            const { error } = await admin
                .from('purchase_intents')
                .update({
                    settlement_status: data.settlement_status ?? null,
                    estimated_settlement_time: data.estimated_settlement_time ?? null,
                    settled_at: isSettled ? new Date().toISOString() : null,
                    settlement_synced_at: new Date().toISOString(),
                })
                .eq('id', intentId)
            if (!error) updated++
        }

        return json({ ok: true, checked: byRef.size, matched: found.size, updated }, 200)
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
