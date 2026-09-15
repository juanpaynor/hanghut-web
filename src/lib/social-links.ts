/**
 * Organizers type their links the way people say them — "mimicmanila.com",
 * "www.instagram.com/thekoolpals", "@thekoolpals" — not as URLs. Rendered
 * raw into <a href>, a scheme-less value is a RELATIVE path, so the browser
 * resolved "mimicmanila.com" against the storefront and 404'd on
 * games.mimicmanila.com/mimicmanila.com. Normalise at both ends: on save, and
 * again on render for anything already stored.
 */
export type SocialKind = 'website' | 'instagram' | 'facebook' | 'twitter'

const HOST: Record<Exclude<SocialKind, 'website'>, string> = {
    instagram: 'instagram.com',
    facebook: 'facebook.com',
    twitter: 'x.com',
}

export function toSocialHref(kind: SocialKind, raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim()
    if (!v) return null
    if (/^https?:\/\//i.test(v)) return v
    // "@handle" / bare handle on a social network → profile URL.
    if (kind !== 'website' && /^@?[A-Za-z0-9_.]+$/.test(v)) {
        return `https://${HOST[kind]}/${v.replace(/^@/, '')}`
    }
    // Anything else is a host or host/path missing its scheme.
    return `https://${v.replace(/^\/+/, '')}`
}

export function normalizeSocialLinks<T extends Record<string, string | null | undefined>>(links: T): T {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(links)) {
        const kind = (['website', 'instagram', 'facebook', 'twitter'] as const).find(x => x === k)
        out[k] = kind ? (toSocialHref(kind, v) ?? '') : ((v ?? '') as string)
    }
    return out as T
}
