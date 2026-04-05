import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY not configured')
        }

        const { email, code } = await req.json()

        if (!email || !code) {
            throw new Error('Missing required fields: email, code')
        }

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'HangHut <noreply@hanghut.com>',
                to: [email],
                subject: `${code} — Your HangHut verification code`,
                html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 440px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 32px 24px; text-align: center;">
      <div style="display: inline-block; background: white; padding: 8px 20px; border-radius: 6px; transform: rotate(-1deg);">
        <span style="font-size: 18px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px;">HANGHUT</span>
      </div>
    </div>
    
    <!-- Content -->
    <div style="padding: 32px 24px;">
      <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #1e293b;">Verification Code</h2>
      <p style="margin: 0 0 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
        Enter this code to complete your sign-in to HangHut Admin.
      </p>
      
      <!-- Code Box -->
      <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 20px; text-align: center; margin: 0 0 24px;">
        <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #1e293b; font-family: 'SF Mono', 'Fira Code', monospace;">
          ${code}
        </span>
      </div>
      
      <p style="margin: 0 0 4px; font-size: 13px; color: #94a3b8;">
        ⏱ This code expires in <strong>5 minutes</strong>.
      </p>
      <p style="margin: 0; font-size: 13px; color: #94a3b8;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="padding: 16px 24px; border-top: 1px solid #f1f5f9; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
        HangHut Security · This is an automated message
      </p>
    </div>
  </div>
</body>
</html>
                `.trim(),
            }),
        })

        if (!res.ok) {
            const error = await res.text()
            console.error('Resend error:', error)
            throw new Error(`Failed to send email: ${res.status}`)
        }

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('send-otp-code error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
