import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'
const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'mail', 'smtp', 'send']

function getSubdomain(request: NextRequest): string | null {
    const hostname = (request.headers.get('host') || '').split(':')[0]

    // Local development
    if (hostname.endsWith('.localhost') || hostname.includes('.localhost')) {
        const sub = hostname.split('.localhost')[0]
        if (sub && sub !== hostname) return sub
        return null
    }

    // Production
    if (
        hostname === ROOT_DOMAIN ||
        hostname === `www.${ROOT_DOMAIN}` ||
        !hostname.endsWith(`.${ROOT_DOMAIN}`)
    ) {
        return null
    }

    const subdomain = hostname.replace(`.${ROOT_DOMAIN}`, '')
    return RESERVED_SUBDOMAINS.includes(subdomain) ? null : subdomain
}

export function middleware(request: NextRequest) {
    const url = request.nextUrl
    const subdomain = getSubdomain(request)
    const hostname = (request.headers.get('host') || '').split(':')[0]

    // 1. Partner subdomain → mutate pathname and rewrite
    if (subdomain) {
        // Mutate the pathname directly on the nextUrl object
        url.pathname = `/${subdomain}${url.pathname}`
        return NextResponse.rewrite(url)
    }

    // 2. Admin subdomain → rewrite to /admin
    if (hostname === `admin.${ROOT_DOMAIN}`) {
        url.pathname = `/admin${url.pathname}`
        return NextResponse.rewrite(url)
    }

    // 3. Default → pass through (no rewrite needed)
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - api routes
         * - _next (Next.js internals)
         * - static files (images, fonts, etc.)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
}
