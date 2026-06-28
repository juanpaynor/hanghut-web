import { NextResponse } from 'next/server'

/**
 * Apple App Site Association (AASA) for iOS Universal Links.
 *
 * Served at /.well-known/apple-app-site-association via a rewrite in next.config.ts
 * (a rewrite is internal, so Apple receives a 200 with NO redirect — Apple fetches
 * this file directly and treats any 3xx as a silent failure).
 *
 * v1: event deep-links only. The app team's request also listed /posts/*, but web
 * has no public post route yet, so a /posts/:id link would 404 with no fallback.
 * We'll add the /posts/* component here once that route + data contract exist.
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
