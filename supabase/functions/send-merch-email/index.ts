// @ts-nocheck
// Supabase Edge Function: send-merch-email
//
// Delivers the merch claim link after payment. Without this a guest buyer has
// no route to their claim QR at all: the token lives only in merch_claims, and
// /account scopes claims by user_id, which is null for guests.
//
// Body: { claim_token: uuid }
// Everything else is resolved server-side via get_merch_claim, so callers only
// need the token the confirm_merch_order RPC already returns.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ROOT_DOMAIN = Deno.env.get('ROOT_DOMAIN') || 'hanghut.com'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const peso = (n: number) => (Number(n) === 0 ? 'Free' : `₱${Number(n).toLocaleString()}`)

const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { claim_token } = await req.json()
        if (!claim_token) throw new Error('claim_token is required')
        if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY')

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const { data, error } = await supabase.rpc('get_merch_claim', { p_token: claim_token })
        if (error) throw error
        if (!data) throw new Error('Claim not found')

        const { claim, items, event, organizer } = data as any

        const to = claim.buyer_email
        if (!to) {
            // Nothing to send to — surface it rather than silently succeeding.
            console.warn(`⚠️ Merch claim ${claim_token} has no buyer_email; skipping send`)
            return new Response(JSON.stringify({ success: false, skipped: 'no_email' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const orgName = organizer?.business_name || 'HangHut'
        const isShip = claim.fulfillment_mode === 'ship'
        const claimUrl = `https://${ROOT_DOMAIN}/m/${claim.claim_token}`
        const total = (items || []).reduce(
            (sum: number, i: any) => sum + Number(i.unit_price) * Number(i.quantity),
            0
        )

        // Manila-pinned: this runs on a UTC host, and the same order is also shown
        // in-browser. An unpinned date would disagree between the two.
        const eventDate = event?.start_datetime
            ? new Date(event.start_datetime).toLocaleString('en-PH', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
            })
            : null

        const itemRows = (items || [])
            .map(
                (i: any) => `<tr>
        <td style="padding:6px 0;font-size:14px;color:#111827">
          <span style="color:#6b7280">${esc(i.quantity)}× </span>${esc(i.name)}
        </td>
        <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;font-weight:600">
          ${esc(peso(Number(i.unit_price) * Number(i.quantity)))}
        </td>
      </tr>`
            )
            .join('')

        const headline = isShip ? 'Order confirmed' : 'Your merch is ready to collect'
        const lead = isShip
            ? `Thanks ${esc(claim.buyer_name || 'there')} — your order is confirmed and will be shipped to you.`
            : `Thanks ${esc(claim.buyer_name || 'there')} — show your claim code at the merch table to pick this up.`

        const modeBlock = isShip
            ? `<div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0">
           <p style="margin:0 0 4px;font-size:13px;color:#6b7280;font-weight:600">SHIPPING TO</p>
           <p style="margin:0;font-size:14px;color:#111827">${esc(claim.shipping_address?.raw || 'Address on file')}</p>
         </div>`
            : `<div style="text-align:center;margin:28px 0">
           <a href="${claimUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px">View your claim code</a>
           <p style="margin:12px 0 0;font-size:13px;color:#6b7280">Or open: ${claimUrl}</p>
         </div>`

        const eventBlock = event
            ? `<div style="border-top:1px solid #f3f4f6;padding-top:16px;margin-top:20px">
           <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827">${esc(event.title)}</p>
           ${eventDate ? `<p style="margin:0;font-size:13px;color:#6b7280">${esc(eventDate)}</p>` : ''}
           ${event.venue_name ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280">${esc(event.venue_name)}</p>` : ''}
         </div>`
            : ''

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#18181b;padding:28px 24px;text-align:center">
      <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-.5px">HANGHUT</span>
    </div>
    <div style="padding:32px 24px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:600">${esc(orgName)}</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3">${esc(headline)}</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">${lead}</p>

      <table style="width:100%;border-collapse:collapse">${itemRows}
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:8px;font-size:14px;font-weight:700;color:#111827">Total</td>
            <td style="border-top:1px solid #e5e7eb;padding-top:8px;font-size:14px;font-weight:700;color:#111827;text-align:right">${esc(peso(total))}</td></tr>
      </table>

      ${modeBlock}
      ${eventBlock}
    </div>
    <div style="padding:20px 24px;border-top:1px solid #f3f4f6;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Keep this email — the link above is your proof of purchase.</p>
    </div>
  </div>
</body></html>`

        const subject = isShip
            ? `Your ${orgName} merch order is confirmed`
            : `Your ${orgName} merch is ready to collect`

        // Retry only on rate-limit, matching send-ticket-email.
        let attempt = 0
        let responseData: any = null
        while (attempt < 3) {
            attempt++
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'HangHut Merch <merch@hanghut.com>',
                    to: [to],
                    subject,
                    html,
                }),
            })
            responseData = await res.json().catch(() => ({}))
            if (res.ok) {
                console.log(`✅ Merch email sent to ${to} for claim ${claim_token}`)
                return new Response(JSON.stringify({ success: true, email_id: responseData.id }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
            if (res.status !== 429) break
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        }

        throw new Error(responseData?.message || 'Failed to send merch email')
    } catch (err: any) {
        console.error('send-merch-email error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
