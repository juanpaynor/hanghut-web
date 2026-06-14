import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ============================================================================
 * EMAIL QUEUE CONSUMER — Phase 3 (queue-based marketing sends)
 * ============================================================================
 * Drains the `email_send_queue`. Each message is one batch (<=100 recipients)
 * of a campaign. The worker builds the per-recipient unsubscribe footer, sends
 * the batch via Resend (with an idempotency key), records the email_sends
 * ledger, and atomically advances the campaign tallies via finalize_email_batch.
 *
 * Exactly-once accounting: email_sends has a unique (campaign_id, recipient)
 * index. We insert ON CONFLICT DO NOTHING and count only NEW rows, so a batch
 * retried after a successful Resend call (idempotency-key dedup) records and
 * counts nothing extra.
 *
 * Triggered by pg_cron every 10s. verify_jwt = true (cron passes service role).
 * ============================================================================
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const MARKETING_FROM_DOMAIN = Deno.env.get("MARKETING_FROM_DOMAIN") || "hanghut.com"
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") || SUPABASE_SERVICE_ROLE_KEY || ""

const QUEUE_NAME = "email_send_queue"
const MESSAGES_PER_RUN = 5       // batches handled per cron tick
const VISIBILITY_TIMEOUT = 120   // seconds a claimed message is hidden from other runs
const MAX_RETRIES = 3            // dead-letter a batch after this many failed Resend attempts
const RESEND_SPACING_MS = 700    // gap between Resend calls to respect rate limits

interface Recipient { email: string; unsubscribe_token?: string | null }
interface BatchMessage {
    campaign_id: string
    partner_id: string
    sender_name: string
    batch_index: number
    recipients: Recipient[]
}

function sanitizeSenderName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function hmacHex(key: string, msg: string): Promise<string> {
    const enc = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
        'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

serve(async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
        queue_name: QUEUE_NAME,
        sleep_seconds: VISIBILITY_TIMEOUT,
        batch_size: MESSAGES_PER_RUN,
    })

    if (readError) {
        console.error('❌ Queue read error:', readError)
        return new Response(JSON.stringify({ error: readError.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        })
    }
    if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ processed: 0 }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        })
    }

    console.log(`📬 Processing ${messages.length} email batch(es)...`)

    // Cache campaign subject/html per run so we don't refetch per batch.
    const campaignCache = new Map<string, { subject: string; html: string } | null>()
    async function getCampaign(id: string) {
        if (campaignCache.has(id)) return campaignCache.get(id)!
        const { data } = await supabase
            .from('email_campaigns')
            .select('subject, html_content')
            .eq('id', id)
            .maybeSingle()
        const val = data ? { subject: data.subject, html: data.html_content } : null
        campaignCache.set(id, val)
        return val
    }

    let processed = 0
    let firstCall = true

    for (const msg of messages) {
        const batch = msg.message as BatchMessage
        const { campaign_id, partner_id, sender_name, batch_index, recipients } = batch || {}

        // Guard against malformed / orphaned messages.
        if (!campaign_id || !Array.isArray(recipients) || recipients.length === 0) {
            console.warn(`⚠️ Archiving malformed msg ${msg.msg_id}`)
            await supabase.rpc('pgmq_archive', { queue_name: QUEUE_NAME, msg_id: msg.msg_id })
            continue
        }

        // Dead-letter poison batches, counting as failed only the recipients not
        // already recorded (avoids double-counting a rare succeeded-but-undeleted batch).
        if (msg.read_ct > MAX_RETRIES) {
            const { count: already } = await supabase
                .from('email_sends')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', campaign_id)
                .in('recipient', recipients.map(r => r.email))
            const failedDelta = recipients.length - (already ?? 0)
            console.warn(`🪣 Dead-lettering batch ${msg.msg_id} after ${msg.read_ct} attempts; counting ${failedDelta} failed`)
            if (failedDelta > 0) {
                await supabase.rpc('finalize_email_batch', { p_campaign_id: campaign_id, p_sent: 0, p_failed: failedDelta })
            }
            await supabase.rpc('pgmq_archive', { queue_name: QUEUE_NAME, msg_id: msg.msg_id })
            continue
        }

        const campaign = await getCampaign(campaign_id)
        if (!campaign) {
            console.warn(`⚠️ Campaign ${campaign_id} not found; archiving msg ${msg.msg_id}`)
            await supabase.rpc('pgmq_archive', { queue_name: QUEUE_NAME, msg_id: msg.msg_id })
            continue
        }

        // Rate-limit spacing between Resend calls within a run.
        if (!firstCall) await sleep(RESEND_SPACING_MS)
        firstCall = false

        try {
            const fromAddress = `${sender_name} <${sanitizeSenderName(sender_name)}@${MARKETING_FROM_DOMAIN}>`

            const payloads = await Promise.all(recipients.map(async (sub) => {
                let unsubscribeUrl: string
                if (sub.unsubscribe_token) {
                    unsubscribeUrl = `https://hanghut.com/unsubscribe?token=${sub.unsubscribe_token}`
                } else {
                    const sig = await hmacHex(UNSUBSCRIBE_SECRET, `${sub.email.toLowerCase()}|${partner_id}`)
                    const params = new URLSearchParams({ e: sub.email, p: partner_id, sig })
                    unsubscribeUrl = `https://hanghut.com/unsubscribe?${params.toString()}`
                }
                const footerHtml = `
                    <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #888; font-size: 12px; font-family: sans-serif;">
                        <p>You received this email because you subscribed to updates from <strong>${sender_name}</strong>.</p>
                        <p><a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a> from these emails.</p>
                    </div>
                `
                return {
                    from: fromAddress,
                    to: sub.email,
                    subject: campaign.subject,
                    html: campaign.html + footerHtml,
                    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
                }
            }))

            const resendRes = await fetch('https://api.resend.com/emails/batch', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                    // Resend dedups identical idempotency keys for 24h, so a
                    // re-delivered queue message never sends the batch twice.
                    'Idempotency-Key': `${campaign_id}:${batch_index}`,
                },
                body: JSON.stringify(payloads),
            })

            if (!resendRes.ok) {
                const err = await resendRes.json().catch(() => ({}))
                throw new Error(`Resend batch failed (${resendRes.status}): ${JSON.stringify(err)}`)
            }

            const result = await resendRes.json()

            // Record per-recipient sends; ON CONFLICT DO NOTHING makes this
            // idempotent. The count of NEW rows is what we advance the tally by.
            const sendRows = recipients.map((sub, idx) => ({
                campaign_id,
                partner_id,
                recipient: sub.email,
                resend_id: result.data?.[idx]?.id ?? null,
                status: 'sent',
            }))
            const { data: inserted, error: insErr } = await supabase
                .from('email_sends')
                .upsert(sendRows, { onConflict: 'campaign_id,recipient', ignoreDuplicates: true })
                .select('id')
            if (insErr) throw new Error(`email_sends insert failed: ${insErr.message}`)

            const newCount = inserted?.length ?? 0
            if (newCount > 0) {
                await supabase.rpc('finalize_email_batch', {
                    p_campaign_id: campaign_id, p_sent: newCount, p_failed: 0,
                })
            }

            await supabase.rpc('pgmq_delete', { queue_name: QUEUE_NAME, msg_id: msg.msg_id })
            processed++
            console.log(`✅ Batch ${batch_index} of campaign ${campaign_id}: ${newCount} sent`)
        } catch (err) {
            // Leave the message on the queue; it reappears after the visibility
            // timeout and is retried (up to MAX_RETRIES).
            console.error(`❌ Batch ${msg.msg_id} failed (will retry):`, err)
        }
    }

    return new Response(JSON.stringify({ processed, total: messages.length }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    })
})
