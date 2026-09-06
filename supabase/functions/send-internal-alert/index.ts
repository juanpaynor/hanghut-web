import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

/**
 * send-internal-alert — team-facing alerts (partner signups, payout requests,
 * reports, status updates). Called by the SQL function notify_internal_alert(),
 * which authenticates with a shared secret rather than a JWT, which is why this
 * function runs with verify_jwt disabled.
 *
 * NOTE: this file was recovered from the deployed version. It had no copy in the
 * repository, so the only record of who receives platform alerts lived inside a
 * deployed bundle — invisible to code review and to anyone asking "who gets
 * notified?". Keep it here.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

/**
 * Who gets internal alerts.
 *
 * Overridable via the ALERT_RECIPIENTS secret (comma-separated) so the list can
 * change without a code deploy — the default below is the live list, so the
 * behaviour is readable here rather than hidden in dashboard config.
 */
const ALERT_TO = (
    Deno.env.get('ALERT_RECIPIENTS') ||
    'contact@hanghut.com,johnpatino@hanghut.com,migueldadivas@hanghut.com,gelpatino@hanghut.com'
)
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)

const FROM_ADDRESS = 'HangHut Alerts <alerts@hanghut.com>'
const EXPECTED_SECRET = 'hh-alert-secret-2026'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TYPE_EMOJI: Record<string, string> = {
    partner_signup: '🤝',
    payout_request: '💸',
    report: '🚨',
    status_update: '📋',
    custom: '📣',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const body = await req.json()
        const { secret, type, subject, body_html, metadata } = body

        if (secret !== EXPECTED_SECRET) {
            console.warn('[send-internal-alert] rejected: wrong secret')
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (!subject || !body_html) {
            return new Response(JSON.stringify({ error: 'Missing subject or body_html' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const emoji = TYPE_EMOJI[type] || '📣'

        const metaRows = metadata
            ? Object.entries(metadata)
                .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;white-space:nowrap;">${k}</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${v}</td></tr>`)
                .join('')
            : ''

        const metaTable = metaRows
            ? `<table style="width:100%;margin-top:16px;border-top:1px solid #eee;padding-top:12px;border-spacing:0;">${metaRows}</table>`
            : ''

        const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:32px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;border:1px solid #e5e5e5;">
    <div style="margin-bottom:24px;">
      <span style="background:#000;color:#fff;font-weight:800;font-size:15px;padding:4px 10px;border-radius:4px;display:inline-block;letter-spacing:-0.5px;">HANGHUT</span>
    </div>
    <div style="font-size:28px;margin-bottom:8px;">${emoji}</div>
    <h2 style="margin:0 0 12px;font-size:18px;color:#111;">${subject}</h2>
    <div style="color:#444;font-size:14px;line-height:1.7;">${body_html}</div>
    ${metaTable}
    <hr style="margin:28px 0;border:none;border-top:1px solid #eee;">
    <p style="color:#bbb;font-size:11px;margin:0;">Automated alert from HangHut &middot; Do not reply</p>
  </div>
</body>
</html>`

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_ADDRESS,
                to: ALERT_TO,
                subject: `${emoji} [HangHut] ${subject}`,
                html,
            }),
        })

        const result = await res.json()
        console.log(`[send-internal-alert] type=${type} recipients=${ALERT_TO.length} resend_status=${res.status}`, JSON.stringify(result))

        if (!res.ok) throw new Error(JSON.stringify(result))

        return new Response(JSON.stringify({ success: true, id: result.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (err) {
        console.error('[send-internal-alert] error:', err)
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
