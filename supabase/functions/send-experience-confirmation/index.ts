import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

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
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  } catch { return iso }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })
  } catch { return '' }
}

function formatDateFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })
  } catch { return iso }
}

function formatCurrency(amount: number): string {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
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

async function generatePassPdf(data: ExperienceEmailRequest): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const W = 226, H = 580, PAD = 18
  const black = rgb(0.08, 0.08, 0.08), gray = rgb(0.55, 0.55, 0.55)
  const lightGray = rgb(0.88, 0.88, 0.88), indigo = rgb(0.31, 0.27, 0.9)

  let coverImg: any = null
  if (data.cover_image_url) {
    try {
      const res = await fetch(data.cover_image_url)
      const buf = await res.arrayBuffer()
      try { coverImg = await pdfDoc.embedJpg(buf) } catch { coverImg = await pdfDoc.embedPng(buf) }
    } catch {}
  }

  const page = pdfDoc.addPage([W, H])

  const imgH = 130
  if (coverImg) {
    page.drawImage(coverImg, { x: 0, y: H - imgH, width: W, height: imgH })
    page.drawRectangle({ x: 0, y: H - imgH, width: W, height: imgH, color: rgb(0,0,0), opacity: 0.38 })
  } else {
    page.drawRectangle({ x: 0, y: H - imgH, width: W, height: imgH, color: indigo })
  }
  page.drawText('EXPERIENCE PASS', { x: PAD, y: H - imgH + 12, size: 7, font: boldFont, color: rgb(1,1,1), opacity: 0.8 })

  let y = H - imgH - 20

  const titleSize = data.experience_title.length > 28 ? 11 : 13
  page.drawText(data.experience_title, { x: PAD, y, size: titleSize, font: boldFont, color: black, maxWidth: W - PAD * 2 })
  y -= titleSize + 6

  page.drawText('DATE & TIME', { x: PAD, y, size: 6.5, font: boldFont, color: gray })
  y -= 11
  page.drawText(formatDate(data.experience_date), { x: PAD, y, size: 9, font, color: black, maxWidth: W - PAD * 2 })
  y -= 12
  page.drawText(formatTime(data.experience_date), { x: PAD, y, size: 9, font: boldFont, color: black })
  y -= 18

  page.drawText('VENUE', { x: PAD, y, size: 6.5, font: boldFont, color: gray })
  y -= 11
  page.drawText(data.experience_venue, { x: PAD, y, size: 9, font, color: black, maxWidth: W - PAD * 2 })
  y -= 18

  page.drawText('HOST', { x: PAD, y, size: 6.5, font: boldFont, color: gray })
  y -= 11
  page.drawText(data.host_name, { x: PAD, y, size: 9, font, color: black })
  y -= 18

  page.drawText('GUEST', { x: PAD, y, size: 6.5, font: boldFont, color: gray })
  y -= 11
  page.drawText((data.name || data.email).toUpperCase(), { x: PAD, y, size: 9, font: boldFont, color: black, maxWidth: W - PAD * 2 })
  if (data.quantity > 1) {
    y -= 12
    page.drawText(`x${data.quantity} guests`, { x: PAD, y, size: 8, font, color: gray })
  }
  y -= 22

  for (let x = 0; x < W; x += 8) {
    page.drawLine({ start: { x, y }, end: { x: x + 4.5, y }, thickness: 0.8, color: lightGray })
  }
  y -= 18

  const qrSize = 148, qrX = (W - qrSize) / 2
  try {
    const qrRes = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&format=png&margin=1&data=${encodeURIComponent(data.intent_id)}`)
    const qrImg = await pdfDoc.embedPng(await qrRes.arrayBuffer())
    page.drawImage(qrImg, { x: qrX, y: y - qrSize, width: qrSize, height: qrSize })
  } catch {
    page.drawRectangle({ x: qrX, y: y - qrSize, width: qrSize, height: qrSize, borderColor: lightGray, borderWidth: 1 })
  }
  y -= qrSize + 10

  const scanLabel = 'Show to host for check-in'
  const scanW = font.widthOfTextAtSize(scanLabel, 7)
  page.drawText(scanLabel, { x: (W - scanW) / 2, y, size: 7, font, color: gray })
  y -= 13

  const ref = `Ref: ${data.transaction_ref.slice(0, 12)}`, refW = font.widthOfTextAtSize(ref, 7)
  page.drawText(ref, { x: (W - refW) / 2, y, size: 7, font, color: lightGray })

  const brand = 'HANGHUT', bW = boldFont.widthOfTextAtSize(brand, 8)
  page.drawText(brand, { x: (W - bW) / 2, y: 10, size: 8, font: boldFont, color: indigo })

  return pdfDoc.save()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const data: ExperienceEmailRequest = await req.json()
    console.log(`Experience confirmation -> ${data.email} | ${data.experience_title}`)

    let passB64 = ''
    try {
      passB64 = base64Encode(await generatePassPdf(data))
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `PDF failed: ${e.message}` }), { status: 500, headers: corsHeaders })
    }

    // Same layout as the events ticket email (send-ticket-email): dark header,
    // cover, green "Payment Successful" box, footer. Experience-specific: a Host
    // row, and the QR is delivered as the attached pass (experiences have no
    // hosted /t/{token} page), so the CTA area points at the attached pass.
    const paymentMethodLine = data.payment_method
      ? `<p style="margin:2px 0 0;color:#15803d">${data.payment_method}</p>`
      : ''
    const coverBlock = data.cover_image_url
      ? `<img src="${data.cover_image_url}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:20px" alt="">`
      : ''
    const guestsLine = data.quantity > 1 ? ` · ${data.quantity} guests` : ''

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:40px 0;margin:0"><div style="background:#fff;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)"><div style="background:#0f172a;padding:40px 20px;text-align:center"><h1 style="color:#fff;margin:0;font-size:24px">Your Booking is Confirmed</h1><p style="color:#94a3b8;margin:10px 0 0;font-size:16px">We can't wait to host you!</p></div><div style="padding:40px 30px">${coverBlock}<h2 style="color:#0f172a;margin:0 0 20px">${data.experience_title}</h2><p><strong>Date:</strong> ${formatDateFull(data.experience_date)}</p><p><strong>Location:</strong> ${data.experience_venue}</p><p><strong>Host:</strong> ${data.host_name}</p><div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:8px;padding:16px;margin-top:10px"><p style="margin:0;color:#166534;font-weight:600">Payment Successful</p><p style="margin:2px 0 0;color:#15803d">Total Paid: ${formatCurrency(data.total_amount)}</p>${paymentMethodLine}</div><div style="margin-top:24px;padding:18px;background:#eef2ff;border:1px solid #e0e7ff;border-radius:8px;text-align:center"><p style="margin:0;color:#3730a3;font-weight:600;font-size:15px">Your Experience Pass is attached</p><p style="margin:6px 0 0;color:#4f46e5;font-size:13px">Show the QR code to your host for check-in${guestsLine}. A screenshot works too.</p></div></div><div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0"><p>Ref: ${data.transaction_ref}</p><p>&copy; ${new Date().getFullYear()} HangHut. All rights reserved.</p></div></div></body></html>`

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

    const attachments: { filename: string; content: string }[] = [{ filename: 'ExperiencePass.pdf', content: passB64 }]
    try { const ics = buildIcs(data); if (ics) attachments.push(ics) } catch {}

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
