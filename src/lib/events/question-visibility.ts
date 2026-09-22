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

/**
 * A section renders a heading and an image and takes no answer. It is still a
 * row in the list — so it can be ordered, tier-scoped and branched like
 * anything else — but it must never be validated, submitted, or counted.
 */
export function isSectionBlock(q: { question_type?: string }): boolean {
    return q.question_type === 'section'
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
 * Two passes, because a SECTION is not independent: it exists to introduce the
 * questions beneath it. If those questions move — to checkout, because they're
 * tier-scoped, or out of view because a condition isn't met — the section has
 * to move with them. Otherwise the organizer has to hand-scope every heading to
 * match whatever sits under it, which is both tedious and the easiest thing in
 * this whole feature to get silently wrong: a size chart left behind at the
 * register step while the shirt dropdown it explains appears at checkout.
 *
 * So a section's scope is INHERITED from its group (itself through to the next
 * section). An explicit scope on the section can still narrow that, but nothing
 * needs to be set for the common case.
 *
 * The same rule kills empty headings: a section whose whole group is hidden
 * renders nothing rather than a title with a blank space under it.
 */
export function visibleQuestions<T extends VisibilityQuestion>(
    questions: T[],
    answers: AnswerMap,
    tierId: string | null,
): T[] {
    const shown = new Set<string>()
    const keep: boolean[] = []

    // Pass 1 — the answerable questions. Order matters: a question whose
    // controller is itself hidden stays hidden, rather than reappearing because
    // the controller holds a stale answer from before it was hidden.
    for (const q of questions) {
        if (isSectionBlock(q)) { keep.push(false); continue }
        const ok = appliesToTier(q, tierId)
            && (!q.depends_on_question_id || shown.has(q.depends_on_question_id))
            && conditionMet(q, answers)
        if (ok) shown.add(q.id)
        keep.push(ok)
    }

    // Pass 2 — sections follow their group.
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        if (!isSectionBlock(q)) continue
        const allowed = appliesToTier(q, tierId)
            && (!q.depends_on_question_id || shown.has(q.depends_on_question_id))
            && conditionMet(q, answers)
        keep[i] = allowed && groupHasSurvivor(questions, keep, i)
    }

    return questions.filter((_, i) => keep[i])
}

/** Did anything between this section and the next one survive? */
function groupHasSurvivor(
    questions: VisibilityQuestion[],
    keep: boolean[],
    sectionIndex: number,
): boolean {
    for (let j = sectionIndex + 1; j < questions.length; j++) {
        if (isSectionBlock(questions[j])) break
        if (keep[j]) return true
    }
    return false
}

/**
 * Questions that belong to the CHECKOUT step — the tier-scoped ones, plus the
 * section headings that introduce them.
 *
 * The register step already collected everything else. Carrying the heading
 * across is the point: the size chart has to travel with the dropdown it
 * explains, or the buyer is asked for a measurement with no way to look it up.
 */
export function tierOnlyQuestions<T extends VisibilityQuestion>(
    questions: T[],
    answers: AnswerMap,
    tierId: string | null,
): T[] {
    const visible = visibleQuestions(questions, answers, tierId)

    const keep = visible.map(q => !isSectionBlock(q) && (q.tier_ids ?? []).length > 0)
    if (!keep.some(Boolean)) return []

    for (let i = 0; i < visible.length; i++) {
        if (isSectionBlock(visible[i])) keep[i] = groupHasSurvivor(visible, keep, i)
    }

    return visible.filter((_, i) => keep[i])
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
