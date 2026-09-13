import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

/**
 * Experience booking confirmation.
 *
 * REWRITTEN to the same delivery model as send-ticket-email. This function used
 * to build a pass PDF with pdf-lib on every booking and attach it, fetching the
 * QR bitmap from api.qrserver.com — so a paid booking depended on a third-party
 * image service at send time, the guest's booking id was handed to that service,
 * and anyone who lost the attachment had no way back to their pass because the
 * email linked nowhere.
 *
 * Now the pass lives at /x/{access_token}, exactly as a ticket lives at
 * /t/{access_token}: the email links to it, the QR renders in the browser, and
 * the PDF is generated on demand, client-side, only if the guest asks for one.
 * The only attachment left is the calendar invite.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExperienceEmailRequest {
  email: string
  name?: string
  experience_title: string
  experience_venue: string
  experience_date: string
  experience_end_date?: string
  host_name: string
  quantity: number
  total_amount: number
  transaction_ref: string
  payment_method?: string
  intent_id: string
  cover_image_url?: string
  /**
   * Hosted pass page (/x/{access_token}) — the primary delivery path, resolved
   * by process-payment-queue from intent_id. Optional so a producer that has
   * not been redeployed still sends a valid email, just without the link.
   */
  booking_url?: string
}

function formatDateFull(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
    })
  } catch { return iso }
}

function formatCurrency(amount: number): string {
  return `PHP ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

// Calendar invite — parity with the events ticket email. Falls back to a 2h
// window when the experience has no explicit end time.
function buildIcs(data: ExperienceEmailRequest) {
  try {
    const start = new Date(data.experience_date)
    if (isNaN(start.getTime())) return null
    const end = data.experience_end_date ? new Date(data.experience_end_date) : new Date(start.getTime() + 2 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HangHut//Experiences//EN', 'BEGIN:VEVENT', `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${data.experience_title}`, `LOCATION:${data.experience_venue}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    return { filename: 'Add-to-Calendar.ics', content: btoa(unescape(encodeURIComponent(ics))) }
  } catch { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const data: ExperienceEmailRequest = await req.json()
    console.log(`Experience confirmation -> ${data.email} | ${data.experience_title}`)

    const guestsLine = data.quantity > 1 ? `${data.quantity} guests` : '1 guest'

    // Same shape as send-ticket-email: dark header, cover, green payment box,
    // one CTA, footer. The experience-specific rows are Host and party size.
    const ctaButton = data.booking_url
      ? `<div style="text-align:center;margin:28px 0 8px"><a href="${data.booking_url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-size:16px">View Your Pass</a></div><p style="text-align:center;color:#94a3b8;font-size:12px;margin:0 0 8px">Open this on your phone when you arrive — a screenshot works too.</p>`
      : ''
    const detailCopy = data.booking_url
      ? `<p style="margin-top:20px;text-align:center;color:#475569">Your pass for <strong>${guestsLine}</strong> with its QR code is on the page above. You can also download a PDF copy from there.</p>`
      : `<p style="margin-top:24px;text-align:center;color:#475569">Your booking for <strong>${guestsLine}</strong> is confirmed. Log in to your account to view your pass.</p>`
    const coverBlock = data.cover_image_url
      ? `<img src="${data.cover_image_url}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:20px" alt="">`
      : ''
    const paymentMethodLine = data.payment_method
      ? `<p style="margin:2px 0 0;color:#15803d">${data.payment_method}</p>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:40px 0;margin:0"><div style="background:#fff;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)"><div style="background:#0f172a;padding:40px 20px;text-align:center"><h1 style="color:#fff;margin:0;font-size:24px">Your Booking is Confirmed</h1><p style="color:#94a3b8;margin:10px 0 0;font-size:16px">We can't wait to host you!</p></div><div style="padding:40px 30px">${coverBlock}<h2 style="color:#0f172a;margin:0 0 20px">${data.experience_title}</h2><p><strong>Date:</strong> ${formatDateFull(data.experience_date)}</p><p><strong>Location:</strong> ${data.experience_venue}</p><p><strong>Host:</strong> ${data.host_name}</p><p><strong>Guests:</strong> ${guestsLine}</p><div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:8px;padding:16px;margin-top:10px"><p style="margin:0;color:#166534;font-weight:600">Payment Successful</p><p style="margin:2px 0 0;color:#15803d">Total Paid: ${formatCurrency(data.total_amount)}</p>${paymentMethodLine}</div>${ctaButton}${detailCopy}</div><div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0"><p>Ref: ${data.transaction_ref}</p><p>&copy; ${new Date().getFullYear()} HangHut. All rights reserved.</p></div></div></body></html>`

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

    // Only the lightweight calendar invite — no per-booking PDF generation.
    const attachments: { filename: string; content: string }[] = []
    try { const ics = buildIcs(data); if (ics) attachments.push(ics) } catch { /* invite is optional */ }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'HangHut Experiences <experiences@hanghut.com>',
          to: [data.email],
          subject: `Your Booking for ${data.experience_title}`,
          html,
          attachments,
        }),
      })
      const result = await res.json()
      if (res.ok) return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      if (res.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); continue }
      throw new Error(result?.message || JSON.stringify(result))
    }
    throw new Error('Max retries exceeded')
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
