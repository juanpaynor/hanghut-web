/**
 * Which paths are the APP on every host, and which belong to a partner storefront.
 *
 * WHY THIS IS ITS OWN MODULE. Two places need the same answer and used to not
 * share it:
 *
 *   1. src/middleware.ts decides, for an INCOMING request on a partner subdomain
 *      or custom domain, whether to serve the app route or rewrite to
 *      /<slug><path> for the storefront.
 *   2. src/lib/events/urls.ts decides, for an OUTGOING link we build, whether a
 *      path is safe to put on the partner's own domain at all.
 *
 * If (2) ever offers a path that (1) rewrites, the organizer gets a link to their
 * own domain that 404s — which is worse than the hanghut.com link it replaced.
 * One list, imported by both, makes that impossible to get wrong.
 *
 * Edge-runtime safe on purpose: a plain array and two pure functions, no imports.
 */

/**
 * App paths. Anything NOT matched here is rewritten to the storefront on a
 * partner host, and src/app/[slug] only defines page.tsx and membership/ — so an
 * unlisted path 404s on a partner domain while working fine on the apex.
 *
 * The short token routes (/d /m /r /s /t /x) are the ones this list was missing.
 * Every one of them is a link we hand to a real person — a ticket, an attendee
 * detail form, an influencer's referral code, a status page — and every one of
 * them 404'd on a partner domain, which is precisely why nothing in the product
 * dared point at a partner domain in the first place.
 *
 * Two entries earned their place the hard way and must not be dropped:
 *
 * '/monitoring' is Sentry's tunnel. Without it, an error on a partner subdomain
 * or custom domain is rewritten to /<slug>/monitoring and 404s — so the reports
 * that matter most, from a partner's own storefront, are the ones silently lost.
 *
 * The consumer auth routes ('/account', '/login', '/auth', '/reset-password')
 * belong here too: a buyer on a storefront who hits "Sign in" from an event page
 * goes to /account/login?next=…, which without this list became
 * /<slug>/account/login and 404'd. Auth cookies are already scoped to
 * `.{ROOT_DOMAIN}` (see src/lib/supabase/*.ts), so a session created on a
 * subdomain is valid on the apex too — only the routing was missing.
 *
 * '/unsubscribe' likewise: unlisted, a campaign sent from a partner domain had a
 * dead unsubscribe link.
 */
export const APP_ROUTE_PREFIXES = [
    // Buyer path
    '/events', '/checkout', '/experiences', '/embed',
    // Tokenized links we email or print
    '/t', '/x', '/d', '/m', '/s', '/r', '/verify',
    // Post-checkout landings
    '/merch', '/subscriptions',
    // Staff tools
    '/scan', '/box-office', '/checkin',
    // Account + auth
    '/account', '/login', '/auth', '/reset-password', '/delete-account',
    // Platform plumbing
    '/api', '/monitoring', '/unsubscribe',
    // Legal (same text on every host)
    '/privacy-policy', '/terms-of-service', '/terms',
    '/download',
] as const

/**
 * Match on whole path SEGMENTS, never a bare startsWith.
 *
 * This was a real bug waiting to happen the moment '/m' was added: a naive
 * `pathname.startsWith('/m')` also matches '/membership', which is a STOREFRONT
 * page (verified serving 200 on games.mimicmanila.com). Treating it as an app
 * route would have sent it to a /membership route that does not exist and 404'd
 * a working feature.
 *
 * Tightening this also means HangHut's own marketing pages stop rendering on
 * partner domains. '/ticketing' used to resolve there only because it happens to
 * start with '/t' — while '/pricing', '/use-cases' and '/capabilities' already
 * 404'd. Consistent now, and a partner's domain should not serve our sales page.
 */
export function isAppPath(pathname: string): boolean {
    return APP_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Platform-wide DISCOVERY INDEXES — the listing pages, not the detail pages.
 *
 * These are an app route (so /events/<slug> resolves on a partner domain, which
 * is the whole point of the custom-domain feature) but the bare INDEX has no
 * business being there: it renders HangHut's catalogue of everyone's events.
 *
 * VERIFIED on prod 2026-11-16: games.mimicmanila.com/events returned the apex
 * page byte for byte (409,942 bytes both), listing 30 events, most of them other
 * organizers' -- Comedy Manila's and BeatBridge's among them. A competitor's
 * event page rendered and was buyable on Mimic's own paid domain. /experiences
 * leaked identically (20,022 bytes both).
 *
 * The partner's storefront ROOT already is their event listing, so the index
 * redirects there. Detail pages are deliberately untouched: those links are in
 * sent emails, printed QR codes and the sitemap, and must never break.
 */
const DISCOVERY_INDEXES = ['/events', '/experiences']

export function isDiscoveryIndex(pathname: string): boolean {
    // Normalise a trailing slash; '/' itself must never match.
    const p = pathname.replace(/\/+$/, '')
    return DISCOVERY_INDEXES.includes(p)
}
