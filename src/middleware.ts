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

export async function middleware(request: NextRequest) {
    const url = request.nextUrl
    const subdomain = getSubdomain(request)
    const hostname = (request.headers.get('host') || '').split(':')[0]

    // 0. Supabase auth code redirect — password reset / email confirmation
    // Supabase sends users to the site root with ?code=xxx (PKCE flow)
    // We need to forward that to /auth/callback so it gets exchanged for a session
    const authCode = url.searchParams.get('code')
    if (authCode && url.pathname === '/') {
        const callbackUrl = new URL('/auth/callback', request.url)
        callbackUrl.searchParams.set('code', authCode)
        // Preserve the 'next' param if present, default to /reset-password
        const next = url.searchParams.get('next') || '/reset-password'
        callbackUrl.searchParams.set('next', next)
        return NextResponse.redirect(callbackUrl)
    }

    // 1. Partner subdomain → rewrite to storefront (no auth needed)
    if (subdomain) {
        // Known app routes should work normally on subdomains (e.g. acme.hanghut.com/events/[id])
        const appRoutePrefixes = ['/events', '/checkout', '/experiences', '/delete-account', '/privacy-policy', '/terms-of-service', '/terms', '/auth', '/api', '/download', '/scan']
        const isAppRoute = appRoutePrefixes.some(prefix => url.pathname.startsWith(prefix))

        if (isAppRoute) {
            // Let it pass through to the normal app route
            return NextResponse.next()
        }

        // Rewrite root and unknown paths to the storefront slug page
        url.pathname = `/${subdomain}${url.pathname}`
        return NextResponse.rewrite(url)
    }

    // 2. Admin subdomain → rewrite to /admin path (with auth)
    if (hostname === `admin.${ROOT_DOMAIN}`) {
        // If requesting /login on admin subdomain, let it pass through
        // to the login page (not rewritten to /admin/login)
        if (url.pathname === '/login') {
            return await updateSession(request)
        }
        url.pathname = `/admin${url.pathname}`
        return NextResponse.rewrite(url)
    }

    // 3. Skip auth overhead for public-only routes
    const publicPrefixes = ['/events', '/terms', '/privacy', '/how-it-works']
    if (publicPrefixes.some(p => url.pathname.startsWith(p))) {
        return NextResponse.next()
    }

    // 4. Default (main domain) → Supabase session handling for auth
    return await updateSession(request)
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
