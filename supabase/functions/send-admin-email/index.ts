// Supabase Edge Function: send-admin-email
// Deploy with: supabase functions deploy send-admin-email
//
// This function sends platform-level emails from HangHut Admin
// to the waitlist table (not partner_subscribers).
//
// Expected body:
// {
//   subject: string,
//   html_content: string,
//   sender_name?: string  // defaults to "HangHut"
// }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // Verify the caller is an admin
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('No authorization header')

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) throw new Error('Unauthorized')

        // Use a user-scoped client for the admin check (RPC needs user JWT context)
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        })
        const { data: isAdmin } = await userClient.rpc('is_user_admin')
        if (!isAdmin) throw new Error('Admin access required')

        // Parse request body
        const { subject, html_content, sender_name = 'HangHut' } = await req.json()

        if (!subject || !html_content) {
            throw new Error('Missing required fields: subject, html_content')
        }

        // Fetch all waitlist entries
        const { data: recipients, error: fetchError } = await supabase
            .from('waitlist')
            .select('email, full_name')

        if (fetchError) throw new Error(`Failed to fetch waitlist: ${fetchError.message}`)
        if (!recipients || recipients.length === 0) {
            return new Response(
                JSON.stringify({ success: true, sent_count: 0, message: 'No recipients in waitlist' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Send emails via Resend (batch)
        let sentCount = 0
        let failedCount = 0
        const batchSize = 50

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize)

            const promises = batch.map(async (recipient) => {
                try {
                    const res = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${RESEND_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            from: `${sender_name} <noreply@hanghut.com>`,
                            to: [recipient.email],
                            subject: subject,
                            html: html_content,
                        }),
                    })

                    if (res.ok) {
                        sentCount++
                    } else {
                        failedCount++
                        console.error(`Failed to send to ${recipient.email}:`, await res.text())
                    }
                } catch (err) {
                    failedCount++
                    console.error(`Error sending to ${recipient.email}:`, err)
                }
            })

            await Promise.all(promises)
        }

        // Log the campaign
        await supabase.from('admin_email_campaigns').insert({
            subject,
            html_content,
            sender_name,
            recipient_count: recipients.length,
            sent_count: sentCount,
            failed_count: failedCount,
            status: failedCount === 0 ? 'sent' : 'partial',
            sent_at: new Date().toISOString(),
            sent_by: user.id,
        })

        return new Response(
            JSON.stringify({
                success: true,
                sent_count: sentCount,
                failed_count: failedCount,
                total_recipients: recipients.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('send-admin-email error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
