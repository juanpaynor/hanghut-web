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

        // Outlook renders CSS buttons as bare text links, which loses the single
        // strongest piece of brand colour in the message. VML gives it the fill
        // back; every other client ignores the conditional block.
        const ctaButton = requestData.ticket_url
            ? `
            <tr><td align="center" style="padding:32px 0 10px">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${esc(requestData.ticket_url)}" style="height:50px;v-text-anchor:middle;width:260px"
                arcsize="16%" stroke="f" fillcolor="${C.brand}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold">View your ${ticketWord}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(requestData.ticket_url)}"
                 style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;font-family:${DISPLAY};font-weight:700;letter-spacing:-0.01em;padding:15px 34px;border-radius:8px;font-size:16px">View your ${ticketWord}</a>
              <!--<![endif]-->
            </td></tr>
            <tr><td align="center" style="padding:0 0 4px;font-family:${BODY};color:${C.dim};font-size:12px">
              Open this on your phone at the entrance — a screenshot works too.
            </td></tr>`
            : ''

        const detailCopy = requestData.ticket_url
            ? `Your <strong style="color:${C.ink}">${qty} ${ticketWord}</strong> with QR codes are on the page above. You can also download a PDF copy from there.`
            : `Your <strong style="color:${C.ink}">${qty} ${ticketWord}</strong> are confirmed. Log in to your account to view your QR codes.`

        const row = (label: string, value: string) => `
            <tr>
              <td style="padding:0 0 4px;font-family:${BODY};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.dim}">${label}</td>
            </tr>
            <tr>
              <td style="padding:0 0 18px;font-family:${BODY};font-size:15px;color:${C.ink};line-height:1.45">${value}</td>
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
    .hh-pad{padding-left:22px!important;padding-right:22px!important}
    .hh-h1{font-size:26px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ground}">
<!-- Preheader: the inbox preview line. Left out, clients scrape whatever text
     comes first, which was the word "HANGHUT". -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  You're going to ${esc(requestData.event_title)} — ${qty} ${ticketWord} confirmed.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}">
<tr><td align="center" style="padding:36px 12px">

  <!-- Outlook ignores max-width on a div, so the whole card is a table. -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         style="width:600px;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden;border:1px solid ${C.line}">

    <!-- Header ───────────────────────────────────────────────────── -->
    <tr><td style="background:${C.brand};background-image:linear-gradient(135deg,${C.brand} 0%,${C.brandSoft} 100%);padding:38px 32px 34px" class="hh-pad">
      <!-- The wordmark is text, not an image: it survives image blocking, which
           is the one moment the brand most needs to be present. -->
      <div style="font-family:${DISPLAY};font-weight:800;font-size:15px;letter-spacing:0.22em;color:#ffffff;opacity:.85">HANGHUT</div>
      <div class="hh-h1" style="font-family:${DISPLAY};font-weight:800;font-size:30px;letter-spacing:-0.035em;color:#ffffff;line-height:1.15;padding-top:14px">You&rsquo;re going.</div>
      <div style="font-family:${BODY};font-size:15px;color:#ffffff;opacity:.82;padding-top:8px">${qty} ${ticketWord} confirmed — see you there.</div>
    </td></tr>

    <!-- Body ─────────────────────────────────────────────────────── -->
    <tr><td style="padding:32px" class="hh-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${requestData.event_cover_image ? `
        <tr><td style="padding:0 0 24px">
          <!-- No object-fit: no email client supports it, so the old fixed
               200px height squashed every wide cover. Natural ratio instead. -->
          <img src="${esc(requestData.event_cover_image)}" width="536" alt="${esc(requestData.event_title)}"
               style="width:100%;max-width:536px;height:auto;display:block;border-radius:10px"/>
        </td></tr>` : ''}

        <tr><td style="padding:0 0 22px;font-family:${DISPLAY};font-weight:700;font-size:23px;letter-spacing:-0.03em;color:${C.ink};line-height:1.25">${esc(requestData.event_title)}</td></tr>

        ${row('When', esc(formattedDate))}
        ${row('Where', esc(requestData.event_venue))}

        <!-- Payment. A neutral panel with one green line, rather than the old
             wall of stock green. -->
        <tr><td style="padding:4px 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:${C.panel};border:1px solid ${C.line};border-radius:10px">
            <tr><td style="padding:16px 18px">
              <div style="font-family:${BODY};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${C.paid}">Payment received</div>
              <div style="font-family:${DISPLAY};font-weight:700;font-size:22px;letter-spacing:-0.02em;color:${C.ink};padding-top:6px">${formattedAmount}</div>
              ${requestData.payment_method ? `<div style="font-family:${BODY};font-size:13px;color:${C.muted};padding-top:3px">${esc(requestData.payment_method)}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>

        ${ctaButton}

        <tr><td align="center" style="padding:16px 0 0;font-family:${BODY};font-size:14px;color:${C.muted};line-height:1.55">${detailCopy}</td></tr>
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
        const text = [
            `You're going — ${qty} ${ticketWord} confirmed.`,
            ``,
            requestData.event_title,
            `When:  ${formattedDate}`,
            `Where: ${requestData.event_venue}`,
            ``,
            `Payment received: ${formattedAmount}${requestData.payment_method ? ` (${requestData.payment_method})` : ''}`,
            ...(requestData.ticket_url
                ? ['', `View your ${ticketWord}: ${requestData.ticket_url}`,
                   'Open this on your phone at the entrance — a screenshot works too.']
                : ['', `Log in to your account to view your QR codes.`]),
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
