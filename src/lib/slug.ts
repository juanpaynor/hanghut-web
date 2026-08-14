/**
 * URL slug generation for human-readable event links.
 *
 * NFKD (compatibility decomposition) rather than NFD (canonical) is deliberate:
 * canonical folds `ü` → `u`, but only compatibility folds styled Unicode letters
 * (e.g. the mathematical-bold `𝗠` used in some organizer titles) back to ASCII.
 * With NFD those titles slug to an empty string.
 */

const MAX_SLUG_LENGTH = 60

/**
 * Convert arbitrary text into a URL-safe slug.
 * Returns '' when the input carries no romanizable characters (e.g. pure CJK
 * or emoji) — callers must supply their own fallback.
 */
export function slugify(input: string): string {
    if (!input) return ''

    const full = input
        .normalize('NFKD')
        // Drop combining marks left behind by decomposition (ü → u + ̈ → u)
        .replace(/[̀-ͯ]/g, '')
        // Elide apostrophes so `gallery's` → `gallerys`, not `gallery-s`
        .replace(/['‘’ʼ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    return truncateAtWord(full)
}

/**
 * Cut to the length cap on a word boundary, so a long title ends at
 * `...anniversary` rather than `...anniversary-exhib`. Falls back to a hard
 * cut when the first word alone exceeds the limit.
 */
function truncateAtWord(slug: string): string {
    if (slug.length <= MAX_SLUG_LENGTH) return slug

    const cut = slug.slice(0, MAX_SLUG_LENGTH)
    const lastBreak = cut.lastIndexOf('-')

    return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).replace(/-$/, '')
}

/**
 * Slug for an event, with a stable fallback for titles that romanize to nothing.
 * The fallback keeps the URL usable and unique without leaking the full UUID.
 */
export function eventSlug(title: string, id: string): string {
    const base = slugify(title)
    if (base) return base
    return `event-${id.slice(0, 8)}`
}

/**
 * Append a numeric discriminator until the slug is unused.
 * `taken` should contain every slug already claimed.
 */
export function uniqueSlug(base: string, taken: Set<string>): string {
    if (!taken.has(base)) return base

    for (let n = 2; n < 1000; n++) {
        const suffix = `-${n}`
        const candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix
        if (!taken.has(candidate)) return candidate
    }

    throw new Error(`Could not find a free slug for "${base}"`)
}

/** Route params may be a UUID (legacy links) or a slug. */
export function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
