import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Pinned: the floating `@2` blocked every deploy. See edge-function-deploy-pinning.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

/**
 * ============================================================================
 * PROCESS SCHEDULED CAMPAIGNS — dispatcher (pg_cron, every minute)
 * ============================================================================
 * Finds email_campaigns rows with status='scheduled' whose scheduled_for has
 * arrived, atomically claims each (-> 'dispatching' so it can't double-fire),
 * then hands the stored body to the EXISTING send-promotional-email function —
 * which creates the real campaign row and enqueues batches as usual.
 *
 * This function is fully additive: it never modifies send-promotional-email or
 * the email queue pipeline. On success the scheduling row is removed (the sent
 * campaign is recorded by send-promotional-email); on failure it is marked
 * 'scheduled_failed' so the organizer can see it and retry.
 * ============================================================================
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PER_RUN = 25

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const nowIso = new Date().toISOString()

    // 1. Find due scheduled campaigns
    const { data: due, error: dueErr } = await supabase
        .from('email_campaigns')
        .select('id, partner_id, subject, html_content, segment, event_id, scheduled_payload')
        .eq('status', 'scheduled')
        .lte('scheduled_for', nowIso)
        .order('scheduled_for', { ascending: true })
        .limit(MAX_PER_RUN)

    if (dueErr) {
        console.error('Failed to load due campaigns:', dueErr)
        return new Response(JSON.stringify({ success: false, error: dueErr.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        })
    }

    let dispatched = 0
    let failed = 0

    for (const row of due ?? []) {
        // 2. Atomically claim — guards against overlapping cron runs.
        const { data: claimed, error: claimErr } = await supabase
            .from('email_campaigns')
            .update({ status: 'dispatching', updated_at: nowIso })
            .eq('id', row.id)
            .eq('status', 'scheduled')
            .select('id')
            .maybeSingle()

        if (claimErr || !claimed) continue // already taken by another run

        const payload = (row.scheduled_payload ?? {}) as Record<string, unknown>

        const body: Record<string, unknown> = {
            partner_id: row.partner_id,
            subject: row.subject,
            html_content: row.html_content,
            sender_name: payload.sender_name ?? 'Updates',
            segment: row.segment ?? payload.segment ?? 'all_subscribers',
            event_id: row.event_id ?? payload.event_id ?? null,
        }
        // Prefer named recipients (personalize {{first_name}}); fall back to bare
        // emails for any scheduled rows snapshotted before that field existed.
        if (Array.isArray(payload.target_recipients) && payload.target_recipients.length > 0) {
            body.target_recipients = payload.target_recipients
        } else if (Array.isArray(payload.target_emails) && payload.target_emails.length > 0) {
            body.target_emails = payload.target_emails
        }
        // "Skip anyone emailed in the last N days" — evaluated at SEND time by
        // send-promotional-email, so a send scheduled a week out still respects
        // whatever went out in between.
        if (typeof payload.exclude_recent_days === 'number' && payload.exclude_recent_days > 0) {
            body.exclude_recent_days = payload.exclude_recent_days
        }

        try {
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-promotional-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify(body),
            })
            const json = await resp.json().catch(() => ({}))

            if (resp.ok && json?.success !== false) {
                // Sent record now lives in the row send-promotional-email created.
                await supabase.from('email_campaigns').delete().eq('id', row.id)
                dispatched++
            } else {
                console.error(`Dispatch failed for ${row.id}:`, json)
                await supabase.from('email_campaigns')
                    .update({ status: 'scheduled_failed', updated_at: new Date().toISOString() })
                    .eq('id', row.id)
                failed++
            }
        } catch (e) {
            console.error(`Dispatch error for ${row.id}:`, e)
            await supabase.from('email_campaigns')
                .update({ status: 'scheduled_failed', updated_at: new Date().toISOString() })
                .eq('id', row.id)
            failed++
        }
    }

    return new Response(JSON.stringify({ success: true, dispatched, failed, checked: due?.length ?? 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
})
