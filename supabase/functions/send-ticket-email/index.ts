import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TicketData { ticket_number: string; qr_code: string }
interface EmailRequest {
    email: string; name?: string; event_title: string; event_venue: string
    event_date: string; event_end_date?: string; event_cover_image?: string
    ticket_quantity: number; total_amount: number; transaction_ref: string
    payment_method?: string; tickets: TicketData[]
    // Hosted ticket page (/t/{access_token}) — the primary delivery path. Buyers
    // view their QR tickets there and can download a PDF on demand, so this email
    // no longer generates/attaches PDFs at purchase time.
    ticket_url?: string
}

function buildIcs(data: EmailRequest) {
    try {
        const start = new Date(data.event_date)
        if (isNaN(start.getTime())) return null
        const end = data.event_end_date ? new Date(data.event_end_date) : new Date(start.getTime() + 2*60*60*1000)
        const pad = (n: number) => String(n).padStart(2,'0')
        const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
        const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HangHut//Tickets//EN','BEGIN:VEVENT',`DTSTART:${fmt(start)}`,`DTEND:${fmt(end)}`,`SUMMARY:${data.event_title}`,`LOCATION:${data.event_venue}`,'END:VEVENT','END:VCALENDAR'].join('\r\n')
        return { filename: 'Add-to-Calendar.ics', content: btoa(unescape(encodeURIComponent(ics))) }
    } catch { return null }
}

function formatEventDate(isoDate: string): string {
    try {
        if (!isoDate) return 'Date TBA'
        const date = new Date(isoDate)
        if (isNaN(date.getTime())) return isoDate
        return date.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' })
    } catch { return isoDate || 'Date Error' }
}

function formatCurrency(amount: number): string {
    // The peso sign, not the ISO code. Every price surface in the product uses
    // it, and "PHP 1,200.00" in the one email a buyer keeps read as a different
    // company's receipt. The document declares UTF-8, so it renders.
    return `\u20B1${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
        const requestData: EmailRequest = await req.json()
        const formattedAmount = formatCurrency(Number(requestData.total_amount))
        const formattedDate = formatEventDate(requestData.event_date)
        // ── Brand ────────────────────────────────────────────────────────
        //
        // These are HangHut's real tokens, not approximations. The email used to
        // run on stock Tailwind defaults -- #0f172a slate, #6366f1, #f3f4f6, Arial
        // -- none of which appear anywhere in the product. `brand` is the app's
        // --primary held exactly (243 68% 57%), and `ink` is the landing's
        // near-black, which is biased indigo rather than grey: next to the brand
        // colour a true grey reads as a different palette.
        const C = {
            brand:     '#4f46e5',
            brandSoft: '#6d5efc',
            ink:       '#17152f',
            muted:     '#5b5878',
            dim:       '#8a87a4',
            ground:    '#f6f6fb',
            panel:     '#fbfbfe',
            card:      '#ffffff',
            line:      '#e4e3ec',
            paid:      '#0f7a4d',
        }
        // Poppins is the product's headline face. Gmail strips webfonts, so the
        // stack has to stand on its own -- the tight tracking below is what
        // carries the brand when the face falls back.
        const DISPLAY = `'Poppins','Bricolage Grotesque',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`
        const BODY = `'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`

        const esc = (v: unknown) =>
            String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

        const qty = Number(requestData.ticket_quantity) || 1
        const ticketWord = qty === 1 ? 'ticket' : 'tickets'

        // ── Payment method ───────────────────────────────────────────────
        //
        // This line used to print whatever string the intent happened to hold,
        // which is an internal token, not English: a buyer saw "UNKNOWN" under
        // ₱699.00 on the one email they keep. The raw values in circulation are
        // `multiple` (the placeholder written before the buyer picks a method
        // at Xendit — still set on 1,174 of the last 60 days' intents),
        // `UNKNOWN` from the webhook's own mapper, `FREE`, and channel codes
        // like `BPI_DIRECT_DEBIT`.
        //
        // Mapping mirrors getPaymentChannel() in the web app so the receipt and
        // the dashboard call the same payment the same thing. Anything that is
        // not a real channel returns null and the line is dropped — a receipt
        // that stays quiet about how you paid is fine; one that says UNKNOWN
        // reads like we lost the payment.
        function paymentLabel(raw?: string): string | null {
            if (!raw) return null
            const m = raw.toLowerCase().trim()
            if (['unknown', 'multiple', 'none', 'null', ''].includes(m)) return null
            if (m === 'free' || m === 'comp') return null
            if (['gcash'].includes(m)) return 'GCash'
            if (['maya', 'paymaya'].includes(m)) return 'Maya'
            if (['grabpay'].includes(m)) return 'GrabPay'
            if (['shopeepay'].includes(m)) return 'ShopeePay'
            if (['qrph', 'qr_code'].includes(m)) return 'QR Ph'
            if (['cards', 'card', 'credit_card', 'debit_card'].includes(m)) return 'Card'
            if (['cash'].includes(m)) return 'Cash'
            if (['bank', 'bank_transfer', 'virtual_account'].includes(m)) return 'Bank transfer'
            if (m.endsWith('_direct_debit')) {
                const bank = m.replace('_direct_debit', '').toUpperCase()
                return `${bank} direct debit`
            }
            if (['otc', 'over_the_counter', '7eleven', 'cebuana'].includes(m)) return 'Over the counter'
            // A real but unmapped channel: title-case it rather than shouting.
            return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        }
        const methodLabel = paymentLabel(requestData.payment_method)

        // ── The call to action ───────────────────────────────────────────
        //
        // Buyers were not finding this. It used to sit BELOW the cover image,
        // and a cover has no height we control: email clients do not support
        // object-fit, so a portrait poster — the usual shape for a PH event —
        // renders 430–600px tall on a phone and pushes the button a full screen
        // past the fold. Nothing that matters can live under that image.
        //
        // So the order is now identity, action, then everything else. It also
        // fills the column instead of sitting 260px wide in the middle, which
        // on a phone is the difference between a link and a button.
        const cta = (label: string, primary: boolean) => requestData.ticket_url
            ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
              <tr><td align="center" style="border-radius:10px;background:${primary ? C.brand : C.panel};border:1px solid ${primary ? C.brand : C.line}">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                  href="${esc(requestData.ticket_url)}" style="height:54px;v-text-anchor:middle;width:300px"
                  arcsize="18%" stroke="f" fillcolor="${primary ? C.brand : C.panel}">
                  <w:anchorlock/>
                  <center style="color:${primary ? '#ffffff' : C.ink};font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold">${label}</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <a href="${esc(requestData.ticket_url)}"
                   style="display:block;color:${primary ? '#ffffff' : C.ink};text-decoration:none;font-family:${DISPLAY};font-weight:700;letter-spacing:-0.01em;padding:17px 20px;font-size:17px;text-align:center;border-radius:10px">${label}</a>
                <!--<![endif]-->
              </td></tr>
            </table>`
            : ''

        const noLinkFallback = `
            <tr><td align="center" style="padding:2px 0 0;font-family:${BODY};font-size:15px;color:${C.muted};line-height:1.55">
              Your <strong style="color:${C.ink}">${qty} ${ticketWord}</strong> ${qty === 1 ? 'is' : 'are'} confirmed. Log in to your account to view your QR ${qty === 1 ? 'code' : 'codes'}.
            </td></tr>`

        const row = (label: string, value: string) => `
            <tr>
              <td style="padding:0 0 3px;font-family:${BODY};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.dim}">${label}</td>
            </tr>
            <tr>
              <td style="padding:0 0 14px;font-family:${BODY};font-size:15px;color:${C.ink};line-height:1.4">${value}</td>
            </tr>`

        const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<!-- Without this, Gmail and Apple Mail auto-invert the card in dark mode and
     the indigo header comes back as something else entirely. -->
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>Your ${ticketWord} for ${esc(requestData.event_title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;padding:0;width:100%!important;background:${C.ground}}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  table{border-collapse:collapse}
  @media (max-width:620px){
    .hh-pad{padding-left:20px!important;padding-right:20px!important}
    .hh-h1{font-size:24px!important}
    .hh-title{font-size:21px!important}
    /* The outer gutter costs 24px of width on a 390px phone for nothing. */
    .hh-shell{padding:0!important}
    .hh-card{border-radius:0!important;border-left:0!important;border-right:0!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ground}">
<!-- Preheader: the inbox preview line, and on a phone it is read before the
     message is even opened. It used to restate the subject; it now says what
     to do, because that is the one thing buyers were missing. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  Tap “View your ${ticketWord}” to open your QR code — show it at the entrance.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}">
<tr><td align="center" style="padding:24px 12px" class="hh-shell">

  <!-- Outlook ignores max-width on a div, so the whole card is a table. -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="hh-card"
         style="width:100%;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden;border:1px solid ${C.line}">

    <!-- Header ───────────────────────────────────────────────────────
         Trimmed from 38px/34px padding and a 30px headline. The old block
         spent ~170px of a ~700px phone viewport before saying anything, and
         every pixel here is a pixel the button is pushed down by. -->
    <tr><td style="background:${C.brand};background-image:linear-gradient(135deg,${C.brand} 0%,${C.brandSoft} 100%);padding:24px 32px 22px" class="hh-pad">
      <!-- The wordmark is text, not an image: it survives image blocking, which
           is the one moment the brand most needs to be present. -->
      <div style="font-family:${DISPLAY};font-weight:800;font-size:13px;letter-spacing:0.22em;color:#ffffff;opacity:.8">HANGHUT</div>
      <div class="hh-h1" style="font-family:${DISPLAY};font-weight:800;font-size:27px;letter-spacing:-0.035em;color:#ffffff;line-height:1.12;padding-top:10px">You&rsquo;re going.</div>
      <div style="font-family:${BODY};font-size:14px;color:#ffffff;opacity:.82;padding-top:5px">${qty} ${ticketWord} confirmed — see you there.</div>
    </td></tr>

    <!-- Identity, then action ───────────────────────────────────────
         Which event this is has to come first — a buyer will not tap a button
         before they know what it opens — but it is kept to three tight lines
         so the button still lands well above the fold. -->
    <tr><td style="padding:24px 32px 0" class="hh-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td class="hh-title" style="padding:0 0 16px;font-family:${DISPLAY};font-weight:700;font-size:23px;letter-spacing:-0.03em;color:${C.ink};line-height:1.22">${esc(requestData.event_title)}</td></tr>
        ${row('When', esc(formattedDate))}
        ${row('Where', esc(requestData.event_venue))}
      </table>
    </td></tr>

    <!-- THE BUTTON. Everything above it is kept short for this one reason. -->
    ${requestData.ticket_url ? `
    <tr><td align="center" style="padding:10px 32px 0" class="hh-pad">${cta(`View your ${ticketWord}`, true)}</td></tr>
    <tr><td align="center" style="padding:12px 32px 0;font-family:${BODY};color:${C.muted};font-size:13px;line-height:1.5" class="hh-pad">
      Show the QR at the entrance — a screenshot works too.<br/>
      <span style="color:${C.dim}">You can download a PDF copy from the same page.</span>
    </td></tr>` : noLinkFallback}

    <!-- Everything below here is confirmation, not instruction ────── -->
    <tr><td style="padding:24px 32px 28px" class="hh-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${requestData.event_cover_image ? `
        <tr><td style="padding:0 0 22px">
          <!-- Moved below the button on purpose. No email client supports
               object-fit, so this image's height is whatever the organizer
               uploaded — it cannot be allowed to sit above anything that
               matters. -->
          <img src="${esc(requestData.event_cover_image)}" width="536" alt="${esc(requestData.event_title)}"
               style="width:100%;max-width:536px;height:auto;display:block;border-radius:10px"/>
        </td></tr>` : ''}

        <!-- Payment. A neutral panel with one green line, rather than the old
             wall of stock green. -->
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:${C.panel};border:1px solid ${C.line};border-radius:10px">
            <tr><td style="padding:16px 18px">
              <div style="font-family:${BODY};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${C.paid}">Payment received</div>
              <div style="font-family:${DISPLAY};font-weight:700;font-size:22px;letter-spacing:-0.02em;color:${C.ink};padding-top:6px">${formattedAmount}</div>
              ${methodLabel ? `<div style="font-family:${BODY};font-size:13px;color:${C.muted};padding-top:3px">Paid with ${esc(methodLabel)}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>

        <!-- Second chance at the link, for anyone who scrolled past the first
             one. Costs nothing and catches the reader who came back to the
             email at the gate and started from the bottom. -->
        ${requestData.ticket_url ? `
        <tr><td align="center" style="padding:22px 0 0">${cta(`View your ${ticketWord}`, false)}</td></tr>` : ''}
      </table>
    </td></tr>

    <!-- Footer ───────────────────────────────────────────────────── -->
    <tr><td style="background:${C.panel};border-top:1px solid ${C.line};padding:22px 32px;text-align:center" class="hh-pad">
      <div style="font-family:${BODY};font-size:12px;color:${C.dim}">Ref: ${esc(requestData.transaction_ref)}</div>
      <div style="font-family:${BODY};font-size:12px;color:${C.dim};padding-top:6px">
        Questions? <a href="mailto:contact@hanghut.com" style="color:${C.brand};text-decoration:none">contact@hanghut.com</a>
      </div>
      <div style="font-family:${DISPLAY};font-weight:800;font-size:11px;letter-spacing:0.2em;color:${C.dim};padding-top:14px">HANGHUT</div>
      <div style="font-family:${BODY};font-size:11px;color:${C.dim};padding-top:4px">&copy; ${new Date().getFullYear()} HangHut. All rights reserved.</div>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`
        // Plain-text alternative. HTML-only is a spam signal, and it is the
        // version a screen reader and a smartwatch actually get.
        // Mirrors the HTML's order, link included, for the same reason: this
        // is what a screen reader and a smartwatch get, and burying the link
        // under the receipt there would reproduce the bug in another medium.
        const text = [
            `You're going — ${qty} ${ticketWord} confirmed.`,
            ``,
            requestData.event_title,
            `When:  ${formattedDate}`,
            `Where: ${requestData.event_venue}`,
            ...(requestData.ticket_url
                ? ['', `View your ${ticketWord}: ${requestData.ticket_url}`,
                   'Show the QR at the entrance — a screenshot works too.',
                   'You can download a PDF copy from the same page.']
                : ['', `Log in to your account to view your QR ${qty === 1 ? 'code' : 'codes'}.`]),
            ``,
            `Payment received: ${formattedAmount}${methodLabel ? ` (paid with ${methodLabel})` : ''}`,
            ``,
            `Ref: ${requestData.transaction_ref}`,
            `Questions? contact@hanghut.com`,
            `HangHut`,
        ].join('\n')

        if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY')
        // Only the lightweight calendar invite is attached now — no per-purchase
        // PDF generation (buyers view/download tickets from the hosted page).
        const attachments = (() => {
            const a: { filename: string; content: string }[] = []
            try { const ics = buildIcs(requestData); if (ics) a.push(ics) } catch {}
            return a
        })()
        const maxRetries=3
        let attempt=0, sendSuccess=false, responseData: any=null, finalStatus=500
        while (attempt<maxRetries && !sendSuccess) {
            attempt++
            try {
                const resendRes = await fetch('https://api.resend.com/emails',{
                    method:'POST',
                    headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
                    body:JSON.stringify({
                        from:'HangHut Tickets <tickets@hanghut.com>',
                        to:[requestData.email],
                        // Replies used to land on tickets@, which nobody reads.
                        reply_to:'contact@hanghut.com',
                        subject:`Your ${ticketWord} for ${requestData.event_title}`,
                        html,
                        text,
                        attachments,
                    })
                })
                responseData=await resendRes.json()
                finalStatus=resendRes.status
                if(resendRes.ok){sendSuccess=true}
                else if(resendRes.status===429){await new Promise(r=>setTimeout(r,Math.pow(2,attempt)*1000))}
                else{throw new Error(responseData.message||JSON.stringify(responseData))}
            } catch(e:any){
                if(attempt>=maxRetries||finalStatus!==429){
                    if(!responseData)responseData={error:e.message||'Unknown error'}
                    break
                }
            }
        }
        if (!sendSuccess) return new Response(JSON.stringify({error:responseData}),{headers:{...corsHeaders,'Content-Type':'application/json'},status:finalStatus})
        return new Response(JSON.stringify(responseData),{headers:{...corsHeaders,'Content-Type':'application/json'},status:200})
    } catch(error:any){
        return new Response(JSON.stringify({error:error.message}),{headers:{...corsHeaders,'Content-Type':'application/json'},status:500})
    }
})
