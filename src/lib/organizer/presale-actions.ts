'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { authorizeEventSettings } from '@/lib/organizer/authorize-event-settings'
import { syncPresaleAnnouncement } from '@/lib/organizer/presale-announce-actions'

/**
 * PRE-REGISTRATION / PRESALE
 *
 * Collect interested people before tickets go on sale, then open buying to that
 * list on a chosen date. Until this, the platform could say when sales CLOSE
 * (events.sales_end_datetime) and had no way at all to say when they OPEN.
 *
 * Three timestamps, no separate on/off switch — a switch plus a date is two
 * things that can disagree, and the date already answers both questions:
 *
 *   presaleStartsAt = null                 feature off. Today's behaviour.
 *   presaleStartsAt set, publicAt null     CLOSED PRESALE: the list only.
 *   presaleStartsAt set, publicAt set      EARLY WINDOW, then open to all.
 *
 * ⚠ NOTHING HERE IS A SECURITY BOUNDARY. The real gate is
 * check_presale_access, called by create-purchase-intent and by
 * /api/v1/checkouts. This file writes the dates the gate reads. If these ever
 * disagree, the gate wins — which is the right way round, and the opposite of
 * subscriber_early_access_hours, a window this platform enforces only in the
 * event page's JSX and therefore not at all.
 */

export interface PresaleWindow {
    presaleStartsAt: string | null
    publicSaleStartsAt: string | null
    registrationClosesAt: string | null
}

/** A bare "is it a real instant" check. Rejecting junk here keeps a typo from
 *  reaching a timestamptz column as something Postgres guesses at. */
function parseInstant(v: string | null): { ok: true; value: string | null } | { ok: false } {
    if (v === null || v === '') return { ok: true, value: null }
    const ms = new Date(v).getTime()
    if (Number.isNaN(ms)) return { ok: false }
    return { ok: true, value: new Date(ms).toISOString() }
}

export async function setPresaleWindow(
    eventId: string,
    window: PresaleWindow,
): Promise<{ success?: boolean; error?: string; warning?: string }> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event

    const presale = parseInstant(window.presaleStartsAt)
    const publicAt = parseInstant(window.publicSaleStartsAt)
    const closesAt = parseInstant(window.registrationClosesAt)
    if (!presale.ok || !publicAt.ok || !closesAt.ok) {
        return { error: 'One of those dates could not be read. Please pick it again.' }
    }

    // Turning the whole thing off: clear every related date together. Leaving a
    // stray public_sale_starts_at behind would mean the next organizer to set a
    // presale silently inherits someone else's public date.
    if (presale.value === null) {
        const off = await writePresale(eventId, {
            presale_starts_at: null,
            public_sale_starts_at: null,
            presale_registration_closes_at: null,
        })
        if (off.error) return off
        // Cancel the scheduled email too, or it fires at the old time telling
        // people to buy on a presale that no longer exists.
        const mail = await syncPresaleAnnouncement(eventId)
        return mail.alreadySent
            ? { success: true, warning: 'Presale turned off, but the announcement email had already gone out.' }
            : { success: true }
    }

    // Mirrors the two CHECK constraints rather than relying on them. A
    // constraint violation surfaces as a Postgres error string, which is not an
    // answer an organizer can act on.
    if (publicAt.value !== null && publicAt.value < presale.value) {
        return { error: 'Public sale cannot start before the presale does.' }
    }
    if (closesAt.value !== null && closesAt.value < presale.value) {
        return { error: 'The list cannot close before the presale opens — nobody would get in.' }
    }

    // ⚠ RESERVED SEATING IS REFUSED UNTIL AFTER 19 DECEMBER 2026.
    //
    // Not a UI limitation — an inventory one. On a seated event every tap on
    // the map takes a real hold (seat-map-picker → /api/seat-map/hold →
    // hold_seat). A buyer who CANNOT buy during a shut presale can still open
    // the map and lock seats for the full hold window, in front of the people
    // who can. On a hot on-sale that is the worst possible failure, and it is
    // worse than having no presale at all.
    //
    // The buyer page already refuses to show them the map while they are
    // blocked, which closes the ordinary route. The hole that remains is a
    // stale tab or a direct call to the hold endpoint, and plugging that means
    // changing hold_seat — which is in the seat path frozen until TRESPASSING
    // SA MUSIC MUSEUM runs on 19 Dec 2026.
    //
    // So: refuse here rather than let an organizer discover it on sale day.
    {
        const { data: seatMap } = await createAdminClient()
            .from('event_seat_maps')
            .select('id')
            .eq('event_id', eventId)
            .maybeSingle()
        if (seatMap) {
            return {
                error: 'Pre-registration is not available for reserved-seating events yet. '
                    + 'Someone who cannot buy could still hold seats during the presale, '
                    + 'which would block the people who can.',
            }
        }
    }

    // A date past the event itself is almost always a wrong month or year, and
    // it silently makes the event unbuyable rather than failing loudly.
    //
    // ⚠ BOTH DATES, NOT JUST THE FIRST. This checked only presale_starts_at,
    // so a public sale date AFTER the event saved cleanly — which is exactly
    // what happened on the first test event: it starts 21 Nov and the public
    // sale was sitting on 25 Nov. Nobody outside the list could ever have
    // bought, and nothing said so. Naming WHICH date is wrong matters too:
    // under the duration UI the public date is derived from the head start, so
    // "check the date" would send the organizer to the wrong control.
    const eventStart = event.start_datetime ? new Date(event.start_datetime).toISOString() : null
    const salesEnd = event.sales_end_datetime ? new Date(event.sales_end_datetime).toISOString() : null

    if (eventStart && presale.value > eventStart) {
        return { error: 'Your list would get tickets after the event has already started. Check the date.' }
    }
    if (salesEnd && presale.value > salesEnd) {
        return { error: 'Your list would get tickets after ticket sales close. Check the date.' }
    }
    if (publicAt.value && eventStart && publicAt.value > eventStart) {
        return {
            error: 'The head start is so long that everyone else would only get tickets '
                + 'after the event has started. Shorten it, or let your list keep the event to themselves.',
        }
    }
    if (publicAt.value && salesEnd && publicAt.value > salesEnd) {
        return {
            error: 'The head start is so long that everyone else would only get tickets '
                + 'after sales have closed. Shorten it.',
        }
    }

    const res = await writePresale(eventId, {
        presale_starts_at: presale.value,
        public_sale_starts_at: publicAt.value,
        presale_registration_closes_at: closesAt.value,
    })
    if (res.error) return res

    // Move the announcement to match. Done HERE rather than left to the
    // organizer to remember: a date change that silently leaves the old email
    // scheduled is the one mistake that cannot be undone once it sends.
    const mail = await syncPresaleAnnouncement(eventId)

    // Warnings, not refusals. Each of these is something an organizer might
    // genuinely mean — a second release on a live event, a presale that has
    // already begun — and refusing outright removes a real use. Say it plainly
    // and let them decide.
    const warnings: string[] = []
    if (event.status === 'active' && presale.value <= new Date().toISOString()
        && (publicAt.value === null || publicAt.value > new Date().toISOString())) {
        warnings.push('This event is live and the presale is already open, so anyone not on the list can no longer buy.')
    }
    if (event.require_approval || event.invite_only) {
        warnings.push('This event also needs your approval. Anyone you have not reviewed by the on-sale time will be told their registration is still pending.')
    }
    if (mail.alreadySent || event.presale_notified_at) {
        warnings.push('The on-sale announcement has already gone out with the old date — send it again if the new one matters.')
    } else if (mail.scheduled === 0) {
        warnings.push('No emails were scheduled because that date has already passed. You can send the announcement by hand.')
    } else if (mail.scheduled === 1) {
        // Two are scheduled normally: a reminder 24h ahead and the announcement.
        // Only one means the presale opens inside the next day, so the reminder
        // moment is already behind us. Worth saying — it is not an error, but an
        // organizer expecting two sends should know why they got one.
        warnings.push('Only the on-sale email was scheduled — the presale opens too soon for a day-before reminder.')
    }

    return warnings.length > 0 ? { success: true, warning: warnings.join(' ') } : { success: true }
}

/**
 * The `.select('id')` is load-bearing, not a formality: a Supabase update that
 * matches nothing returns error === null, so without it this reports success
 * having written nothing — and the organizer watches a date appear in the UI
 * and vanish on the next page load with no explanation.
 */
async function writePresale(
    eventId: string,
    patch: Record<string, string | null>,
): Promise<{ success?: boolean; error?: string }> {
    const { data, error } = await createAdminClient()
        .from('events')
        .update(patch)
        .eq('id', eventId)
        .select('id')
        .maybeSingle()

    if (error) {
        console.error('setPresaleWindow failed', error)
        // The CHECK constraints are the backstop behind the checks above. If one
        // fires, say something human rather than echoing Postgres at them.
        if (error.code === '23514') {
            return { error: 'Those dates are out of order. The presale must open first.' }
        }
        return { error: 'Could not save the presale dates.' }
    }
    if (!data) return { error: 'Could not save the presale dates — nothing was updated.' }

    revalidatePath(`/organizer/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    return { success: true }
}

/**
 * How many people are on the list, and how many of them cannot buy yet.
 *
 * `pending` is only ever non-zero on an event that ALSO requires approval. It
 * is surfaced because an unreviewed pre-registrant is a dead link at the exact
 * moment they try to buy, and the only person who can prevent that is looking
 * at this number.
 */
export async function getPresaleStats(eventId: string): Promise<
    { cleared: number; pending: number } | { error: string }
> {
    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }

    const admin = createAdminClient()
    const [cleared, pending] = await Promise.all([
        admin.from('event_registrations').select('id', { count: 'exact', head: true })
            .eq('event_id', eventId).in('status', ['approved', 'auto_approved']),
        admin.from('event_registrations').select('id', { count: 'exact', head: true })
            .eq('event_id', eventId).eq('status', 'pending'),
    ])

    return { cleared: cleared.count ?? 0, pending: pending.count ?? 0 }
}
