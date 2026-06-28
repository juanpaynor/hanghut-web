import { NextResponse } from 'next/server'

/**
 * Android App Links — Digital Asset Links (assetlinks.json).
 *
 * Served at /.well-known/assetlinks.json via a rewrite in next.config.ts
 * (internal rewrite = 200 with NO redirect; Android's verifier fetches directly).
 * The middleware /.well-known/* bypass serves it on apex + every {slug}.hanghut.com
 * subdomain, matching the app manifest's autoVerify for hanghut.com and *.hanghut.com.
 *
 * package_name is the ANDROID id (com.hanghut.hanghut) — note it DIFFERS from the
 * iOS bundle id (com.hang.hanghut).
 * Two fingerprints: [0] Google Play app-signing key (Play Store installs),
 * [1] upload key (internal-test / direct-APK builds). Keep both.
 * v1: events only, matching iOS.
 */
export const dynamic = 'force-static'

const ASSET_LINKS = [
    {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: 'com.hanghut.hanghut',
            sha256_cert_fingerprints: [
                '58:97:4D:AE:1D:81:B5:EF:10:62:C5:8F:28:3D:3A:A2:8D:9E:0E:32:59:E8:3F:6E:FA:AF:00:94:14:FA:6E:14',
                'C1:90:BC:F3:B5:3D:B8:2F:38:79:AA:30:85:24:F3:FE:EB:71:4E:1A:8F:A1:C9:A9:FF:FB:E6:E6:AA:0B:E4:25',
            ],
        },
    },
]

export function GET() {
    return NextResponse.json(ASSET_LINKS, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
