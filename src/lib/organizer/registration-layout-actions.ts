'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getActingPartnerId } from '@/lib/auth/cached'

/**
 * May this caller change this event's settings?
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Every setter in this file used to do `.eq('organizer_id', await
 * getActingPartnerId(user.id))` and give up if no row came back. That reads
 * like an ownership check and is not one: getActingPartnerId returns the
 * partner the caller OWNS, and only falls through to a platform-support seat
 * when they own nothing. A platform admin who also owns a partner of their own
 * therefore resolves to their OWN partner on every event in the system, so the
 * lookup failed on every event belonging to anyone else — silently, because the
 * error read "Event not found or unauthorized" and could just as easily have
 * meant a bad id.
 *
 * It was wrong in the strict direction, too: `events` already carries an
 * "Admins can update all events" RLS policy, so the database would have allowed
 * exactly what the app refused.
 *
 * ── The four ways in ───────────────────────────────────────────────────────
 *
 *   owner / platform-support seat  (getActingPartnerId, as before)
 *   any team member of the owning partner
 *   platform admin (users.is_admin — the COLUMN, never user_metadata, which
 *                   callers can set on themselves)
 *
 * Read with the admin client on purpose: the point is to make the decision
 * HERE, explicitly, rather than let an RLS predicate quietly return no rows and
 * leave the caller unable to tell "not allowed" from "does not exist".
 */
async function authorizeEventSettings(eventId: string): Promise<
    { event: Record<string, any> } | { error: string }
> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = createAdminClient()
    const { data: event } = await admin
        .from('events')
        .select('id, organizer_id, layout_config, require_approval, invite_only, ticket_price')
        .eq('id', eventId)
        .maybeSingle()
    if (!event) return { error: 'Event not found' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (actingPartnerId && event.organizer_id === actingPartnerId) return { event }

    const { data: member } = await admin
        .from('partner_team_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('partner_id', event.organizer_id)
        .maybeSingle()
    if (member) return { event }

    const { data: me } = await admin
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (me?.is_admin === true) return { event }

    return { error: 'You do not have access to this event.' }
}

/**
 * Write a merged layout_config, and REPORT whether a row actually changed.
 *
 * The `.select('id')` is load-bearing and not a formality: a Supabase update
 * that matches nothing returns `error === null`, so without it the action hands
 * back success having written nothing, and the organizer watches a setting flip
 * in the UI and revert on the next page load with no explanation. See the same
 * trap in the event settings save.
 */
async function writeRegistrationConfig(
    eventId: string,
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Promise<{ success?: boolean; error?: string }> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('events')
        .update({
            layout_config: {
                ...current,
                registration: { ...(current.registration as object ?? {}), ...patch },
            },
        })
        .eq('id', eventId)
        .select('id')
        .maybeSingle()

    if (error) {
        console.error('writeRegistrationConfig failed', error)
        return { error: 'Could not save the setting.' }
    }
    if (!data) return { error: 'Could not save the setting — nothing was updated.' }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export type RegistrationFormLayout = 'stepper' | 'single'

/**
 * How the registration questions are presented to attendees.
 *
 * Lives in events.layout_config alongside the tier display settings rather than
 * in its own column — it is presentation, it has a sane default, and adding a
 * column per knob is how a table ends up 60 wide.
 *
 * 'stepper' (the original) walks one question per screen. 'single' puts the
 * whole form on one page, which is what partners with 4+ questions ask for
 * every time.
 */
export async function setRegistrationFormLayout(
    eventId: string,
    layout: RegistrationFormLayout,
): Promise<{ success?: boolean; error?: string }> {
    if (layout !== 'stepper' && layout !== 'single') return { error: 'Unknown layout' }

    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }

    return writeRegistrationConfig(
        eventId,
        (auth.event.layout_config ?? {}) as Record<string, unknown>,
        { layout },
    )
}

/**
 * How long an approved-but-unpaid registration stays on the roster.
 *
 * `events.abandon_unpaid_after_hours` has existed for a while and NOTHING in
 * the app ever set it. One event of 482 had a value -- SINADYA RUN 2026, at 3
 * hours, typed straight into the database by hand -- which is exactly why that
 * roster reads 97% clean while Upper Room Worship's shows 1,157 rows for 831
 * real attendees. A setting nobody can find is a setting nobody has.
 *
 * `expire_stale_registrations()` runs on cron and reads this. It moves the row
 * to 'cancelled', which the roster hides, and it does NOT delete the answers --
 * so a returning registrant can still be sent straight to payment.
 *
 * null turns the release off for this event. The job's own guards still protect
 * free tiers, finished events and anyone mid-checkout, so a value here is never
 * the only thing standing between an attendee and deletion.
 */
export async function setAbandonUnpaidAfterHours(
    eventId: string,
    hours: number | null,
): Promise<{ success?: boolean; error?: string }> {
    // A short window releases someone who filled the form, shut the laptop and
    // meant to pay in the morning. A long one is just the old behaviour. The
    // floor is deliberately 1 rather than 0: 0 would release a buyer who is
    // still on the payment screen.
    if (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 720)) {
        return { error: 'Choose between 1 and 720 hours, or turn it off.' }
    }

    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }

    // `.select()` is load-bearing, not habit. A Supabase update that matches
    // nothing returns error === null and zero rows, so without reading
    // something back this would report success having written nothing -- the
    // bug that made the settings form silently discard Anti Burnout Club's
    // edits.
    const { data, error } = await createAdminClient()
        .from('events')
        .update({ abandon_unpaid_after_hours: hours })
        .eq('id', eventId)
        .select('id')
        .maybeSingle()

    if (error) {
        console.error('setAbandonUnpaidAfterHours failed', error)
        return { error: 'Could not save the setting.' }
    }
    if (!data) return { error: 'Could not save the setting — nothing was updated.' }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export type RegistrationFlowOrder = 'questions_first' | 'ticket_first'

/**
 * Which comes first: the questions, or the ticket?
 *
 * 'questions_first' is the original and stays the default. The attendee presses
 * Register, answers everything, and only then picks a ticket.
 *
 * 'ticket_first' sends them to the ticket selector and lets CHECKOUT ask the
 * questions. That flow is not new — checkout has asked the full, tier-aware
 * question set and collected guest name and email on its own since the Sinadya
 * fix, for anyone arriving without a registration. This setting just stops the
 * event page from getting in front of it.
 *
 * ── Why an organizer would want it ─────────────────────────────────────────
 *
 * A registration row is written the moment the questions are submitted, which
 * on the questions-first flow is before the attendee has seen a price. On Back
 * to the Garden that produced 314 rows with no payment, and 185 of those never
 * reached the payment screen at all. On ticket-first the row is not written
 * until they press Pay, so those 185 rows would not exist to be filtered.
 * SINADYA RUN 2026 asks 22 questions and is still selling.
 *
 * The trade is real and belongs to the organizer: ticket-first captures fewer
 * contact details, and some events genuinely want them even from people who
 * never pay.
 *
 * ── Why this is refused on some events rather than merely discouraged ──────
 *
 * FREE events have no payment to put first, and on the free path it is setting
 * the registration id that arms the auto-claim which mints the ticket — so
 * ticket-first there is a flow with nothing on the far end.
 *
 * APPROVAL and INVITE-ONLY events must clear the person BEFORE they can pay.
 * Ticket-first would let them choose a ticket, answer every question, press Pay
 * and only then be told to wait for approval, or that they were never invited.
 * The gate ignores the flag on these events too, so a value set before an
 * organizer switched approval on cannot strand a buyer.
 */
export async function setRegistrationFlowOrder(
    eventId: string,
    order: RegistrationFlowOrder,
): Promise<{ success?: boolean; error?: string }> {
    if (order !== 'questions_first' && order !== 'ticket_first') {
        return { error: 'Unknown order' }
    }

    const auth = await authorizeEventSettings(eventId)
    if ('error' in auth) return { error: auth.error }
    const event = auth.event

    if (order === 'ticket_first') {
        if (event.require_approval || event.invite_only) {
            return {
                error: 'Events that need approval or an invite have to ask the questions first, '
                    + 'so nobody picks a ticket and is then told to wait.',
            }
        }
        // Cheapest reliable free test: no priced tier AND no event price. The
        // two capacity models never sync, so neither one alone is the answer.
        const admin = createAdminClient()
        const { data: tiers } = await admin
            .from('ticket_tiers')
            .select('price')
            .eq('event_id', eventId)
        const anyPaidTier = (tiers ?? []).some(t => Number(t.price) > 0)
        if (!anyPaidTier && Number(event.ticket_price ?? 0) <= 0) {
            return { error: 'A free event has no payment step to put first.' }
        }
    }

    return writeRegistrationConfig(
        eventId,
        (event.layout_config ?? {}) as Record<string, unknown>,
        { order },
    )
}
