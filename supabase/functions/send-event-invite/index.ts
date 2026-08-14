import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SITE_URL = Deno.env.get("SITE_URL") || "https://hanghut.com"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestData {
    to_email: string
    to_name?: string
    event_id: string
    event_title: string
    event_date?: string
    organizer_name: string
    invite_token: string
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { to_email, to_name, event_id, event_title, event_date, organizer_name, invite_token } =
            await req.json() as RequestData

        if (!to_email || !event_id || !event_title || !invite_token) {
            throw new Error("Missing required fields: to_email, event_id, event_title, invite_token")
        }

        const inviteUrl = `${SITE_URL}/events/${event_id}?invite=${invite_token}`
        const dateLine = event_date
            ? new Date(event_date).toLocaleString('en-PH', {
                weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                timeZone: 'Asia/Manila',
              })
            : ''

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" style="max-width: 520px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background: #18181b; padding: 32px 40px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: white; letter-spacing: -0.5px;">HANGHUT</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <span style="display: inline-block; background: #ede9fe; color: #6d28d9; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 16px;">PRIVATE EVENT</span>
                            <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #18181b;">You're invited!</h2>
                            <p style="margin: 0 0 24px; font-size: 15px; color: #71717a; line-height: 1.6;">
                                <strong style="color: #18181b;">${organizer_name}</strong> has invited you to
                                <strong style="color: #18181b;">${event_title}</strong>.
                            </p>

                            <div style="background: #f4f4f5; border-radius: 12px; padding: 16px 20px; margin-bottom: 28px;">
                                <span style="font-size: 13px; color: #71717a;">Event</span><br>
                                <span style="font-size: 16px; font-weight: 600; color: #18181b;">${event_title}</span>
                                ${dateLine ? `<br><span style="font-size: 13px; color: #71717a; margin-top: 6px; display: inline-block;">${dateLine}</span>` : ''}
                            </div>

                            <a href="${inviteUrl}" style="display: block; text-align: center; background: #18181b; color: white; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none;">
                                View Invitation
                            </a>

                            <p style="margin: 20px 0 0; font-size: 13px; color: #a1a1aa; text-align: center;">
                                Accept or decline your invite on the event page.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 28px; border-top: 1px solid #f4f4f5; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                                If you didn't expect this invitation, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `HangHut <noreply@hanghut.com>`,
                to: to_email,
                subject: `${organizer_name} invited you to ${event_title}`,
                html: html
            })
        })

        if (!res.ok) {
            const err = await res.json()
            console.error('❌ Resend error:', err)
            throw new Error(`Failed to send email: ${JSON.stringify(err)}`)
        }

        const result = await res.json()
        console.log(`✅ Event invite email sent to ${to_email}, ID: ${result.id}`)

        return new Response(JSON.stringify({ success: true, email_id: result.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (error) {
        console.error('💥 Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
