import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Pinned: the floating `@2` resolved to a build whose postgrest-js 404s on
// esm.sh and blocked every deploy. See edge-function-deploy-pinning.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

/**
 * ============================================================================
 * SEND PROMOTIONAL EMAIL — enqueuer (Phase 3) + draft reuse (Phase 6)
 *                          + test-send & {{first_name}} personalization
 *                          + recently-emailed exclusion
 * ============================================================================
 * Resolves + suppression-filters the audience, creates (or reuses a draft of)
 * the campaign row, then chunks recipients into batches onto `email_send_queue`.
 * The process-email-queue worker does the actual Resend sends + token merge.
 *
 * Personalization: recipients now carry `first_name`, and we pass a campaign
 * `tokens` map ({business_name}); process-email-queue substitutes {{first_name}}
 * and {{business_name}} per recipient.
 *
 * Test-send: when `test_recipient` is set we send ONE email directly via Resend
 * (with the same footer + token merge) and DO NOT touch email_campaigns, the
 * queue, or stats — so previews never pollute campaign history.
 *
 * Recently-emailed exclusion: `exclude_recent_days` drops anyone this partner
 * has sent ANY campaign to in that window (from email_sends). Enforced here,
 * next to suppression, so immediate and scheduled sends get the same rule.
 * Before this nothing remembered a send — 13 people got two campaigns from
 * the same organizer inside a week.
 * ============================================================================
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const MARKETING_FROM_DOMAIN = Deno.env.get("MARKETING_FROM_DOMAIN") || "hanghut.com"
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") || SUPABASE_SERVICE_ROLE_KEY || ""

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const QUEUE_NAME = 'email_send_queue'
const BATCH_SIZE = 100 // Resend batch limit; also our queue message size
const MAX_EXCLUDE_DAYS = 90

type InRecipient = { email: string; first_name?: string | null }

interface RequestData {
    partner_id: string
    subject: string
    html_content: string
    sender_name: string
    test_mode?: boolean
    test_recipient?: string
    target_emails?: string[]
    target_recipients?: InRecipient[]
    segment?: string
    event_id?: string
    draft_campaign_id?: string
    exclude_recent_days?: number
}

function sanitizeSenderName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Replace {{token}} placeholders; unknown tokens are left untouched.
function applyTokens(text: string, tokens: Record<string, string>): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in tokens ? tokens[k] : m))
}

async function hmacHex(key: string, msg: string): Promise<string> {
    const enc = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
        'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Friendly first-name guess from an email local part (test-send preview only).
function prettyLocal(email: string): string {
    const local = (email.split('@')[0] || '').split(/[._+\-]/)[0] || ''
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there'
}

function footerFor(senderName: string, unsubscribeUrl: string): string {
    return `
        <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #888; font-size: 12px; font-family: sans-serif;">
            <p>You received this email because you subscribed to updates from <strong>${senderName}</strong>.</p>
            <p><a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a> from these emails.</p>
        </div>
    `
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json() as RequestData
        const { partner_id, subject, html_content, sender_name, test_mode, test_recipient,
            target_emails, target_recipients, segment, event_id, draft_campaign_id, exclude_recent_days } = body

        if (!partner_id || !subject || !html_content || !sender_name) {
            throw new Error("Missing required fields")
        }

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // ── TEST SEND ────────────────────────────────────────────────────────
        // One direct Resend send to the requester. No campaign row, no queue,
        // no stats — a pure preview.
        if (test_recipient) {
            if (!RESEND_API_KEY) throw new Error("Email service not configured")
            const to = test_recipient.trim()
            const tokens = { business_name: sender_name, first_name: prettyLocal(to) }
            const sig = await hmacHex(UNSUBSCRIBE_SECRET, `${to.toLowerCase()}|${partner_id}`)
            const params = new URLSearchParams({ e: to, p: partner_id, sig })
            const unsubscribeUrl = `https://hanghut.com/unsubscribe?${params.toString()}`
            const fromAddress = `${sender_name} <${sanitizeSenderName(sender_name)}@${MARKETING_FROM_DOMAIN}>`

            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: fromAddress,
                    to,
                    subject: `[TEST] ${applyTokens(subject, tokens)}`,
                    html: applyTokens(html_content, tokens) + footerFor(sender_name, unsubscribeUrl),
                    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
                }),
            })
            if (!res.ok) {
                const e = await res.json().catch(() => ({}))
                throw new Error(`Resend failed (${res.status}): ${JSON.stringify(e)}`)
            }
            return new Response(JSON.stringify({ success: true, test: true, to }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            })
        }

        // 1. Resolve recipients (each carries first_name where known)
        let recipients: { email: string; unsubscribe_token?: string | null; first_name?: string | null }[] = []

        if (test_mode) {
            console.log('🧪 Test Mode: queuing to delivered@resend.dev')
            recipients = [{ email: 'delivered@resend.dev', unsubscribe_token: null }]
        } else if (target_recipients && target_recipients.length > 0) {
            console.log(`🎯 Targeted send: ${target_recipients.length} recipients (named)`)
            recipients = target_recipients.map(r => ({ email: r.email, unsubscribe_token: null, first_name: r.first_name ?? null }))
        } else if (segment === 'event_subscribers' && event_id) {
            console.log(`📋 Event Subscribers mode: event ${event_id}`)
            const { data: subs, error } = await supabase
                .from('partner_subscribers')
                .select('email, unsubscribe_token, full_name')
                .eq('partner_id', partner_id)
                .eq('event_id', event_id)
                .eq('is_active', true)
            if (error) throw error
            recipients = (subs ?? []).map(s => ({ email: s.email, unsubscribe_token: s.unsubscribe_token, first_name: (s.full_name || '').trim().split(/\s+/)[0] || null }))
        } else if (target_emails && target_emails.length > 0) {
            console.log(`🎯 Targeted send: ${target_emails.length} emails`)
            recipients = target_emails.map(email => ({ email, unsubscribe_token: null }))
        } else {
            console.log(`🔍 All subscribers for partner: ${partner_id}`)
            const { data: subs, error } = await supabase
                .from('partner_subscribers')
                .select('email, unsubscribe_token, full_name')
                .eq('partner_id', partner_id)
                .eq('is_active', true)
            if (error) throw error
            recipients = (subs ?? []).map(s => ({ email: s.email, unsubscribe_token: s.unsubscribe_token, first_name: (s.full_name || '').trim().split(/\s+/)[0] || null }))
        }

        console.log(`✅ Resolved ${recipients.length} recipients`)

        // 2. Suppression filter (this partner + global). Authoritative chokepoint.
        if (!test_mode && recipients.length > 0) {
            const { data: suppressed, error: supErr } = await supabase
                .from('email_suppressions')
                .select('email')
                .or(`partner_id.eq.${partner_id},partner_id.is.null`)
            if (supErr) {
                console.error('⚠️ Suppression lookup failed, proceeding without filter:', supErr)
            } else if (suppressed && suppressed.length > 0) {
                const set = new Set(suppressed.map(s => s.email.toLowerCase()))
                const before = recipients.length
                recipients = recipients.filter(r => !set.has(r.email.toLowerCase()))
                console.log(`🚫 Filtered ${before - recipients.length} suppressed recipients`)
            }
        }

        // 2b. Recently-emailed exclusion. Unlike suppression, a lookup failure
        //     here ABORTS: the organizer asked us not to double-send, and the
        //     silent alternative is exactly the double-send they asked to avoid.
        let skippedRecent = 0
        const excludeDays = Math.min(Math.max(Math.floor(Number(exclude_recent_days) || 0), 0), MAX_EXCLUDE_DAYS)
        if (!test_mode && excludeDays > 0 && recipients.length > 0) {
            const { data: recent, error: recentErr } = await supabase
                .rpc('get_recently_emailed', { p_partner_id: partner_id, p_days: excludeDays })
            if (recentErr) throw new Error(`Could not load recent sends: ${recentErr.message}`)
            const set = new Set<string>((recent ?? []).map((e: unknown) => String(typeof e === 'object' && e !== null ? Object.values(e)[0] : e).toLowerCase()))
            const before = recipients.length
            recipients = recipients.filter(r => !set.has(r.email.toLowerCase()))
            skippedRecent = before - recipients.length
            console.log(`⏭️ Skipped ${skippedRecent} recipients emailed in the last ${excludeDays} days`)
        }

        if (recipients.length === 0) {
            return new Response(JSON.stringify({ success: true, message: "No recipients found", queued: 0, skipped_recent: skippedRecent }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            })
        }

        // 3. Create the campaign row (status 'sending'); the worker finalises it.
        //    Phase 6: reuse an existing draft row when draft_campaign_id is given.
        let campaignId: string
        if (draft_campaign_id) {
            const { data: updated, error: updErr } = await supabase
                .from('email_campaigns')
                .update({
                    subject, html_content,
                    recipient_count: recipients.length,
                    sent_count: 0, failed_count: 0,
                    status: 'sending',
                    segment: segment || 'all_subscribers',
                    event_id: event_id || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', draft_campaign_id)
                .eq('partner_id', partner_id)
                .eq('status', 'draft')
                .select('id')
                .single()
            if (updErr || !updated) {
                throw new Error(`Failed to promote draft: ${updErr?.message || 'draft not found'}`)
            }
            campaignId = updated.id
        } else {
            const { data: campaignRow, error: campErr } = await supabase
                .from('email_campaigns')
                .insert({
                    partner_id,
                    subject,
                    html_content,
                    recipient_count: recipients.length,
                    sent_count: 0,
                    failed_count: 0,
                    status: 'sending',
                    segment: segment || 'all_subscribers',
                    event_id: event_id || null,
                })
                .select('id')
                .single()
            if (campErr || !campaignRow) {
                throw new Error(`Failed to create campaign: ${campErr?.message}`)
            }
            campaignId = campaignRow.id
        }

        // 4. Chunk + enqueue. Each message is one batch the worker will send.
        //    tokens ride along so process-email-queue can resolve {{business_name}}
        //    (and {{first_name}} from each recipient).
        const tokens = { business_name: sender_name }
        let enqueued = 0
        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const batch = recipients.slice(i, i + BATCH_SIZE)
            const { error: qErr } = await supabase.rpc('pgmq_send', {
                queue_name: QUEUE_NAME,
                message: {
                    campaign_id: campaignId,
                    partner_id,
                    sender_name,
                    batch_index: Math.floor(i / BATCH_SIZE),
                    recipients: batch,
                    tokens,
                },
            })
            if (qErr) {
                console.error(`⚠️ Failed to enqueue batch ${i / BATCH_SIZE}:`, qErr)
            } else {
                enqueued += batch.length
            }
        }

        // 5. If any batch failed to enqueue, count those as failed so the
        // campaign can still reach a terminal status when the worker finishes.
        const failedToQueue = recipients.length - enqueued
        if (failedToQueue > 0) {
            await supabase.rpc('finalize_email_batch', {
                p_campaign_id: campaignId, p_sent: 0, p_failed: failedToQueue,
            })
        }

        console.log(`📬 Queued ${enqueued}/${recipients.length} recipients for campaign ${campaignId}`)

        return new Response(JSON.stringify({
            success: true,
            campaign_id: campaignId,
            queued: enqueued,
            total: recipients.length,
            skipped_recent: skippedRecent,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        })

    } catch (error) {
        console.error('💥 Global Error:', error)
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        })
    }
})
