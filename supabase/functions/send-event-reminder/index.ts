// @ts-nocheck
// Supabase Edge Function: send-event-reminder
// Called by pg_cron every hour.
// Body: { window_hours: 24 | 1 }
// Finds all active events starting in (window_hours - 0.25)h to (window_hours + 0.25)h,
// then sends a push notification + email reminder to every active ticket holder.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function sanitizeSenderName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const { window_hours } = await req.json()
        if (window_hours !== 24 && window_hours !== 1) {
            throw new Error('window_hours must be 24 or 1')
        }

        // Find events starting in window_hours ± 15 minutes
        const now = new Date()
        const windowMs = window_hours * 60 * 60 * 1000
        const toleranceMs = 15 * 60 * 1000
        const rangeStart = new Date(now.getTime() + windowMs - toleranceMs).toISOString()
        const rangeEnd = new Date(now.getTime() + windowMs + toleranceMs).toISOString()

        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select(`
                id,
                title,
                start_datetime,
                venue_name,
                partners!events_organizer_id_fkey ( business_name )
            `)
            .eq('status', 'active')
            .gte('start_datetime', rangeStart)
            .lte('start_datetime', rangeEnd)

        if (eventsError) throw eventsError
        if (!events || events.length === 0) {
            return new Response(JSON.stringify({ success: true, processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const label = window_hours === 24 ? '24 hours' : '1 hour'
        let totalSent = 0
        let totalFailed = 0

        for (const event of events) {
            const organizerName = (event.partners as any)?.business_name || 'HangHut'
            const eventDate = new Date(event.start_datetime).toLocaleString('en-PH', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
            })

            // Fetch all active ticket holders for this event
            const { data: tickets, error: ticketsError } = await supabase
                .from('tickets')
                .select('user_id, guest_email, guest_name')
                .eq('event_id', event.id)
                .in('status', ['valid', 'approved'])

            if (ticketsError || !tickets) continue

            for (const ticket of tickets) {
                try {
                    // --- Push notification (app users only) ---
                    if (ticket.user_id) {
                        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                user_id: ticket.user_id,
                                title: `⏰ ${event.title} is in ${label}!`,
                                body: `${event.venue_name ? `At ${event.venue_name}. ` : ''}See you there!`,
                                data: {
                                    type: 'event_reminder',
                                    event_id: event.id,
                                    event_title: event.title,
                                    window_hours,
                                },
                            }),
                        })
                    }

                    // --- Email reminder ---
                    // Resolve recipient email
                    let recipientEmail = ticket.guest_email
                    let recipientName = ticket.guest_name || 'there'

                    if (!recipientEmail && ticket.user_id) {
                        const { data: userData } = await supabase
                            .from('users')
                            .select('email, display_name')
                            .eq('id', ticket.user_id)
                            .single()
                        recipientEmail = userData?.email || null
                        recipientName = userData?.display_name || 'there'
                    }

                    if (!recipientEmail) continue

                    const sanitized = sanitizeSenderName(organizerName) || 'hanghut'
                    const from = `${organizerName} via HangHut <${sanitized}@hanghut.com>`

                    const subject = `⏰ Reminder: ${event.title} is in ${label}`
                    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:32px 24px;text-align:center;">
      <div style="display:inline-block;background:white;padding:8px 20px;border-radius:6px;">
        <span style="font-size:18px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px;">HANGHUT</span>
      </div>
    </div>
    <div style="padding:32px 24px;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Event Reminder</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#111827;line-height:1.3">${event.title} is in ${label}!</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi ${recipientName},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Just a heads up — <strong>${event.title}</strong> starts in <strong>${label}</strong>.
      </p>
      <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#6b7280;font-weight:600;width:80px;">DATE</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500;">${eventDate}</td>
          </tr>
          ${event.venue_name ? `<tr>
            <td style="padding:6px 0;font-size:13px;color:#6b7280;font-weight:600;">VENUE</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500;">${event.venue_name}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="margin:0;font-size:14px;color:#6b7280;">Your ticket is confirmed. See you there! 🎉</p>
    </div>
    <div style="padding:20px 24px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        You received this because you have a ticket for ${event.title}.
      </p>
    </div>
  </div>
</body>
</html>`

                    if (RESEND_API_KEY) {
                        const res = await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${RESEND_API_KEY}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ from, to: [recipientEmail], subject, html }),
                        })
                        if (res.ok) totalSent++
                        else totalFailed++
                    }
                } catch (ticketErr) {
                    console.error('Failed to send reminder for ticket:', ticket, ticketErr)
                    totalFailed++
                }
            }
        }

        console.log(`send-event-reminder [${window_hours}h]: ${events.length} events, ${totalSent} sent, ${totalFailed} failed`)
        return new Response(
            JSON.stringify({ success: true, events: events.length, sent: totalSent, failed: totalFailed }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (err: any) {
        console.error('send-event-reminder error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
