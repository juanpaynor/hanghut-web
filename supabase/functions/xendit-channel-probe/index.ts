import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * xendit-channel-probe — TEMPORARY diagnostic. Delete after use.
 *
 * Question: will Xendit let an OWNED sub-account use CARDS/GCASH without its own
 * account-holder verification, or are those channels rejected?
 *
 * Mirrors create-purchase-intent's POST /sessions call exactly (session_type PAY,
 * mode PAYMENT_LINK, for-user-id) and runs it twice: once with the channel set we
 * ship today, once with CARDS+GCASH added. Nothing is written to our database, and
 * the sessions created are unpaid payment links that simply expire.
 *
 * Service-role auth only.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_CHANNELS = ['QRPH', 'PAYMAYA', 'GRABPAY', 'BPI_DIRECT_DEBIT', 'UBP_DIRECT_DEBIT', 'RCBC_DIRECT_DEBIT']

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: s,
    })

    try {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) return json({ error: 'Missing XENDIT_SECRET_KEY' }, 500)

        const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
        if (!serviceKey || bearer !== serviceKey) return json({ error: 'Forbidden' }, 403)

        const { sub_account_id, amount = 100 } = await req.json()
        if (!sub_account_id) return json({ error: 'Missing sub_account_id' }, 400)

        const run = async (label: string, channels: string[], useForUser: boolean) => {
            const headers = new Headers()
            headers.set('Authorization', `Basic ${btoa(xenditKey + ':')}`)
            headers.set('Content-Type', 'application/json')
            if (useForUser) headers.set('for-user-id', sub_account_id)

            const body = {
                reference_id: `probe_${crypto.randomUUID()}`,
                session_type: 'PAY',
                mode: 'PAYMENT_LINK',
                amount,
                currency: 'PHP',
                country: 'PH',
                allowed_payment_channels: channels,
                customer: {
                    reference_id: `probe_${Date.now()}`,
                    type: 'INDIVIDUAL',
                    email: 'probe@hanghut.com',
                    mobile_number: '+639000000000',
                    individual_detail: { given_names: 'Channel', surname: 'Probe' },
                },
                description: 'Channel availability probe (unpaid, will expire)',
            }

            const res = await fetch('https://api.xendit.co/sessions', {
                method: 'POST', headers, body: JSON.stringify(body),
            })
            const text = await res.text()
            let parsed: any = null
            try { parsed = JSON.parse(text) } catch { /* non-JSON */ }

            return {
                label,
                requested_channels: channels,
                http: res.status,
                ok: res.ok,
                // What Xendit says it will actually offer — the real answer, since a
                // 200 alone may just mean "accepted and silently dropped".
                echoed_channels: parsed?.allowed_payment_channels ?? null,
                session_id: parsed?.payment_session_id ?? parsed?.id ?? null,
                error_code: parsed?.error_code ?? null,
                message: parsed?.message ?? null,
                raw: text.slice(0, 1200),
            }
        }

        return json({
            sub_account_id,
            baseline_subaccount: await run('baseline (channels we ship today)', BASE_CHANNELS, true),
            with_cards_gcash_subaccount: await run('sub-account + CARDS/GCASH', [...BASE_CHANNELS, 'CARDS', 'GCASH'], true),
            with_cards_gcash_master: await run('master + CARDS/GCASH (control)', [...BASE_CHANNELS, 'CARDS', 'GCASH'], false),
        })
    } catch (e: any) {
        return json({ error: 'Internal Server Error', message: e.message }, 500)
    }
})
