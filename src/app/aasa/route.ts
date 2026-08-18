import { NextResponse } from 'next/server'

/**
 * Apple App Site Association (AASA) for iOS Universal Links.
 *
 * Served at /.well-known/apple-app-site-association via a rewrite in next.config.ts
 * (a rewrite is internal, so Apple receives a 200 with NO redirect — Apple fetches
 * this file directly and treats any 3xx as a silent failure).
 *
 * Claim a path here ONLY when a real page exists behind it: iOS hands the URL to
 * the app, and if the app can't route it the fallback is our web page. Claiming a
 * path with no page is a 404 with no way back, which is worse than just opening
 * the browser.
 *
 * v2 (team_comms #250/#252): added /experiences/*, which has had a live route
 * (src/app/experiences/[id]) all along and was simply never claimed here — so
 * shared experience links opened the browser instead of the app.
 *
 * v3 (#253): added /posts/*, now that src/app/posts/[id] exists. That route enforces
 * visibility='public' AND is_story=false server-side on every request, so a claimed
 * /posts/* URL always resolves to a real page or an honest 404 — never a leak.
 *
 * Still NOT claimed, deliberately:
 *   /hangouts/* — no web route, and `tables` stores hangouts AND experiences behind
 *                 an is_experience flag, so the route must disambiguate first.
 *
 * NOTE: this file governs iOS only. Android has no path scoping — assetlinks.json
 * delegates handle_all_urls, and path filtering lives in the app's manifest intent
 * filters, so widening Android coverage needs no change on web.
 *
 * App identifier: <TeamID>.<bundleID> = GG7R5XRBC4.com.hang.hanghut
 */
export const dynamic = 'force-static'

const AASA = {
    applinks: {
        details: [
            {
                appIDs: ['GG7R5XRBC4.com.hang.hanghut'],
                components: [
                    { '/': '/events/*', comment: 'Event detail pages' },
                    { '/': '/experiences/*', comment: 'Experience detail pages' },
                    { '/': '/posts/*', comment: 'Shared post pages (public, non-story only)' },
                ],
            },
        ],
    },
}

export function GET() {
    return NextResponse.json(AASA, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
