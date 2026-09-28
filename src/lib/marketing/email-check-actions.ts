'use server'

import { createClient } from '@/lib/supabase/server'
import { getActingPartnerId } from '@/lib/auth/cached'

/**
 * List checking for organizers — the pre-send half of the email checker.
 *
 * The buyer-side half stops NEW typos at checkout. This half is for addresses
 * that are already in a list: pasted from a spreadsheet, exported from another
 * platform, or collected before we checked anything. A campaign to a list full
 * of dead addresses does not just waste the send — the bounces land on a shared
 * sending domain and degrade delivery of everyone else's ticket emails.
 *
 * The rules are not reimplemented here. This calls the same SQL the checkout
 * path calls, so one list and one definition of "likely typo" serve both.
 */

export interface EmailCheckRow {
    input: string
    normalized: string
    ok: boolean
    error: string | null
    suggestion: string | null
}

export interface EmailCheckSummary {
    total: number
    /** Distinct, structurally valid, not a suspected typo — safe to send. */
    clean: number
    /** Cannot receive mail at all. Always skipped. */
    invalid: number
    /** Deliverable-looking but probably mistyped. Fixable. */
    typos: number
    /** Exact duplicates after normalisation. */
    duplicates: number
    /** Already on this partner's suppression list — never send to these. */
    suppressed: number
    rows: EmailCheckRow[]
    /** The addresses worth sending to, normalised and de-duplicated. */
    cleanList: string[]
    /** Suggested corrections, ready to apply. */
    corrections: { from: string; to: string }[]
}

/** Guardrail so a pasted novel can't be turned into a query. */
const MAX_ADDRESSES = 20000

export async function checkEmailList(
    emails: string[],
): Promise<{ data?: EmailCheckSummary; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const input = (emails || []).map(e => (e ?? '').trim()).filter(Boolean)
    if (input.length === 0) return { error: 'Paste at least one address.' }
    if (input.length > MAX_ADDRESSES) {
        return { error: `That's ${input.length.toLocaleString()} addresses. Check up to ${MAX_ADDRESSES.toLocaleString()} at a time.` }
    }

    const { data, error } = await supabase.rpc('check_email_addresses', { p_emails: input })
    if (error) {
        console.error('check_email_addresses failed', error)
        return { error: 'Could not check that list. Try again.' }
    }

    const rows = (data || []) as EmailCheckRow[]

    // Suppressed addresses are not a list-quality problem — they are people who
    // asked not to hear from this partner, or whose mail already hard-bounced.
    // Surfacing them here stops an organizer wondering why their "1,000-person
    // list" sent to 940.
    // Resolved here rather than passed in, so ghost-mode owners get their own
    // partner's suppression list like everyone else.
    const partnerId = await getActingPartnerId(user.id)

    let suppressedSet = new Set<string>()
    if (partnerId) {
        const { data: sup } = await supabase
            .from('email_suppressions')
            .select('email')
            .or(`partner_id.eq.${partnerId},partner_id.is.null`)
        suppressedSet = new Set((sup || []).map(s => (s.email as string).toLowerCase()))
    }

    const seen = new Set<string>()
    const cleanList: string[] = []
    const corrections: { from: string; to: string }[] = []
    let duplicates = 0
    let suppressed = 0

    for (const r of rows) {
        const key = r.normalized.toLowerCase()
        if (r.suggestion) corrections.push({ from: r.normalized, to: r.suggestion })
        if (!r.ok) continue
        if (suppressedSet.has(key)) { suppressed++; continue }
        if (seen.has(key)) { duplicates++; continue }
        seen.add(key)
        // A suspected typo is deliberately NOT in the clean list: sending to it
        // is what produced the bounces in the first place.
        if (!r.suggestion) cleanList.push(r.normalized)
    }

    return {
        data: {
            total: rows.length,
            clean: cleanList.length,
            invalid: rows.filter(r => !r.ok).length,
            typos: rows.filter(r => r.ok && r.suggestion).length,
            duplicates,
            suppressed,
            rows,
            cleanList,
            corrections,
        },
    }
}
