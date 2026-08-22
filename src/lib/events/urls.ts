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
