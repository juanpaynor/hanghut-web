import { isAppPath } from '@/lib/routing/app-routes'

/**
 * Canonical public URLs.
 *
 * events.slug and partners.slug have existed (with unique indexes) since long
 * before this file, and /events/[id] has always resolved either form — but every
 * link in the product was built from the UUID, so a show with a perfectly good
 * slug was still shared as /events/3bf5e893-1cd3-4bca-9f0b-aee5cba20862.
 *
 * Always route through these helpers so there is one place that decides. The UUID
 * fallback is not decoration: a row written before the slug trigger existed, or
 * fetched by a query that did not select the column, must still produce a working
 * link rather than /events/undefined.
 */

export interface Sluggable { id: string; slug?: string | null }

export function eventHref(e: Sluggable): string {
    return `/events/${e.slug || e.id}`
}

export function experienceHref(e: Sluggable): string {
    // `tables` has no slug column yet, so experiences stay on UUIDs for now.
    return `/experiences/${e.id}`
}

export function storefrontHref(p: { slug?: string | null }): string | null {
    return p.slug ? `/${p.slug}` : null
}

/** Absolute form, for emails, share sheets and OG tags. */
export function absoluteUrl(path: string): string {
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://hanghut.com'
    return `${base.replace(/\/$/, '')}${path}`
}

/* ------------------------------------------------------------------------- *
 * Partner-owned origins
 *
 * THE BUG THIS FIXES. An organizer connects tickets.conyomanila.com, verifies
 * it, and the middleware serves their whole storefront and event pages from it
 * perfectly — VERIFIED: games.mimicmanila.com/events/<slug> returns 200 today.
 * But every link the product HANDED them went back to hanghut.com, because the
 * builders were a hardcoded 'https://hanghut.com', an env var, or a literal
 * `${slug}.hanghut.com` that did not know custom domains exist. So the domain
 * they paid for and pointed DNS at was the one place their own dashboard never
 * sent anyone.
 *
 * It is not cosmetic: a partner who sends buyers to hanghut.com is advertising
 * us instead of themselves, and that is the entire point of the feature.
 * ------------------------------------------------------------------------- */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'

/** The fields needed to work out a partner's public origin. `getPartner()`
 *  already selects all three, so threading this through costs no extra query. */
export interface PartnerHost {
    slug?: string | null
    custom_domain?: string | null
    custom_domain_verified?: boolean | null
}

/** HangHut's own origin. The fallback, never the default for a partner. */
export function platformOrigin(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL || `https://${ROOT_DOMAIN}`).replace(/\/$/, '')
}

/**
 * The origin a partner's own audience should see, most-owned first:
 *   1. their verified custom domain   → https://tickets.conyomanila.com
 *   2. their HangHut subdomain        → https://comedymanila.hanghut.com
 *   3. the platform                   → https://hanghut.com
 *
 * `custom_domain_verified` is required, not optional: an unverified domain has
 * no DNS pointing here yet, so linking to it produces a dead link. That check is
 * the same one the middleware makes when deciding whether to serve the host at
 * all, so the two cannot disagree.
 */
export function partnerOrigin(p: PartnerHost | null | undefined): string {
    if (!p) return platformOrigin()
    if (p.custom_domain && p.custom_domain_verified) return `https://${p.custom_domain}`
    if (p.slug) return `https://${p.slug}.${ROOT_DOMAIN}`
    return platformOrigin()
}

/** True when the partner has an origin of their own, i.e. not just hanghut.com. */
export function hasOwnOrigin(p: PartnerHost | null | undefined): boolean {
    return partnerOrigin(p) !== platformOrigin()
}

/**
 * Absolute URL on the partner's own origin — but ONLY for a path that survives
 * the storefront rewrite there. Anything else falls back to the platform origin.
 *
 * That guard is the whole reason this is a function and not string concatenation.
 * A partner-domain link to a path the middleware rewrites is a 404, which is
 * strictly worse than the hanghut.com link it replaced — so the decision reads
 * the same list the middleware routes by (`isAppPath`) instead of trusting the
 * caller. Pass a storefront path ('/' or '/membership') and it is served too,
 * since those are exactly what the rewrite exists for.
 */
export function partnerUrl(p: PartnerHost | null | undefined, path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`
    const servedOnPartnerHost = isAppPath(clean) || isStorefrontPath(clean, p)
    return `${servedOnPartnerHost ? partnerOrigin(p) : platformOrigin()}${clean}`
}

/**
 * The storefront itself, on the partner's own origin.
 *
 * On a partner host the brand page is the ROOT — the middleware rewrites '/' to
 * '/<slug>'. So tickets.conyomanila.com/conyomanila would be a doubled path, and
 * this returns the bare origin instead. Only on hanghut.com is the slug in the
 * path at all.
 */
export function storefrontUrl(p: PartnerHost | null | undefined): string | null {
    if (!p?.slug) return null
    return hasOwnOrigin(p) ? partnerOrigin(p) : `${platformOrigin()}/${p.slug}`
}

/** Paths the storefront rewrite actually resolves on a partner host.
 *  src/app/[slug] defines page.tsx and membership/ — and nothing else. */
function isStorefrontPath(path: string, p: PartnerHost | null | undefined): boolean {
    if (!p?.slug) return false
    if (path === '/') return true
    if (path === '/membership' || path.startsWith('/membership/')) return true
    // '/<slug>...' on hanghut.com is the same page; on the partner host the
    // rewrite would double the slug, so it is not partner-safe in this form.
    return false
}
