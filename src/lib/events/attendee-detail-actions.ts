'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { answerText } from './answer-format'

/**
 * Server actions behind the attendee detail link (/d/<token>).
 *
 * Deliberately sessionless. The people filling this in are guests — usually the
 * buyer of a group order, sometimes an attendee the buyer forwarded a slot to.
 * Authorization is the token, resolved inside the SECURITY DEFINER RPCs, and
 * the anon key grants nothing beyond calling them.
 *
 * The token never reaches the browser's Supabase client: it arrives in the URL,
 * is read server-side, and is passed from here. So the only thing a page script
 * can do is ask this action to act on the token it was already given.
 *
 * An order token resolves to every ticket its buyer holds on that event, not
 * just the order it was issued for -- people buying for a group often do it in
 * several separate orders, and on Sinadya Run every affected buyer did.
 */

/** Cookieless anon client. No session to read, so nothing forces dynamic rendering. */
function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUBLINK_RE = /^[0-9a-f]{64}$/i

/**
 * Which kind of token is in the URL.
 *
 * One route serves both, so the shape decides: an order token is the
 * purchase_intents.access_token UUID the buyer already has from their ticket
 * email, a sublink is 64 hex characters. Anything else is not a token and the
 * page 404s without a round trip.
 */
export function classifyToken(token: string): 'order' | 'sublink' | null {
    if (UUID_RE.test(token)) return 'order'
    if (SUBLINK_RE.test(token)) return 'sublink'
    return null
}

export interface DetailQuestion {
    id: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox'
        | 'social_profile' | 'url' | 'company' | 'file' | 'date' | 'dropdown' | 'section'
    options: string[] | null
    is_required: boolean
    display_order: number
    help_text: string | null
    help_image_url: string | null
    depends_on_question_id: string | null
    depends_on_values: string[] | null
    tier_ids: string[] | null
    option_images: Record<string, string> | null
}

/** Why a slot has no answers of its own. The page says something different for each. */
export type AnswerSource = 'own' | 'order' | 'rewritten' | 'shared' | 'none'

export interface DetailSlot {
    id: string
    ticket_number: string
    attendee_name: string | null
    tier: string | null
    tier_id: string | null
    ordered_at: string
    status: {
        answer_source: AnswerSource
        answers: { question_id: string; answer: string | null }[]
        required_count: number
        missing_count: number
        complete: boolean
        /** The attendee filled this in through their own forwarded link. */
        self_filled: boolean
        /**
         * The buyer may see that this slot is done but not read or change it.
         * `answers` arrives empty for these — the server strips it, so the
         * values are never in this browser at all.
         */
        readonly: boolean
    }
}

export interface DetailBundle {
    found: boolean
    /** 'buyer' = every ticket this buyer holds on this event; 'ticket' = one slot. */
    scope?: 'buyer' | 'ticket'
    closed?: boolean
    event?: {
        id: string
        title: string
        start_datetime: string
        venue_name: string | null
        cover_image_url: string | null
    }
    organizer?: { name: string | null; logo_url: string | null }
    questions?: DetailQuestion[]
    tickets?: DetailSlot[]
}

export async function getAttendeeDetails(token: string): Promise<DetailBundle> {
    const kind = classifyToken(token)
    if (!kind) return { found: false }

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_attendee_details', {
        p_order_token: kind === 'order' ? token : null,
        p_sublink_token: kind === 'sublink' ? token : null,
    })

    if (error) {
        console.error('get_attendee_details failed', error)
        return { found: false }
    }
    return (data ?? { found: false }) as DetailBundle
}

export interface SaveResult {
    ok: boolean
    error?: string
    complete?: boolean
}

/**
 * Save one attendee's answers.
 *
 * `answers` arrives as form state keyed by question id; it is serialised here
 * through the shared formatter so what this writes is byte-identical to what
 * checkout writes. Only the questions the caller names are sent — the RPC
 * upserts per (registration, question, ticket), so an untouched question keeps
 * whatever it had instead of being blanked.
 */
export async function saveAttendeeDetails(
    token: string,
    ticketId: string,
    answers: Record<string, unknown>,
    attendeeName?: string | null,
): Promise<SaveResult> {
    const kind = classifyToken(token)
    if (!kind) return { ok: false, error: 'That link is not valid.' }

    const payload = Object.entries(answers).map(([question_id, value]) => ({
        question_id,
        answer: answerText(value),
    }))

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('save_attendee_details', {
        p_ticket_id: ticketId,
        p_answers: payload,
        p_order_token: kind === 'order' ? token : null,
        p_sublink_token: kind === 'sublink' ? token : null,
        p_attendee_name: attendeeName ?? null,
    })

    if (error) {
        // The RPC's own codes, turned into something an attendee can act on.
        // Anything unrecognised stays generic: the raw message can name
        // question UUIDs, which help nobody reading this page.
        const code = (error as { code?: string }).code
        if (code === 'P0005') return { ok: false, error: 'Please answer all the required questions.' }
        if (code === 'P0002') return { ok: false, error: 'This event has already taken place.' }
        if (code === 'P0001') return { ok: false, error: 'This link does not cover that ticket.' }
        if (code === 'P0003') return { ok: false, error: 'Those answers do not match this event.' }
        if (code === 'P0006') {
            return {
                ok: false,
                error: 'This attendee filled in their own details, so only they can change them. Send them their link again if something needs correcting.',
            }
        }
        console.error('save_attendee_details failed', error)
        return { ok: false, error: 'Could not save those details. Please try again.' }
    }

    return { ok: true, complete: !!(data as { complete?: boolean } | null)?.complete }
}

/**
 * A forwardable link for one attendee.
 *
 * The point is that the buyer can hand a slot to the person it belongs to
 * without handing over the whole order. Only the order token mints, and the RPC
 * reuses a live sublink, so clicking "copy link" repeatedly yields one URL.
 */
export async function mintAttendeeSublink(
    orderToken: string,
    ticketId: string,
): Promise<{ token?: string; error?: string }> {
    if (classifyToken(orderToken) !== 'order') {
        return { error: 'Only the order link can create a link for one attendee.' }
    }

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('mint_attendee_sublink', {
        p_ticket_id: ticketId,
        p_order_token: orderToken,
    })

    if (error) {
        console.error('mint_attendee_sublink failed', error)
        return { error: 'Could not create that link.' }
    }
    return { token: data as string }
}
