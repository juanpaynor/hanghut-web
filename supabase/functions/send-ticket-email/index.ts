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
    return `PHP ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
        const requestData: EmailRequest = await req.json()
        const formattedAmount = formatCurrency(Number(requestData.total_amount))
        const formattedDate = formatEventDate(requestData.event_date)
        const ctaButton = requestData.ticket_url
            ? `<div style="text-align:center;margin:28px 0 8px"><a href="${requestData.ticket_url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-size:16px">View Your Tickets</a></div><p style="text-align:center;color:#94a3b8;font-size:12px;margin:0 0 8px">Open this on your phone at the entrance — a screenshot works too.</p>`
            : ''
        const detailCopy = requestData.ticket_url
            ? `<p style="margin-top:20px;text-align:center;color:#475569">Your <strong>${requestData.ticket_quantity} ticket(s)</strong> with QR codes are on the page above. You can also download a PDF copy from there.</p>`
            : `<p style="margin-top:24px;text-align:center;color:#475569">Your <strong>${requestData.ticket_quantity} ticket(s)</strong> are confirmed. Log in to your account to view your QR codes.</p>`
        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:40px 0;margin:0"><div style="background:#fff;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)"><div style="background:#0f172a;padding:40px 20px;text-align:center"><h1 style="color:#fff;margin:0;font-size:24px">Your Order is Confirmed</h1><p style="color:#94a3b8;margin:10px 0 0;font-size:16px">We're excited to see you there!</p></div><div style="padding:40px 30px">${requestData.event_cover_image?`<img src="${requestData.event_cover_image}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:20px">`:''}<h2 style="color:#0f172a;margin:0 0 20px">${requestData.event_title}</h2><p><strong>Date:</strong> ${formattedDate}</p><p><strong>Location:</strong> ${requestData.event_venue}</p><div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:8px;padding:16px;margin-top:10px"><p style="margin:0;color:#166534;font-weight:600">Payment Successful</p><p style="margin:2px 0 0;color:#15803d">Total Paid: ${formattedAmount}</p>${requestData.payment_method?`<p style="margin:2px 0 0;color:#15803d">${requestData.payment_method}</p>`:''}</div>${ctaButton}${detailCopy}</div><div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0"><p>Ref: ${requestData.transaction_ref}</p><p>&copy; ${new Date().getFullYear()} HangHut. All rights reserved.</p></div></div></body></html>`
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
                        subject:`Your Tickets for ${requestData.event_title}`,
                        html,
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
