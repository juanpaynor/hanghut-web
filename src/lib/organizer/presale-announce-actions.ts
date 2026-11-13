'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { authorizeEventSettings } from '@/lib/organizer/authorize-event-settings'
import { formatInManila } from '@/lib/datetime'

/**
 * THE PRESALE EMAILS
 *
 * Two scheduled sends per presale, both carried by machinery that already
 * exists: an `email_campaigns` row is claimed by process-scheduled-campaigns,
 * handed to send-promotional-email, chunked onto the queue, and sent by
 * process-email-queue.
 *
 *   T-24h   "Tickets open tomorrow"   — the reminder
 *   T-0     "Tickets are open to you" — the announcement
 *
 * Writing a new sender would lose, in one go: the filter that stops one
 * malformed address 422-ing a batch of 100, the Resend idempotency key, the
 * UNIQUE(campaign_id, recipient) ledger that makes a send exactly-once, the
 * unsubscribe footer, and finalize_email_batch. Each exists because something
 * went wrong once.
 *
 * ── MANAGED BY QUERY, NOT BY REMEMBERED ID ─────────────────────────────────
 *
 * Both rows are found with (event_id, segment='pre_registrants',
 * status='scheduled') and rebuilt from scratch on every change. Storing one id
 * per email meant a column per email and a second place for the truth to rot;
 * this way the schedule is simply whatever is in the table, and adding a third
 * send later costs nothing.
 *
 * ── WHY THE AUDIENCE IS NEVER SNAPSHOTTED ──────────────────────────────────
 *
 * Manual campaigns snapshot recipients when scheduled. These must not: the list
 * grows until the second the presale opens, and a snapshot taken when the date
 * was set would silently drop everyone who joined afterwards — most of them.
 * The row carries segment + event_id only; send-promotional-email resolves
 * `pre_registrants` at SEND time.
 */

const COOLDOWN_MINUTES = 10
const REMINDER_LEAD_HOURS = 24

export interface PresaleEmailCopy { subject: string; html: string }

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ))
}

/** {{first_name}} and {{presale_link}} are filled per person at send time. */
function defaultCopy(kind: 'reminder' | 'announcement', title: string, opens: string): PresaleEmailCopy {
    const t = escapeHtml(title)
    if (kind === 'reminder') {
        return {
            subject: `Tickets for ${title} open tomorrow`,
            html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#17152f;line-height:1.55">
  <p style="font-size:16px">Hi {{first_name}},</p>
  <p style="font-size:16px">A heads up: tickets for <strong>${t}</strong> open to you ${escapeHtml(opens)}.</p>
  <p style="font-size:16px">You pre-registered, so you get first go. Nothing to do until then — we'll email you the moment they're live.</p>
  <p style="margin:24px 0"><a href="{{presale_link}}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">See the event</a></p>
</div>`.trim(),
        }
    }
    return {
        subject: `Tickets for ${title} are open to you now`,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#17152f;line-height:1.55">
  <p style="font-size:16px">Hi {{first_name}},</p>
  <p style="font-size:16px">You pre-registered for <strong>${t}</strong>, so you get first go at tickets. They're open now.</p>
  <p style="margin:28px 0"><a href="{{presale_link}}" style="background:#4f46e5;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Get your tickets</a></p>
  <p style="font-size:14px;color:#666">This link is yours — it's how we know you're on the list, so please don't forward it. Buying with a different email address? Use the one you registered with.</p>
</div>`.trim(),
    }
}

/** The organizer's own wording, if they wrote any. */
function storedCopy(event: Record<string, any>, kind: 'reminder' | 'announcement'): Partial<PresaleEmailCopy> {
    return (event.layout_config?.presale?.[kind] ?? {}) as Partial<PresaleEmailCopy>
}

function resolveCopy(
    event: Record<string, any>, kind: 'reminder' | 'announcement', title: string, opens: string,
): PresaleEmailCopy {
    const base = defaultCopy(kind, title, opens)
    const own = storedCopy(event, kind)
    // Falls back FIELD BY FIELD, so an organizer who rewrote only the subject
    // still gets a working body with the link placeholder in it.
    return { subject: own.subject?.trim() || base.subject, html: own.html?.trim() || base.html }
}

/** What the organizer will actually send, defaults filled in. For the editor. */
export async function getPresaleEmailCopy(eventId: string): Promise<
    { reminder: PresaleEmailCopy; announcement: PresaleEmailCopy; customised: boolean } | { error: string }
> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event

    const { data: ev } = await createAdminClient()
        .from('events').select('title').eq('id', eventId).maybeSingle()
    const title = ev?.title ?? 'the event'
    const opens = event.presale_starts_at
        ? formatInManila(event.presale_starts_at, {
            weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
        })
        : ''

    const stored = event.layout_config?.presale ?? {}
    return {
        reminder: resolveCopy(event, 'reminder', title, opens),
        announcement: resolveCopy(event, 'announcement', title, opens),
        customised: !!(stored.reminder || stored.announcement),
    }
}

/**
 * Save the organizer's wording.
 *
 * ⚠ {{presale_link}} is REQUIRED in the announcement. Without it the email is a
 * dead end: 95% of registrants are guests with no account, so there is nothing
 * else on the page that can recognise them when they arrive, and they would be
 * asked to pre-register for the thing they already pre-registered for.
 */
export async function setPresaleEmailCopy(
    eventId: string,
    kind: 'reminder' | 'announcement',
    copy: PresaleEmailCopy,
): Promise<{ success?: boolean; error?: string }> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }

    const subject = copy.subject?.trim() ?? ''
    const html = copy.html?.trim() ?? ''
    if (!subject) return { error: 'The subject line cannot be empty.' }
    if (!html) return { error: 'The email body cannot be empty.' }
    if (kind === 'announcement' && !html.includes('{{presale_link}}')) {
        return {
            error: 'Keep {{presale_link}} somewhere in the announcement — it becomes each '
                + 'person\'s own link, and without it they have no way to prove they are on the list.',
        }
    }

    const admin = createAdminClient()
    const current = (auth.event.layout_config ?? {}) as Record<string, unknown>
    const presale = (current.presale ?? {}) as Record<string, unknown>

    const { data, error } = await admin
        .from('events')
        .update({ layout_config: { ...current, presale: { ...presale, [kind]: { subject, html } } } })
        .eq('id', eventId)
        .select('id')          // load-bearing: a no-match update returns error === null
        .maybeSingle()
    if (error || !data) {
        console.error('setPresaleEmailCopy failed', error)
        return { error: 'Could not save the email.' }
    }

    // Anything already scheduled still holds the OLD wording — the campaign row
    // carries its own copy of subject and html. Rebuild so the edit actually
    // reaches the send.
    await syncPresaleAnnouncement(eventId)
    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

/** Has an announcement for this event already gone out? */
async function alreadyDispatched(admin: ReturnType<typeof createAdminClient>, eventId: string): Promise<boolean> {
    // process-scheduled-campaigns DELETES the scheduled row on success and
    // send-promotional-email writes a fresh one, so a row in a sending/sent
    // state is the only durable proof it went.
    const { count } = await admin
        .from('email_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('segment', 'pre_registrants')
        .in('status', ['sending', 'sent', 'partial_failure'])
    return (count ?? 0) > 0
}

/**
 * Rebuild the schedule to match the presale dates.
 *
 * Called whenever the dates or the copy change, so the emails follow rather
 * than needing to be remembered. Only ever touches rows still in 'scheduled' —
 * one mid-dispatch is left alone, because the alternative is deleting a row a
 * worker is reading.
 */
export async function syncPresaleAnnouncement(
    eventId: string,
): Promise<{ scheduled?: number; alreadySent?: boolean; error?: string }> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event
    const admin = createAdminClient()

    await admin.from('email_campaigns')
        .delete()
        .eq('event_id', eventId)
        .eq('segment', 'pre_registrants')
        .eq('status', 'scheduled')

    if (!event.presale_starts_at) return { scheduled: 0 }

    const { data: ev } = await admin
        .from('events').select('title, organizer_id').eq('id', eventId).maybeSingle()
    if (!ev?.organizer_id) return { error: 'Event not found' }

    const opensAt = new Date(event.presale_starts_at).getTime()
    const opensCopy = formatInManila(event.presale_starts_at, {
        weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
    })
    const now = Date.now()

    const rows: Record<string, unknown>[] = []
    const build = (kind: 'reminder' | 'announcement', whenMs: number) => {
        // A send whose moment has passed is never scheduled: cron would fire it
        // on the next tick and tell people tickets "open tomorrow" about a
        // yesterday. Skipping is correct; the manual button is the way to catch up.
        if (whenMs <= now) return
        const copy = resolveCopy(event, kind, ev.title ?? 'the event', opensCopy)
        rows.push({
            partner_id: ev.organizer_id,
            subject: copy.subject,
            html_content: copy.html,
            segment: 'pre_registrants',
            event_id: eventId,
            status: 'scheduled',
            scheduled_for: new Date(whenMs).toISOString(),
            scheduled_payload: { sender_name: 'Tickets', segment: 'pre_registrants', event_id: eventId },
            recipient_count: 0,
            updated_at: new Date().toISOString(),
        })
    }
    build('reminder', opensAt - REMINDER_LEAD_HOURS * 3600_000)
    build('announcement', opensAt)

    if (rows.length === 0) {
        return { scheduled: 0, alreadySent: await alreadyDispatched(admin, eventId) }
    }
    const { error } = await admin.from('email_campaigns').insert(rows)
    if (error) {
        console.error('syncPresaleAnnouncement insert failed', error)
        return { error: 'Could not schedule the presale emails.' }
    }
    return { scheduled: rows.length }
}

/**
 * Send the announcement now, by hand.
 *
 * ⚠ THE EXACTLY-ONCE LEDGER DOES NOT PROTECT THIS. email_sends is UNIQUE on
 * (campaign_id, recipient), which makes any ONE campaign exactly-once — but a
 * manual resend creates a NEW campaign with a new id, so that index sees
 * nothing. The cooldown below is the only thing between a double tap and two
 * identical emails to several hundred people.
 */
export async function sendPresaleAnnouncementNow(
    eventId: string,
): Promise<{ success?: boolean; error?: string }> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event

    if (!event.presale_starts_at) {
        return { error: 'This event has no presale, so there is nothing to announce.' }
    }

    const lastSent = event.presale_notified_at ? new Date(event.presale_notified_at).getTime() : 0
    const minsAgo = (Date.now() - lastSent) / 60000
    if (lastSent && minsAgo < COOLDOWN_MINUTES) {
        return {
            error: `The announcement went out ${Math.max(1, Math.round(minsAgo))} minute(s) ago. `
                + `Wait ${Math.ceil(COOLDOWN_MINUTES - minsAgo)} more before sending again, `
                + `so nobody gets it twice.`,
        }
    }

    const admin = createAdminClient()
    const { data: ev } = await admin
        .from('events').select('title, organizer_id').eq('id', eventId).maybeSingle()
    if (!ev?.organizer_id) return { error: 'Event not found' }

    const opensCopy = formatInManila(event.presale_starts_at, {
        weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
    })
    const copy = resolveCopy(event, 'announcement', ev.title ?? 'the event', opensCopy)

    const { data, error } = await admin.functions.invoke('send-promotional-email', {
        body: {
            partner_id: ev.organizer_id,
            subject: copy.subject,
            html_content: copy.html,
            sender_name: 'Tickets',
            segment: 'pre_registrants',
            event_id: eventId,
        },
    })
    if (error || (data as any)?.success === false) {
        console.error('sendPresaleAnnouncementNow failed', error, data)
        return { error: 'Could not send the announcement. Nothing was emailed.' }
    }

    // Stamped only once the send is accepted. Stamping first would start the
    // cooldown on a send that never happened, locking the organizer out of
    // retrying for ten minutes at the worst possible moment.
    await admin.from('events')
        .update({ presale_notified_at: new Date().toISOString() }).eq('id', eventId)

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

/** Preview: send the announcement to one address only. Never touches the list. */
export async function sendPresaleTestEmail(
    eventId: string, to: string,
): Promise<{ success?: boolean; error?: string }> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event

    const address = (to || '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { error: 'That email address does not look right.' }

    const admin = createAdminClient()
    const { data: ev } = await admin
        .from('events').select('title, organizer_id').eq('id', eventId).maybeSingle()
    if (!ev?.organizer_id) return { error: 'Event not found' }

    const opensCopy = event.presale_starts_at
        ? formatInManila(event.presale_starts_at, {
            weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
        })
        : ''
    const copy = resolveCopy(event, 'announcement', ev.title ?? 'the event', opensCopy)

    // test_recipient sends ONE email directly and never creates a campaign row,
    // touches the queue, or moves any stat — so a preview cannot pollute the
    // history or count against the organizer's send figures.
    const { error } = await admin.functions.invoke('send-promotional-email', {
        body: {
            partner_id: ev.organizer_id,
            subject: copy.subject,
            // The real link is minted per recipient at send time; a preview has
            // no recipient, so point it at the event page and say so.
            html_content: copy.html.replaceAll('{{presale_link}}', `https://hanghut.com/events/${eventId}`),
            sender_name: 'Tickets',
            test_recipient: address,
        },
    })
    if (error) {
        console.error('sendPresaleTestEmail failed', error)
        return { error: 'Could not send the test email.' }
    }
    return { success: true }
}
