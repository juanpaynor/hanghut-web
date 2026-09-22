/**
 * Which registration questions a given buyer is actually asked.
 *
 * Three surfaces ask these questions — the event-page register modal, the
 * checkout card, and the experience booking form — and submit_event_request
 * independently decides which REQUIRED questions it will insist on. If any of
 * them disagreed, a buyer would either see a question the server ignores or,
 * worse, be blocked by one they were never shown. So the rule lives here once
 * and the SQL mirrors it.
 *
 * No 'use server' — this is pure logic used on both sides.
 */

export interface VisibilityQuestion {
    id: string
    question_type?: string
    depends_on_question_id?: string | null
    depends_on_values?: string[] | null
    tier_ids?: string[] | null
}

/** Answers keyed by question id. Multi-choice arrives as an array or as JSON text. */
export type AnswerMap = Record<string, string | string[] | undefined | null>

/** A multi_choice answer is a JSON array living in a text column. */
function asValues(v: string | string[] | undefined | null): string[] {
    if (v == null) return []
    if (Array.isArray(v)) return v.map(String)
    const s = String(v)
    if (s.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(s)
            if (Array.isArray(parsed)) return parsed.map(String)
        } catch {
            // Malformed answers are treated as the literal text below.
        }
    }
    return s.trim() ? [s] : []
}

/**
 * Tier scoping. An unscoped question is asked of everyone.
 *
 * `tierId` is null before the buyer has chosen a ticket — the register step.
 * A tier-scoped question is NOT asked then; checkout asks it once the tier is
 * known, which is the whole point of the feature.
 */
export function appliesToTier(q: VisibilityQuestion, tierId: string | null): boolean {
    const scoped = q.tier_ids ?? []
    if (scoped.length === 0) return true
    return !!tierId && scoped.includes(tierId)
}

/** Is this question's controlling answer one of the values that reveal it? */
export function conditionMet(q: VisibilityQuestion, answers: AnswerMap): boolean {
    if (!q.depends_on_question_id) return true
    const given = asValues(answers[q.depends_on_question_id])
    if (given.length === 0) return false
    const triggers = q.depends_on_values ?? []
    // No triggers configured means "any answer at all reveals it".
    if (triggers.length === 0) return true
    return given.some(g => triggers.includes(g))
}

/**
 * The questions to render, in order.
 *
 * Walks in display order so a chain works: a question whose controller is
 * itself hidden stays hidden, rather than appearing because the controller
 * happens to hold a stale answer from before it was hidden.
 */
export function visibleQuestions<T extends VisibilityQuestion>(
    questions: T[],
    answers: AnswerMap,
    tierId: string | null,
): T[] {
    const shown = new Set<string>()
    const out: T[] = []

    for (const q of questions) {
        if (!appliesToTier(q, tierId)) continue
        if (q.depends_on_question_id && !shown.has(q.depends_on_question_id)) continue
        if (!conditionMet(q, answers)) continue
        shown.add(q.id)
        out.push(q)
    }
    return out
}

/**
 * Questions that belong to the CHECKOUT step specifically — the tier-scoped
 * ones. The register step already collected everything else.
 */
export function tierOnlyQuestions<T extends VisibilityQuestion>(
    questions: T[],
    answers: AnswerMap,
    tierId: string | null,
): T[] {
    return visibleQuestions(questions, answers, tierId)
        .filter(q => (q.tier_ids ?? []).length > 0)
}

/** True when a question was never put in front of this buyer. */
export function isHidden(
    q: VisibilityQuestion,
    questions: VisibilityQuestion[],
    answers: AnswerMap,
    tierId: string | null,
): boolean {
    return !visibleQuestions(questions, answers, tierId).some(v => v.id === q.id)
}
