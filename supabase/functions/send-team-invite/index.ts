import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestData {
    to_email: string
    to_name?: string
    inviter_name: string
    organization_name: string
    role: string
    invite_token: string
}

const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner',
    manager: 'Manager',
    scanner: 'Scanner',
    finance: 'Finance',
    marketing: 'Marketing',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { to_email, to_name, inviter_name, organization_name, role, invite_token } = await req.json() as RequestData

        if (!to_email || !organization_name || !role || !invite_token) {
            throw new Error("Missing required fields: to_email, organization_name, role, invite_token")
        }

        const acceptUrl = `https://hanghut.com/organizer/accept-invite?token=${invite_token}`
        const roleLabel = ROLE_LABELS[role] || role

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
                    <!-- Header -->
                    <tr>
                        <td style="background: #18181b; padding: 32px 40px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: white; letter-spacing: -0.5px;">HANGHUT</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #18181b;">You're invited!</h2>
                            <p style="margin: 0 0 24px; font-size: 15px; color: #71717a; line-height: 1.6;">
                                <strong style="color: #18181b;">${inviter_name}</strong> has invited you to join 
                                <strong style="color: #18181b;">${organization_name}</strong> as a <strong style="color: #18181b;">${roleLabel}</strong> on HangHut.
                            </p>

                            <!-- Role Badge -->
                            <div style="background: #f4f4f5; border-radius: 12px; padding: 16px 20px; margin-bottom: 28px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td>
                                            <span style="font-size: 13px; color: #71717a;">Organization</span><br>
                                            <span style="font-size: 16px; font-weight: 600; color: #18181b;">${organization_name}</span>
                                        </td>
                                        <td align="right">
                                            <span style="display: inline-block; background: #18181b; color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">${roleLabel}</span>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- CTA Button -->
                            <a href="${acceptUrl}" style="display: block; text-align: center; background: #18181b; color: white; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none;">
                                Accept Invitation
                            </a>

                            <p style="margin: 20px 0 0; font-size: 13px; color: #a1a1aa; text-align: center;">
                                This invite expires in 7 days.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
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

        // Send via Resend
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `HangHut <noreply@hanghut.com>`,
                to: to_email,
                subject: `${inviter_name} invited you to ${organization_name} on HangHut`,
                html: html
            })
        })

        if (!res.ok) {
            const err = await res.json()
            console.error('❌ Resend error:', err)
            throw new Error(`Failed to send email: ${JSON.stringify(err)}`)
        }

        const result = await res.json()
        console.log(`✅ Invite email sent to ${to_email}, ID: ${result.id}`)

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
