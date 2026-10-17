/**
 * How an answer is serialised into registration_answers.answer.
 *
 * The column is text. A multi_choice answer lives in it as a JSON array, a
 * checkbox as "true"/"false", everything else as itself. Checkout has carried
 * its own copy of this as a local `answerText`, which was fine while checkout
 * was the only writer. The attendee detail link is a second writer, and a
 * second writer with its own idea of the format is how a shirt size comes back
 * as `["Small"]` on one surface and `Small` on another.
 *
 * No 'use server' — pure, used on both sides.
 */

/** Form state -> the text stored in the column. */
export function answerText(v: unknown): string {
    if (Array.isArray(v)) return JSON.stringify(v)
    if (typeof v === 'boolean') return String(v)
    if (v == null) return ''
    return String(v)
}

/**
 * The text in the column -> form state, for the question type that is about to
 * render it. Only multi_choice wants an array, and only checkbox wants a
 * boolean; everything else is text and must stay text, or a date arrives as
 * `true` and a dropdown loses its selection.
 */
export function parseAnswer(
    stored: string | null | undefined,
    questionType: string,
): string | string[] | boolean {
    const s = stored ?? ''
    if (questionType === 'multi_choice') {
        if (!s.trim()) return []
        try {
            const parsed = JSON.parse(s)
            return Array.isArray(parsed) ? parsed.map(String) : [s]
        } catch {
            // A pre-JSON single answer, or something hand-edited. Treat the
            // literal text as one selected option rather than dropping it.
            return [s]
        }
    }
    if (questionType === 'checkbox') return s === 'true'
    return s
}
