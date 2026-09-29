/**
 * Shapes for event Terms & Conditions documents.
 *
 * Deliberately a plain module, not part of terms-actions.ts: that file is
 * `'use server'` and may export only async functions. Types alone would erase
 * safely, but keeping the whole vocabulary in one non-server module means the
 * suggested-document presets below can live beside them.
 */

export interface TermsDocument {
    /** Absent until the row is saved — a card added in the editor has no id yet. */
    id?: string
    title: string
    body: string
    /** Required documents must be ticked before checkout proceeds. */
    is_required: boolean
    display_order?: number
}

/** What checkout snapshots onto the purchase intent. Title and body are copied,
 *  not referenced, so editing a document later cannot rewrite the record of
 *  what a buyer actually agreed to. */
export interface AcceptedTermsDocument {
    id?: string
    title: string
    body: string
    is_required: boolean
}

/**
 * One-tap starting points in the editor. These are TITLES ONLY — HangHut does
 * not supply the legal text, because the wording has to be the organizer's own
 * and a plausible-looking default would invite people to ship boilerplate they
 * never read. Drawn from what a running organizer actually asked for.
 */
export const SUGGESTED_TERMS_TITLES: string[] = [
    'Participant Terms & Conditions',
    'Declaration of Fitness & Participant Waiver',
    'Data Privacy Consent',
    'Photo & Media Release',
    'Refund & Transfer Policy',
]

/** Ceiling matches the database CHECK constraint. Generous on purpose: the old
 *  2,000-character cap silently truncated a real race waiver mid-sentence. */
export const TERMS_BODY_MAX = 100000
export const TERMS_TITLE_MAX = 120
