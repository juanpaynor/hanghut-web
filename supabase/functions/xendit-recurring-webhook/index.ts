import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

/**
 * Xendit `recurring` webhook — HangHut Pro billing only.
 *
 * DELIBERATELY SEPARATE from `xendit-webhook`. Xendit allows one URL per event
 * type and `recurring` is its own type, so this costs nothing and buys real
 * isolation: a bug in partner billing must never affect a ticket buyer's payment
 * being recognised.
 *
 * WRITTEN AGAINST THE PUBLISHED SCHEMA, and the details matter:
 *
 *  - `recurring.plan.activated` DOES NOT mean money moved. Xendit sends a
 *    separate `recurring.cycle.created`, and the charge succeeds via
 *    `recurring.cycle.succeeded`. Treating activation as payment would mark a
 *    partner paid before any money was taken.
 *  - `recurring.cycle.failed` means the retries are EXHAUSTED. The retry signal
 *    is `recurring.cycle.retrying`.
 *  - On a CYCLE event `data.id` is the cycle (`recy_…`); the plan is in
 *    `data.plan_id`. On a PLAN event `data.id` is the plan (`repl_…`).
 *  - Payment ids live in `data.attempt_details[].payment_id`.
 *
 * Payload envelope: { event, business_id, created, api_version, data }.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const BILLING_FROM = 'HangHut Billing <billing@hanghut.com>'
const APP_URL = Deno.env.get('APP_URL') || 'https://hanghut.com'

const peso = (n: number) =>
    '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const longDate = (d: Date) =>
    d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })

/** Billing mail is a courtesy, never a gate. Any failure here is logged and
 *  swallowed: a receipt that fails to send must not 500 the webhook, because
 *  Xendit would then redeliver and we would re-process a charge we already
 *  recorded correctly. */
async function sendBillingEmail(to: string, subject: string, html: string) {
    if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY unset — skipping billing email'); return }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: BILLING_FROM, to: [to], subject, html }),
        })
        if (!res.ok) console.error('billing email failed:', await res.text())
    } catch (e) {
        console.error('billing email threw:', e)
    }
}

/** Inline styles only, and a table-based button: Gmail and Outlook strip <style>
 *  blocks, so anything in a stylesheet simply would not render. */
function shell(heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#18181b;">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;margin:0 0 20px;">HangHut Pro</p>
  <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;font-weight:700;">${heading}</h1>
  ${bodyHtml}
  ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#4f46e5;border-radius:8px;">
    <a href="${cta.url}" style="display:inline-block;padding:12px 24px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">${cta.label}</a>
  </td></tr></table>` : ''}
  <p style="font-size:13px;color:#71717a;margin:28px 0 0;border-top:1px solid #e4e4e7;padding-top:16px;">
    Manage your subscription at <a href="${APP_URL}/organizer/settings/billing" style="color:#4f46e5;">hanghut.com</a>.
  </p>
</div>`
}

/** Who receives billing mail. The account owner's login is the authority — the
 *  partner contact fields are for their customers, not for us. */
async function billingRecipient(admin: any, partnerId: string): Promise<{ email: string; name: string } | null> {
    const { data: partner } = await admin
        .from('partners').select('business_name, user_id, work_email').eq('id', partnerId).maybeSingle()
    if (!partner) return null
    let email: string | null = null
    if (partner.user_id) {
        const { data: u } = await admin.from('users').select('email').eq('id', partner.user_id).maybeSingle()
        email = u?.email ?? null
    }
    email = email || partner.work_email || null
    return email ? { email, name: partner.business_name || 'there' } : null
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-token',
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

/** How far a successful charge buys. Re-anchored from the charge each cycle
 *  rather than stacked, so a late charge never compounds into free months, plus
 *  one day so a cycle landing a few hours late cannot drop a partner. */
function periodEnd(from: Date, interval: string): Date {
    const d = new Date(from)
    if (interval === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + 1)
    else d.setUTCMonth(d.getUTCMonth() + 1)
    d.setUTCDate(d.getUTCDate() + 1)
    return d
}

/** The payment behind a cycle event, why it failed, and the link the partner can
 *  use to settle it themselves. That last one is the point of enabling
 *  `payment_link_for_failed_attempt`: without surfacing it, a failed charge can
 *  only be fixed by replacing the card and waiting for the next retry. */
function readAttempts(data: any): {
    paymentId: string | null; failureCode: string | null; recoveryUrl: string | null
} {
    const attempts = Array.isArray(data?.attempt_details) ? data.attempt_details : []
    if (attempts.length === 0) {
        return { paymentId: null, failureCode: data?.failure_code ?? null, recoveryUrl: null }
    }

    const succeeded = attempts.filter((a: any) => a?.status === 'SUCCEEDED' && a?.payment_id)
    const last = attempts[attempts.length - 1]

    // Newest link wins — earlier ones are superseded.
    let recoveryUrl: string | null = null
    for (const a of attempts) {
        const url = a?.payment_session?.payment_link_url
        if (url) recoveryUrl = url
    }

    return {
        paymentId: succeeded.length > 0
            ? succeeded[succeeded.length - 1].payment_id
            : (last?.payment_id ?? null),
        failureCode: succeeded.length > 0 ? null : (last?.failure_code ?? data?.failure_code ?? null),
        recoveryUrl: succeeded.length > 0 ? null : recoveryUrl,
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        // --- Server-to-server auth. Same shared token as xendit-webhook. ---
        const callbackToken = req.headers.get('x-callback-token')
        const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')
        if (!webhookToken) {
            console.error('CRITICAL: XENDIT_WEBHOOK_TOKEN is not set')
            return new Response('Server Configuration Error', { status: 500 })
        }
        if (callbackToken !== webhookToken) {
            console.error('🚫 recurring webhook auth failed')
            return json({ error: 'Unauthorized' }, 401)
        }

        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const payload = await req.json()
        const event = String(payload?.event || '')
        const data = payload?.data ?? {}
        console.log('recurring webhook:', event, JSON.stringify(data).slice(0, 2000))

        const isPlanEvent = event.startsWith('recurring.plan.')
        const isCycleEvent = event.startsWith('recurring.cycle.')

        // `data.id` means different things per event family. Getting this wrong
        // writes a cycle id into xendit_plan_id and breaks every later lookup.
        const planId: string | null = isPlanEvent ? (data.id ?? null) : (data.plan_id ?? null)
        const referenceId: string | null = data.reference_id ?? null

        let sub: any = null
        if (planId) {
            const { data: byPlan } = await admin.from('partner_subscriptions')
                .select('*').eq('xendit_plan_id', planId).maybeSingle()
            sub = byPlan
        }
        if (!sub && referenceId) {
            // Cycles inherit the plan's reference_id, so this resolves the very
            // first events too — before we have ever seen the plan id.
            const { data: byRef } = await admin.from('partner_subscriptions')
                .select('*').eq('reference_id', referenceId).maybeSingle()
            sub = byRef
            if (sub && planId && !sub.xendit_plan_id) {
                await admin.from('partner_subscriptions')
                    .update({ xendit_plan_id: planId }).eq('id', sub.id)
                sub.xendit_plan_id = planId
            }
        }

        if (!sub) {
            // 200, not 404. An unknown plan is not a retryable failure and Xendit
            // would redeliver it forever.
            console.warn('recurring event for unknown subscription', { planId, referenceId, event })
            return json({ received: true, matched: false })
        }

        const { paymentId, failureCode, recoveryUrl } = readAttempts(data)

        // Idempotency key. Scoped by EVENT as well as payment, because one cycle
        // legitimately produces retrying → succeeded against the same payment.
        const dedupeKey = paymentId
            ? `${event}:${paymentId}`
            : (data.id ? `${event}:${data.id}` : null)

        if (dedupeKey) {
            const { data: seen } = await admin.from('partner_subscription_cycles')
                .select('id').eq('xendit_payment_id', dedupeKey).maybeSingle()
            if (seen) {
                console.log('duplicate recurring event ignored', dedupeKey)
                return json({ received: true, duplicate: true })
            }
        }

        await admin.from('partner_subscription_cycles').insert({
            subscription_id: sub.id,
            cycle_number: data.cycle_number ?? data.recurring_cycle_count ?? null,
            status: data.status ?? event,
            amount: data.amount ?? sub.amount,
            currency: data.currency ?? sub.currency,
            xendit_payment_id: dedupeKey,
            failure_code: failureCode,
            payload,
        })

        const now = new Date()

        switch (event) {
            // ---- PLAN -------------------------------------------------------
            case 'recurring.plan.activated': {
                // The plan is live. NOT a payment — the first charge arrives as
                // its own cycle event. No period, no entitlement, on purpose.
                await admin.from('partner_subscriptions').update({
                    status: 'ACTIVE',
                    xendit_plan_id: planId ?? sub.xendit_plan_id,
                    action_url: null,
                }).eq('id', sub.id)

                const who = await billingRecipient(admin, sub.partner_id)
                if (who) {
                    const every = sub.billing_interval === 'YEAR' ? 'year' : 'month'
                    await sendBillingEmail(who.email, 'Your HangHut Pro subscription is active',
                        shell('You\u2019re on HangHut Pro', `
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${who.name},</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Your subscription is set up. You&rsquo;ll be charged
  <strong>${peso(Number(sub.amount))}</strong> every ${every}, and we&rsquo;ll email a receipt each time.</p>
  <p style="font-size:15px;line-height:1.6;margin:0;">You can change your card or cancel at any time &mdash;
  cancelling keeps your access until the end of the period you&rsquo;ve already paid for.</p>`,
                        { label: 'View billing', url: `${APP_URL}/organizer/settings/billing` }))
                }
                return json({ received: true, handled: 'plan.activated' })
            }

            case 'recurring.plan.inactivated': {
                // Deactivating a plan via the API also emits this event. If we
                // already recorded a deliberate cancellation, keep that — CANCELLED
                // and INACTIVE look identical to Xendit but mean opposite things
                // to us: one is the partner choosing to leave, the other is their
                // card failing.
                await admin.from('partner_subscriptions').update({
                    status: sub.status === 'CANCELLED' ? 'CANCELLED' : 'INACTIVE',
                    last_failure_code: sub.status === 'CANCELLED'
                        ? null : (data.failure_code ?? failureCode),
                }).eq('id', sub.id)
                // Entitlement is NOT rewritten to free. `source` stays 'paid' and
                // the resolver already falls back to free limits once
                // current_period_end passes, so a partner who fixes their card
                // inside the period they paid for never notices, and the record
                // of them having paid is not erased.
                return json({ received: true, handled: 'plan.inactivated' })
            }

            // ---- CYCLE ------------------------------------------------------
            case 'recurring.cycle.created': {
                // Scheduled, not charged. Recorded above for the audit trail only.
                return json({ received: true, handled: 'cycle.created' })
            }

            case 'recurring.cycle.succeeded': {
                const end = periodEnd(now, sub.billing_interval)
                await admin.from('partner_subscriptions').update({
                    status: 'ACTIVE',
                    current_period_start: now.toISOString(),
                    current_period_end: end.toISOString(),
                    last_cycle_at: now.toISOString(),
                    consecutive_failures: 0,
                    last_failure_code: null,
                    action_url: null,
                    recovery_url: null,
                }).eq('id', sub.id)

                // The ONLY place a partner becomes `paid`, and only on confirmed
                // money. plan_code stays 'pro' either way — a granted and a paying
                // partner get identical access; `source` is the sole difference,
                // which is what makes the free grants safe to keep.
                await admin.from('partner_entitlements').upsert({
                    partner_id: sub.partner_id,
                    plan_code: 'pro',
                    source: 'paid',
                    subscription_ref: sub.xendit_plan_id ?? planId ?? sub.reference_id,
                    current_period_end: end.toISOString(),
                    updated_at: now.toISOString(),
                }, { onConflict: 'partner_id' })

                const paid = await billingRecipient(admin, sub.partner_id)
                if (paid) {
                    const amount = Number(data.amount ?? sub.amount)
                    const every = sub.billing_interval === 'YEAR' ? 'Yearly' : 'Monthly'
                    await sendBillingEmail(paid.email, `Receipt \u2014 HangHut Pro ${peso(amount)}`,
                        shell('Payment received', `
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">Thanks, ${paid.name}. Here&rsquo;s your receipt.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;margin:0 0 8px;">
    <tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;color:#71717a;">Plan</td>
        <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;text-align:right;font-weight:600;">HangHut Pro &middot; ${every}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;color:#71717a;">Amount</td>
        <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;text-align:right;font-weight:600;">${peso(amount)}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;color:#71717a;">Date</td>
        <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;text-align:right;">${longDate(now)}</td></tr>
    <tr><td style="padding:10px 0;color:#71717a;">Next charge</td>
        <td style="padding:10px 0;text-align:right;">${longDate(end)}</td></tr>
  </table>
  <p style="font-size:13px;color:#71717a;margin:16px 0 0;">Reference: ${sub.reference_id}</p>`,
                        { label: 'View billing', url: `${APP_URL}/organizer/settings/billing` }))
                }
                return json({ received: true, handled: 'cycle.succeeded' })
            }

            case 'recurring.cycle.retrying':
            case 'recurring.cycle.force_attempt_failed': {
                // A retry is scheduled. Access is untouched: current_period_end
                // still covers the period already paid for, and cutting someone
                // off on a first decline would punish an expired card mid-month.
                await admin.from('partner_subscriptions').update({
                    consecutive_failures: (sub.consecutive_failures ?? 0) + 1,
                    last_failure_code: failureCode ?? 'UNKNOWN',
                    recovery_url: recoveryUrl ?? sub.recovery_url,
                }).eq('id', sub.id)

                // Only on the FIRST failure. Xendit retries three times and also
                // sends its own notifications; mailing on every attempt would
                // read as dunning harassment over one expired card.
                if ((sub.consecutive_failures ?? 0) === 0) {
                    const who = await billingRecipient(admin, sub.partner_id)
                    if (who) {
                        const until = sub.current_period_end ? new Date(sub.current_period_end) : null
                        await sendBillingEmail(who.email, 'We couldn\u2019t charge your card',
                            shell('Your payment didn\u2019t go through', `
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${who.name}, we couldn&rsquo;t take
  ${peso(Number(sub.amount))} for HangHut Pro. We&rsquo;ll try again over the next few days.</p>
  ${until ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Nothing changes in the meantime &mdash;
  your access continues until <strong>${longDate(until)}</strong>.</p>` : ''}
  <p style="font-size:15px;line-height:1.6;margin:0;">To fix it now, pay this cycle or update your card.</p>`,
                            recoveryUrl
                                ? { label: 'Pay now', url: recoveryUrl }
                                : { label: 'Update card', url: `${APP_URL}/organizer/settings/billing` }))
                    }
                }
                return json({ received: true, handled: event })
            }

            case 'recurring.cycle.failed': {
                // Retries EXHAUSTED for this cycle. With failed_cycle_action
                // RESUME the plan lives on and will try again next cycle, so the
                // subscription is not closed here — only `plan.inactivated` does
                // that. Access still runs to current_period_end and then lapses
                // on its own.
                await admin.from('partner_subscriptions').update({
                    consecutive_failures: (sub.consecutive_failures ?? 0) + 1,
                    last_failure_code: failureCode ?? 'CYCLE_FAILED',
                    recovery_url: recoveryUrl ?? sub.recovery_url,
                }).eq('id', sub.id)
                return json({ received: true, handled: 'cycle.failed' })
            }

            default:
                return json({ received: true, ignored: event })
        }

    } catch (error) {
        console.error('xendit-recurring-webhook error:', error)
        // 500 so Xendit retries — a transient DB error must not lose a charge.
        return json({ error: (error as Error).message }, 500)
    }
})
