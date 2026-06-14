import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ============================================================================
 * SEND PROMOTIONAL EMAIL — Phase 3 (enqueuer)
 * ============================================================================
 * Resolves + suppression-filters the audience, creates the campaign row, then
 * chunks recipients into batches and drops them onto `email_send_queue`. The
 * process-email-queue worker (pg_cron, every 10s) does the actual Resend sends,
 * unsubscribe footers, idempotency, ledger recording and campaign finalisation.
 *
 * This returns in ~hundreds of ms regardless of list size — no more wall-clock
 * risk on large blasts, and failed batches are retried by the worker.
 * ============================================================================
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const QUEUE_NAME = 'email_send_queue'
const BATCH_SIZE = 100 // Resend batch limit; also our queue message size

interface RequestData {
    partner_id: string
    subject: string
    html_content: string
    sender_name: string
    test_mode?: boolean
    target_emails?: string[]
    segment?: 'all_subscribers' | 'event_attendees' | 'event_subscribers'
    event_id?: string
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { partner_id, subject, html_content, sender_name, test_mode, target_emails, segment, event_id } = await req.json() as RequestData

        if (!partner_id || !subject || !html_content || !sender_name) {
            throw new Error("Missing required fields")
        }

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 1. Resolve recipients
        let recipients: { email: string, unsubscribe_token?: string | null }[] = []

        if (test_mode) {
            // Safe sandbox recipient — exercises the full queue → worker → Resend
            // path without emailing a real person.
            console.log('🧪 Test Mode: queuing to delivered@resend.dev')
            recipients = [{ email: 'delivered@resend.dev', unsubscribe_token: null }]
        } else if (segment === 'event_subscribers' && event_id) {
            console.log(`📋 Event Subscribers mode: event ${event_id}`)
            const { data: subs, error } = await supabase
                .from('partner_subscribers')
                .select('email, unsubscribe_token')
                .eq('partner_id', partner_id)
                .eq('event_id', event_id)
                .eq('is_active', true)
            if (error) throw error
            recipients = subs ?? []
        } else if (target_emails && target_emails.length > 0) {
            console.log(`🎯 Targeted send: ${target_emails.length} attendee emails`)
            recipients = target_emails.map(email => ({ email, unsubscribe_token: null }))
        } else {
            console.log(`🔍 All subscribers for partner: ${partner_id}`)
            const { data: subs, error } = await supabase
                .from('partner_subscribers')
                .select('email, unsubscribe_token')
                .eq('partner_id', partner_id)
                .eq('is_active', true)
            if (error) throw error
            recipients = subs ?? []
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

        if (recipients.length === 0) {
            return new Response(JSON.stringify({ success: true, message: "No recipients found", queued: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            })
        }

        // 3. Create the campaign row (status 'sending'); the worker finalises it.
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
        const campaignId = campaignRow.id

        // 4. Chunk + enqueue. Each message is one batch the worker will send.
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
