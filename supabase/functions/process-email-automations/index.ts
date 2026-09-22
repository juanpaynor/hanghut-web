import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Pinned: the floating `@2` blocked every deploy. See edge-function-deploy-pinning.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

/**
 * ============================================================================
 * EMAIL AUTOMATIONS DISPATCHER
 * ============================================================================
 * One worker, several intake paths:
 *   A) Drains `email_automation_events` (event-driven: welcome, new_event),
 *      enqueued by DB triggers on partner_subscribers / events.
 *   B) Scans time-based event automations (pre_event, post_event) via
 *      get_due_event_automations().
 *   C) Scans abandoned checkouts (abandoned_checkout) via
 *      get_due_abandoned_checkouts().           <-- Phase 2
 *   D) Scans winback candidates (winback) via
 *      get_due_winback_recipients().             <-- Phase 2
 *
 * Each fire is just a programmatically-created campaign: it creates an
 * email_campaigns row and enqueues batches onto `email_send_queue`, so the
 * existing process-email-queue worker does the actual Resend send, unsubscribe
 * footers, idempotency and stats. email_automation_runs (UNIQUE per
 * automation+dedup_key) guarantees once-only firing.
 *
 * Triggered by pg_cron (every 15 min). verify_jwt=true (cron passes service role).
 * ============================================================================
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const EVENT_QUEUE = "email_automation_events"
const SEND_QUEUE = "email_send_queue"
const BATCH_SIZE = 100
const EVENTS_PER_RUN = 20
const VISIBILITY_TIMEOUT = 60
const MAX_RETRIES = 3

type Recipient = { email: string; unsubscribe_token?: string | null; first_name?: string | null }

function firstName(name?: string | null): string | null {
    if (!name) return null
    return name.trim().split(/\s+/)[0] || null
}

function fmtDate(iso?: string | null): string {
    if (!iso) return ""
    try {
        return new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit",
        }).format(new Date(iso))
    } catch { return "" }
}

function esc(v: string): string {
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Event tokens for an automation's email.
 *
 * An automation is authored once and reused across every event, so the event
 * cannot be baked in at write time -- which is why announcements had no poster
 * and no link: the worker only ever supplied the title and the date.
 *
 * {{event_card}} expands to the same table-based block the composer's "Insert
 * event" produces, so an organizer gets the image, price, venue and a Get
 * Tickets button by typing one token. The atomic tokens are there for anyone
 * who wants to lay it out themselves.
 *
 * Cached per invocation: the time-based scan commonly fires several automations
 * against the same event, and this would otherwise refetch it each time.
 */
const eventTokenCache = new Map<string, Record<string, string>>()

async function eventTokens(supabase: any, eventId?: string | null): Promise<Record<string, string>> {
    if (!eventId) return {}
    const hit = eventTokenCache.get(eventId)
    if (hit) return hit

    const { data: ev } = await supabase
        .from("events")
        .select("id, title, cover_image_url, start_datetime, venue_name, city, ticket_price, is_online, ticket_tiers(price, is_active)")
        .eq("id", eventId)
        .maybeSingle()

    if (!ev) return {}

    const url = `https://hanghut.com/events/${ev.id}`
    const image = ev.cover_image_url || ""
    // Online events have no venue at all -- printing "null, null" in an email
    // is worse than printing nothing.
    const venue = ev.is_online
        ? "Online event"
        : [ev.venue_name, ev.city].filter(Boolean).join(", ")

    const activeTiers = ((ev.ticket_tiers as { price: number; is_active: boolean }[] | null) || [])
        .filter((t) => t.is_active)
    const price = activeTiers.length
        ? Math.min(...activeTiers.map((t) => Number(t.price)))
        : Number(ev.ticket_price || 0)
    const priceLabel = price === 0 ? "Free" : `From \u20b1${price.toLocaleString()}`
    const dateStr = fmtDate(ev.start_datetime)

    const cover = image
        ? `<a href="${url}" style="text-decoration:none;"><img src="${esc(image)}" alt="" width="100%" style="display:block;width:100%;height:auto;border:0;" /></a>`
        : ""

    const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:separate;">
<tr><td style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
${cover}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:18px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.05em;">${esc(priceLabel)}</p>
<h2 style="margin:0 0 10px;font-size:20px;line-height:1.25;font-weight:800;color:#111827;">${esc(ev.title || "")}</h2>
${dateStr ? `<p style="margin:0 0 4px;font-size:14px;color:#475569;">\ud83d\udcc5 ${esc(dateStr)}</p>` : ""}
${venue ? `<p style="margin:0 0 16px;font-size:14px;color:#475569;">\ud83d\udccd ${esc(venue)}</p>` : '<div style="height:12px"></div>'}
<a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:11px 26px;border-radius:999px;">Get Tickets \u2192</a>
</td></tr></table>
</td></tr></table>`

    const tokens: Record<string, string> = {
        event_title: ev.title ?? "",
        event_date: dateStr,
        event_url: url,
        event_image: image,
        event_venue: venue,
        event_price: priceLabel,
        event_card: card,
    }
    eventTokenCache.set(eventId, tokens)
    return tokens
}

// Calendar-quarter key matching SQL to_char(now(),'YYYY"Q"Q'), e.g. "2026Q3".
// The winback dedup_key is "<email>:<quarterKey>" so a customer is re-eligible
// for a winback email at most once per quarter.
function quarterKey(d = new Date()): string {
    const q = Math.floor(d.getUTCMonth() / 3) + 1
    return `${d.getUTCFullYear()}Q${q}`
}

serve(async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const summary = { event_driven: 0, time_based: 0, abandoned: 0, winback: 0, skipped: 0 }

    // ── Shared fire core ─────────────────────────────────────────────
    // Claims the run (idempotent), suppression-filters, creates the campaign,
    // and enqueues batches. Returns true if a campaign was created.
    async function fire(opts: {
        automation_id: string
        partner_id: string
        trigger_type: string
        subject: string
        html_content: string
        sender_name: string
        recipients: Recipient[]
        dedup_key: string
        tokens: Record<string, string>
        segment: string
        event_id?: string | null
    }): Promise<boolean> {
        // 1. Claim the run — UNIQUE(automation_id, dedup_key) makes this the
        //    once-only guard across overlapping cron ticks.
        const { data: runRow, error: claimErr } = await supabase
            .from("email_automation_runs")
            .upsert(
                { automation_id: opts.automation_id, partner_id: opts.partner_id, dedup_key: opts.dedup_key },
                { onConflict: "automation_id,dedup_key", ignoreDuplicates: true }
            )
            .select("id")
            .maybeSingle()
        if (claimErr) { console.error("claim error:", claimErr); return false }
        if (!runRow) { summary.skipped++; return false } // already fired

        try {
            // 2. Suppression filter (partner + global)
            let recipients = opts.recipients
            if (recipients.length > 0) {
                const { data: sup } = await supabase
                    .from("email_suppressions")
                    .select("email")
                    .or(`partner_id.eq.${opts.partner_id},partner_id.is.null`)
                if (sup && sup.length) {
                    const set = new Set(sup.map((s) => s.email.toLowerCase()))
                    recipients = recipients.filter((r) => !set.has(r.email.toLowerCase()))
                }
            }

            // 3. Create the campaign row (the worker finalises it)
            const { data: camp, error: campErr } = await supabase
                .from("email_campaigns")
                .insert({
                    partner_id: opts.partner_id,
                    subject: opts.subject,
                    html_content: opts.html_content,
                    recipient_count: recipients.length,
                    status: "sending",
                    segment: opts.segment,
                    event_id: opts.event_id ?? null,
                    automation_id: opts.automation_id,
                    trigger_type: opts.trigger_type,
                })
                .select("id")
                .single()
            if (campErr || !camp) throw new Error(`campaign insert failed: ${campErr?.message}`)

            await supabase.from("email_automation_runs").update({ campaign_id: camp.id }).eq("id", runRow.id)

            if (recipients.length === 0) return true // nothing to send, keep the claim

            // 4. Enqueue batches (tokens ride along for per-recipient resolution)
            for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                const batch = recipients.slice(i, i + BATCH_SIZE)
                await supabase.rpc("pgmq_send", {
                    queue_name: SEND_QUEUE,
                    message: {
                        campaign_id: camp.id,
                        partner_id: opts.partner_id,
                        sender_name: opts.sender_name,
                        batch_index: Math.floor(i / BATCH_SIZE),
                        recipients: batch,
                        tokens: opts.tokens,
                    },
                })
            }
            return true
        } catch (e) {
            // Release the claim so a later tick can retry.
            console.error("fire failed, releasing claim:", e)
            await supabase.from("email_automation_runs").delete().eq("id", runRow.id)
            return false
        }
    }

    // ── A) Event-driven queue (welcome, new_event) ──────────────────────
    const { data: msgs } = await supabase.rpc("pgmq_read", {
        queue_name: EVENT_QUEUE, sleep_seconds: VISIBILITY_TIMEOUT, batch_size: EVENTS_PER_RUN,
    })

    for (const msg of msgs ?? []) {
        const m = msg.message as Record<string, unknown>
        const trigger = m?.trigger as string
        const partnerId = m?.partner_id as string
        try {
            if (msg.read_ct > MAX_RETRIES) {
                await supabase.rpc("pgmq_archive", { queue_name: EVENT_QUEUE, msg_id: msg.msg_id })
                continue
            }

            const { data: auto } = await supabase
                .from("email_automations")
                .select("id, subject, html_content")
                .eq("partner_id", partnerId)
                .eq("trigger_type", trigger === "welcome" ? "welcome" : "new_event")
                .eq("enabled", true)
                .maybeSingle()

            const { data: partner } = await supabase
                .from("partners").select("business_name").eq("id", partnerId).maybeSingle()
            const senderName = partner?.business_name || "HangHut"

            // Automation disabled/deleted or incomplete → drop the message.
            if (!auto || !auto.subject || !auto.html_content) {
                await supabase.rpc("pgmq_delete", { queue_name: EVENT_QUEUE, msg_id: msg.msg_id })
                continue
            }

            if (trigger === "welcome") {
                const email = String(m.email)
                const { data: sub } = await supabase
                    .from("partner_subscribers")
                    .select("unsubscribe_token, full_name")
                    .eq("partner_id", partnerId).eq("email", email).maybeSingle()
                await fire({
                    automation_id: auto.id, partner_id: partnerId, trigger_type: "welcome",
                    subject: auto.subject, html_content: auto.html_content, sender_name: senderName,
                    recipients: [{ email, unsubscribe_token: sub?.unsubscribe_token ?? null, first_name: firstName(sub?.full_name ?? (m.full_name as string)) }],
                    dedup_key: email.toLowerCase(),
                    tokens: { business_name: senderName },
                    segment: "all_subscribers",
                })
                summary.event_driven++
            } else if (trigger === "new_event") {
                const eventId = String(m.event_id)
                const evTokens = await eventTokens(supabase, eventId)
                const { data: subs } = await supabase
                    .from("partner_subscribers")
                    .select("email, unsubscribe_token, full_name")
                    .eq("partner_id", partnerId).eq("is_active", true)
                const recipients: Recipient[] = (subs ?? []).map((s) => ({
                    email: s.email, unsubscribe_token: s.unsubscribe_token, first_name: firstName(s.full_name),
                }))
                await fire({
                    automation_id: auto.id, partner_id: partnerId, trigger_type: "new_event",
                    subject: auto.subject, html_content: auto.html_content, sender_name: senderName,
                    recipients, dedup_key: eventId,
                    tokens: { ...evTokens, business_name: senderName },
                    segment: "all_subscribers", event_id: eventId,
                })
                summary.event_driven++
            }

            await supabase.rpc("pgmq_delete", { queue_name: EVENT_QUEUE, msg_id: msg.msg_id })
        } catch (e) {
            console.error(`automation event msg ${msg.msg_id} failed (will retry):`, e)
        }
    }

    // ── B) Time-based scan (pre_event, post_event) ──────────────────────
    const { data: due } = await supabase.rpc("get_due_event_automations")
    for (const row of due ?? []) {
        try {
            // Attendees = completed purchase intents for the event
            const { data: intents } = await supabase
                .from("purchase_intents")
                .select("guest_email, guest_name")
                .eq("event_id", row.event_id).eq("status", "completed")
            const seen = new Set<string>()
            const recipients: Recipient[] = []
            for (const it of intents ?? []) {
                const email = (it.guest_email || "").toLowerCase()
                if (!email || seen.has(email)) continue
                seen.add(email)
                recipients.push({ email: it.guest_email, unsubscribe_token: null, first_name: firstName(it.guest_name) })
            }
            await fire({
                automation_id: row.automation_id, partner_id: row.partner_id, trigger_type: row.trigger_type,
                subject: row.subject, html_content: row.html_content, sender_name: row.business_name || "HangHut",
                recipients, dedup_key: row.event_id,
                tokens: {
                    ...(await eventTokens(supabase, row.event_id)),
                    // A post-event email should date itself from when the event
                    // ENDED, so this deliberately overrides the card's start date.
                    event_date: fmtDate(row.trigger_type === "post_event" ? row.event_end : row.event_start),
                    business_name: row.business_name || "HangHut",
                },
                segment: "event_attendees", event_id: row.event_id,
            })
            summary.time_based++
        } catch (e) {
            console.error(`time-based automation ${row.automation_id}/${row.event_id} failed:`, e)
        }
    }

    // ── C) Abandoned checkouts (abandoned_checkout) ─────────────────────
    // One recipient per PERSON per event. The RPC now dedups on
    // "<event_id>:<email>" and hands us that key; keyed on the intent id, a
    // buyer who abandoned three carts on one event was due three emails.
    const { data: carts } = await supabase.rpc("get_due_abandoned_checkouts")
    for (const row of carts ?? []) {
        try {
            const sender = row.business_name || "HangHut"
            await fire({
                automation_id: row.automation_id, partner_id: row.partner_id, trigger_type: "abandoned_checkout",
                subject: row.subject, html_content: row.html_content, sender_name: sender,
                recipients: [{ email: row.guest_email, unsubscribe_token: null, first_name: firstName(row.guest_name) }],
                dedup_key: row.dedup_key ?? String(row.intent_id),
                tokens: {
                    ...(await eventTokens(supabase, row.event_id)),
                    event_title: row.event_title ?? "",
                    checkout_url: row.checkout_url ?? "",
                    business_name: sender,
                },
                segment: "abandoned_checkout", event_id: row.event_id,
            })
            summary.abandoned++
        } catch (e) {
            console.error(`abandoned-checkout automation ${row.automation_id}/${row.intent_id} failed:`, e)
        }
    }

    // ── D) Winback (winback) ────────────────────────────────────
    // One recipient per quiet customer; dedup_key = "<email>:<quarter>" so we
    // re-engage at most once per calendar quarter.
    const qk = quarterKey()
    const { data: winb } = await supabase.rpc("get_due_winback_recipients")
    for (const row of winb ?? []) {
        try {
            const sender = row.business_name || "HangHut"
            await fire({
                automation_id: row.automation_id, partner_id: row.partner_id, trigger_type: "winback",
                subject: row.subject, html_content: row.html_content, sender_name: sender,
                recipients: [{ email: row.email, unsubscribe_token: null, first_name: firstName(row.customer_name) }],
                dedup_key: `${row.email}:${qk}`,
                tokens: { business_name: sender },
                segment: "winback",
            })
            summary.winback++
        } catch (e) {
            console.error(`winback automation ${row.automation_id}/${row.email} failed:`, e)
        }
    }

    console.log("automations dispatched:", JSON.stringify(summary))
    return new Response(JSON.stringify({ success: true, ...summary }), {
        status: 200, headers: { "Content-Type": "application/json" },
    })
})
