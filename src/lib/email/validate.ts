/**
 * Buyer-typed email validation, shared by every surface that collects one
 * (checkout, RSVP, box office) and by the server that accepts it.
 *
 * Why this exists: nothing checked the address a buyer typed at checkout, so
 * `gmail.con` sailed through — it is a perfectly valid address, just not a real
 * one. On prod that produced 31 paid orders whose ticket email hard-bounced.
 * `process-email-queue` already guards the MARKETING path this way; checkout
 * never got the same treatment.
 *
 * Deliberately suggestion-only for domains: we never rewrite what someone
 * typed. A wrong auto-correct is worse than a typo, and plenty of real buyers
 * are on domains we have never seen.
 */

/** Domains our buyers actually use, from the live address book. A typed domain
 *  that appears here is ALWAYS accepted as-is and never draws a suggestion.
 *
 *  The PH entries are load-bearing, not decoration: `ymail.com` is one edit
 *  from `gmail.com` and `yahoo.com.ph` is three from `yahoo.com`, so without
 *  them the suggester would "correct" real addresses belonging to real buyers. */
const KNOWN_DOMAINS = [
    // Consumer mail, by volume in our own data
    'gmail.com', 'yahoo.com', 'icloud.com', 'me.com', 'mac.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'ymail.com', 'rocketmail.com', 'aol.com',
    'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com', 'fastmail.com',
    // Apple Hide-My-Email — common here and must never be "corrected"
    'privaterelay.appleid.com',
    // Philippine consumer + academic
    'yahoo.com.ph', 'gmail.com.ph',
    'up.edu.ph', 'dlsu.edu.ph', 'admu.edu.ph', 'ust.edu.ph', 'ess.edu.ph',
    'feu.edu.ph', 'mapua.edu.ph', 'addu.edu.ph', 'usc.edu.ph',
    // Ours
    'hanghut.com',
]

const KNOWN_SET = new Set(KNOWN_DOMAINS)

/** Structural check. Intentionally close to the guard in process-email-queue
 *  so the two paths agree on what an address even is. */
const SHAPE = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\]+\.[A-Za-z]{2,}$/

/**
 * Strip the wrapping a paste can leave behind and lowercase the domain.
 * `"Juan <juan@gmail.com>"` and `" JUAN@Gmail.Com "` both normalise cleanly —
 * a stray `>` is exactly how `gmail.com>` reached prod as a stored address.
 */
export function normalizeEmail(raw: string): string {
    let v = (raw ?? '').trim()
    // "Name <addr>" or a bare "<addr>"
    const angled = v.match(/<([^<>]+)>\s*$/)
    if (angled) v = angled[1].trim()
    v = v.replace(/^[<"'\s]+|[>"'\s.,;]+$/g, '')
    const at = v.lastIndexOf('@')
    if (at === -1) return v
    return v.slice(0, at) + '@' + v.slice(at + 1).toLowerCase()
}

/**
 * A human-readable reason the address can't be used, or null when it's fine.
 * Structure only — it cannot tell whether a mailbox exists.
 */
export function emailFormatError(raw: string): string | null {
    const email = normalizeEmail(raw)
    if (!email) return 'Enter an email address'
    if (!email.includes('@')) return 'That address is missing an @'
    if ((email.match(/@/g) ?? []).length > 1) return 'That address has more than one @'
    const [local, domain] = [email.slice(0, email.lastIndexOf('@')), email.slice(email.lastIndexOf('@') + 1)]
    if (!local) return 'Add the part before the @'
    if (!domain) return 'Add the part after the @'
    if (!domain.includes('.')) return `${domain} is missing a .com or similar`
    if (!SHAPE.test(email)) return 'That doesn’t look like a valid email address'
    if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
        return 'That address has a misplaced dot'
    }
    return null
}

/** Damerau-Levenshtein (optimal string alignment) — counts a transposition as
 *  one edit, so `gmial.com` reads as one slip from `gmail.com` rather than two. */
function editDistance(a: string, b: string): number {
    const m = a.length, n = b.length
    if (!m) return n
    if (!n) return m
    const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    )
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost)
            }
        }
    }
    return d[m][n]
}

/**
 * The corrected address to offer the buyer, or null when we have nothing
 * confident to say. Returns the WHOLE address so the caller can apply it in
 * one tap; the local part is never touched.
 *
 * Only fires on a domain we do not recognise, and only when exactly one known
 * domain is close enough — an ambiguous near-miss says nothing rather than
 * guessing between two.
 */
export function suggestEmail(raw: string): string | null {
    const email = normalizeEmail(raw)
    if (emailFormatError(email)) return null
    const at = email.lastIndexOf('@')
    const local = email.slice(0, at)
    const domain = email.slice(at + 1)

    // A domain we know is correct by definition.
    if (KNOWN_SET.has(domain)) return null

    // Same name, wrong ending. `gmail.on` sits TWO plain edits from `gmail.com`
    // (insert c, n→m) so a distance budget alone missed it — yet it is one of
    // the typos actually costing us tickets. Matching the name and treating the
    // ending separately catches that class exactly, without loosening the
    // budget for everything else.
    const dot = domain.lastIndexOf('.')
    if (dot > 0) {
        const name = domain.slice(0, dot)
        const tldMatches = KNOWN_DOMAINS.filter(k => {
            const kDot = k.lastIndexOf('.')
            return kDot > 0 && k.slice(0, kDot) === name
        })
        if (tldMatches.length === 1) return `${local}@${tldMatches[0]}`
    }

    // Tighter tolerance on short domains, where one edit can legitimately land
    // on a different real company.
    const budget = domain.length >= 9 ? 2 : 1
    const hits = KNOWN_DOMAINS
        .map(known => ({ known, dist: editDistance(domain, known) }))
        .filter(x => x.dist > 0 && x.dist <= budget)
        .sort((a, b) => a.dist - b.dist)

    if (hits.length === 0) return null
    // Two equally-close candidates = a coin flip. Say nothing.
    if (hits.length > 1 && hits[0].dist === hits[1].dist) return null
    return `${local}@${hits[0].known}`
}

/** True when the address is structurally usable. Says nothing about delivery. */
export function isEmailUsable(raw: string): boolean {
    return emailFormatError(raw) === null
}
