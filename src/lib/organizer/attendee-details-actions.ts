'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Organizer-side view of attendees who are missing their own details.
 *
 * Authorization lives in the RPC, not here: get_event_missing_details checks
 * is_partner_owner() against the event's organizer, which is ghost-seat aware.
 * This calls it with the caller's own session so that check applies to the
 * person actually looking — using the admin client here would hand the payload
 * to anyone who could reach the action.
 *
 * Owner-level on purpose. The rows carry a link that can edit an attendee's
 * medical details, so a door scanner must not be able to load them.
 */

export interface MissingDetailSlot {
    ticket_number: string
    attendee_name: string | null
    /** See ticket_detail_status: own | order | rewritten | shared | none. */
    answer_source: 'own' | 'order' | 'rewritten' | 'shared' | 'none'
    missing_count: number
    complete: boolean
}

export interface MissingDetailBuyer {
    email: string
    name: string | null
    /** purchase_intents.access_token — opens every slot this buyer holds. */
    token: string | null
    /** The intent that token belongs to; the send ledger is keyed on it. */
    intent_id: string | null
    slots_total: number
    slots_missing: number
    /** Slots whose answers are `rewritten` or `shared` — worse than blank,
     *  because they look complete and may describe the wrong person. These
     *  sort to the top of the list. */
    slots_suspect: number
    /** Last time this buyer was sent their link for this event, or null.
     *  Drives the 24h cooldown and the "Sent 2h ago" label. */
    last_emailed_at: string | null
    tickets: MissingDetailSlot[]
}

export interface MissingDetailsReport {
    error?: 'not_found' | 'forbidden' | 'failed'
    event?: { id: string; title: string; start_datetime: string }
    tickets_total?: number
    missing_total?: number
    buyers_total?: number
    /** Missing slots on tickets with no purchase intent — box office, offline,
     *  kiosk — which therefore have no link to send. */
    no_link_total?: number
    /** Buyers matching the current search. `buyers_total` stays whole-event so
     *  the headline count does not move as you type. */
    buyers_matched?: number
    limit?: number
    offset?: number
    search?: string | null
    buyers?: MissingDetailBuyer[]
}

/**
 * No value exports here — a 'use server' module may export async functions and
 * nothing else, and `tsc --noEmit` does not enforce that rule; only `next
 * build` does. A page-size constant living here is what broke the build, so the
 * page size stays where it is actually authoritative: the RPC's own default,
 * echoed back as `limit` in every response.
 */
export async function getEventMissingDetails(
    eventId: string,
    opts: { limit?: number; offset?: number; search?: string | null } = {},
): Promise<MissingDetailsReport> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_event_missing_details', {
        p_event_id: eventId,
        p_limit: opts.limit ?? 25,
        p_offset: opts.offset ?? 0,
        p_search: opts.search?.trim() || null,
    })

    if (error) {
        console.error('get_event_missing_details failed', error)
        return { error: 'failed' }
    }
    return (data ?? { error: 'failed' }) as MissingDetailsReport
}

/** Why a buyer was not emailed. Reported, never swallowed. */
export type SendSkipReason = 'bounced' | 'cooldown' | 'no_link'

export interface SendDetailsResult {
    error?: string
    sent?: number
    failed?: number
    skipped?: { email: string; reason: SendSkipReason }[]
    /** Set when this was a preview — nothing was claimed or sent. */
    dry_run?: boolean
    would_send?: number
    /** The mail went out but the ledger write did not — do NOT resend. */
    warning?: 'ledger_not_updated'
}

/**
 * Email buyers their link.
 *
 * `emails` narrows it to one buyer (the per-row nudge); omitted means every
 * eligible buyer on the event. Either way the RECIPIENT LIST IS NOT SENT FROM
 * HERE — the edge function asks the database who is eligible, as the caller, so
 * a tampered client cannot mail an arbitrary address a working detail-editing
 * link. We pass an event id and nothing else that matters.
 *
 * Invoked with the caller's own session so is_partner_owner applies to the
 * person clicking; the admin client would hand sending rights to anyone who
 * could reach this action.
 */
export async function sendAttendeeDetailEmails(
    eventId: string,
    emails?: string[],
    dryRun = false,
): Promise<SendDetailsResult> {
    const supabase = await createClient()
    const { data, error } = await supabase.functions.invoke('send-attendee-details', {
        body: { event_id: eventId, emails: emails ?? null, dry_run: dryRun },
    })

    if (error) {
        console.error('send-attendee-details failed', error)
        return { error: 'Could not send those emails. Please try again.' }
    }
    return (data ?? { error: 'Could not send those emails.' }) as SendDetailsResult
}
