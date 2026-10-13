import type { CanvasData } from '@/components/seat-map/types'

/**
 * Catch a typo'd section label before it reaches a buyer.
 *
 * WHY NOT "DUPLICATE LABELS ARE BAD"
 * Exact duplicates are normal and correct. Hex Fest has four sections all
 * labelled "VIP Cocktail" — one price category drawn as four tables. Warning on
 * those would be noise the organizer learns to dismiss, which costs us the one
 * warning that matters.
 *
 * The typo signature is NEAR but NOT EQUAL, inside ONE tier:
 *   "Regular Cockail Table"  vs  "Regular Cocktail Table"
 *
 * Grouping by tier is what makes this precise rather than annoying. Across
 * tiers, "VIP Couch" and "VVIP Couch" are one edit apart and both deliberate —
 * they are different price categories at P18,000 and P25,000. Compared within a
 * tier, that pair never meets.
 */

/** Levenshtein distance, with early exit once the budget is blown. */
function editDistance(a: string, b: string, max: number): number {
    if (a === b) return 0
    if (Math.abs(a.length - b.length) > max) return max + 1

    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        const curr = [i]
        let rowMin = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
            curr.push(v)
            if (v < rowMin) rowMin = v
        }
        if (rowMin > max) return max + 1
        prev = curr
    }
    return prev[b.length]
}

const MIN_LENGTH = 6   // "A1" vs "A2" is one edit apart and entirely deliberate
const MAX_EDITS = 2
const MAX_RATIO = 0.25 // one or two edits must be small RELATIVE to the label

/**
 * Returns human-readable warnings, one per near-duplicate pair found within a
 * single tier. Empty array when there is nothing to say.
 */
export function nearDuplicateSectionLabels(canvas: CanvasData): string[] {
    const byTier = new Map<string, string[]>()

    for (const sec of canvas.sections ?? []) {
        if (sec.isActive === false) continue
        // A section with no tier is scenery (stage, bar, entrance). It carries no
        // price and no buyer ever reads its name as a product.
        if (!sec.tierId) continue
        const label = (sec.label ?? '').trim()
        if (label.length < MIN_LENGTH) continue
        const list = byTier.get(sec.tierId) ?? []
        list.push(label)
        byTier.set(sec.tierId, list)
    }

    const out: string[] = []
    const seenPair = new Set<string>()

    for (const labels of byTier.values()) {
        const distinct = Array.from(new Set(labels))
        for (let i = 0; i < distinct.length; i++) {
            for (let j = i + 1; j < distinct.length; j++) {
                const a = distinct[i]
                const b = distinct[j]
                const d = editDistance(a.toLowerCase(), b.toLowerCase(), MAX_EDITS)
                if (d === 0 || d > MAX_EDITS) continue
                if (d / Math.max(a.length, b.length) > MAX_RATIO) continue

                const key = [a.toLowerCase(), b.toLowerCase()].sort().join('\u0000')
                if (seenPair.has(key)) continue
                seenPair.add(key)

                out.push(
                    `Two sections in the same price category are named almost the same: ` +
                    `"${a}" and "${b}". If one is a typo, rename it before publishing — ` +
                    `buyers see these names on the map and on their ticket.`
                )
            }
        }
    }

    return out
}
