/**
 * Remembering a registration between visits, so a returning registrant is not
 * made to type the same form twice.
 *
 * ── Why this is a module and not three inline reads ─────────────────────────
 *
 * Three surfaces need the same answer — the event page's gate, the register
 * modal and checkout — and they already disagreed once: the gate wrote the
 * registration id to sessionStorage, checkout read it back, and the server-side
 * rescue that was supposed to cover a new session was gated to logged-in users
 * on approval-only events. That is 4.6% of registrants on 7 of 482 events, so
 * in practice nobody was covered and the form was simply asked again. Keeping
 * the key, the fallback order and the "what is still missing" rule in one file
 * is what stops that drifting apart again.
 *
 * ── Why localStorage ────────────────────────────────────────────────────────
 *
 * sessionStorage is wiped when the tab closes. The measured gap between a
 * registrant's first and second attempt averages 173 hours, so sessionStorage
 * was almost never still holding anything by the time it mattered.
 *
 * Every access is wrapped: in a private window, with site data blocked, or
 * inside an embedded widget, the accessor itself can throw rather than return
 * null. A caller that cannot read storage must simply see the form, which is
 * exactly today's behaviour.
 *
 * ── What is NOT stored here ─────────────────────────────────────────────────
 *
 * Only the registration id — an unguessable uuid. Not the answers, and not the
 * email as a lookup key. The server function this pairs with
 * (get_registration_for_resume) refuses to take an email for the same reason:
 * an email-keyed read would let anyone type a stranger's address and get back
 * their phone number and emergency contact.
 *
 * The consequence is worth stating plainly rather than discovering later: this
 * works on the SAME BROWSER only. A new device gets the form again.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    isSectionBlock,
    visibleQuestions,
    type AnswerMap,
    type VisibilityQuestion,
} from './question-visibility'

/** Shape returned by get_registration_for_resume. */
export interface ResumedRegistration {
    registration_id: string
    event_id: string
    status: string
    tier_id: string | null
    guest_name: string | null
    guest_email: string | null
    is_guest: boolean
    /** Already produced an order. Still worth prefilling — they may be buying a
     *  second ticket — but the caller must let the server open a NEW row rather
     *  than reuse this one. */
    consummated: boolean
    answers: { question_id: string; answer: string | null }[]
}

const KEY = (eventId: string) => `approved_reg_${eventId}`

/** Remember this registration for next time. Never throws. */
export function rememberRegistration(eventId: string, registrationId: string): void {
    if (typeof window === 'undefined' || !registrationId) return
    try {
        window.localStorage.setItem(KEY(eventId), registrationId)
    } catch {
        // Storage blocked. Nothing to do: the form is simply shown next time.
    }
    try {
        // Kept in step for the duration of this tab. Older builds of checkout
        // read sessionStorage only, and a buyer can be mid-flow across a
        // deploy — writing both means that buyer is not sent back to the form.
        window.sessionStorage.setItem(KEY(eventId), registrationId)
    } catch {
        /* same */
    }
}

/**
 * The remembered id, if any. localStorage first, then sessionStorage — the
 * other way round would let a stale tab-scoped value from an abandoned attempt
 * shadow the durable one.
 */
export function rememberedRegistrationId(eventId: string): string | null {
    if (typeof window === 'undefined') return null
    for (const store of ['localStorage', 'sessionStorage'] as const) {
        try {
            const v = (window[store] as Storage).getItem(KEY(eventId))
            if (v) return v
        } catch {
            // Keep trying the other store rather than giving up on both.
        }
    }
    return null
}

/**
 * ── THE PRESALE ACCESS TOKEN ────────────────────────────────────────────────
 *
 * Arrives once, as ?pt= on the link in the on-sale email, and is needed again
 * several screens later when the buyer presses Pay. Nothing carries a query
 * param that far, so it is stashed the moment the event page sees it.
 *
 * It lives here rather than in the gate or in checkout because this module is
 * already the single owner of this feature's storage — the gate, the modal and
 * checkout each grew their own copy once, and they drifted.
 *
 * ⚠ It is NOT the registration id and must never be confused with one. The
 * registration id unlocks get_registration_for_resume, which returns the
 * person's name, email and every answer. This token unlocks the purchase gate
 * and returns nothing.
 *
 * Email match covers most people without it — is_on_presale_list matches the
 * address they pre-registered with. The token is what saves the buyer who
 * checks out under a different address from the one on the list.
 */
const PT_KEY = (eventId: string) => `presale_token_${eventId}`

export function rememberPresaleToken(eventId: string, token: string): void {
    if (typeof window === 'undefined' || !token) return
    try {
        window.localStorage.setItem(PT_KEY(eventId), token)
    } catch {
        // Storage blocked. The email match still gets most buyers in.
    }
}

export function rememberedPresaleToken(eventId: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage.getItem(PT_KEY(eventId))
    } catch {
        return null
    }
}

/** Drop it — the server said this id is no longer resumable. */
export function forgetRegistration(eventId: string): void {
    if (typeof window === 'undefined') return
    for (const store of ['localStorage', 'sessionStorage'] as const) {
        try {
            (window[store] as Storage).removeItem(KEY(eventId))
        } catch {
            /* nothing to clear */
        }
    }
}

/**
 * Ask the server what this registration already holds.
 *
 * Returns null for every refusal — unknown id, wrong event, rejected, pending,
 * event no longer selling — and clears the remembered id when it does, so a
 * dead uuid is not re-sent on every page view.
 */
export async function fetchResumableRegistration(
    supabase: SupabaseClient,
    eventId: string,
    registrationId: string,
): Promise<ResumedRegistration | null> {
    const { data, error } = await supabase.rpc('get_registration_for_resume', {
        p_registration_id: registrationId,
        p_event_id: eventId,
    })
    if (error) {
        // A network blip is not proof the id is dead, so this does NOT forget it.
        console.warn('resume lookup failed', error.message)
        return null
    }
    if (!data) {
        forgetRegistration(eventId)
        return null
    }
    return data as ResumedRegistration
}

/** Previous answers in the shape the question components hold form state in. */
export function answersToFormState(resumed: ResumedRegistration): AnswerMap {
    const out: AnswerMap = {}
    for (const a of resumed.answers ?? []) {
        if (!a?.question_id) continue
        const raw = a.answer ?? ''
        // multi_choice is stored as a JSON array in a text column, and the form
        // holds it as a real array. Anything else is kept as the text it is —
        // asValues in question-visibility already copes with both.
        if (typeof raw === 'string' && raw.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(raw)
                out[a.question_id] = Array.isArray(parsed) ? parsed.map(String) : raw
                continue
            } catch {
                /* malformed: keep the literal text */
            }
        }
        out[a.question_id] = raw
    }
    return out
}

/**
 * The questions this buyer still has to answer, given what they answered last
 * time.
 *
 * This is the whole reason resuming cannot simply skip the form outright. An
 * organizer who adds a question next week would otherwise never get an answer
 * from anyone who registered before it existed — the buyer sails past it and
 * the organizer sees a blank column and assumes the feature is broken.
 *
 * A section block takes no answer and must not count as missing, or an event
 * with a heading in its form could never be resumed at all.
 */
export function stillMissingQuestions<T extends VisibilityQuestion>(
    questions: T[],
    prefilled: AnswerMap,
    tierId: string | null,
): T[] {
    return visibleQuestions(questions, prefilled, tierId).filter(q => {
        if (isSectionBlock(q)) return false
        const v = prefilled[q.id]
        if (v == null) return true
        if (Array.isArray(v)) return v.length === 0
        if (typeof v === 'boolean') return false
        return String(v).trim() === ''
    })
}
