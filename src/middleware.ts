import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createClient as createServerClient } from '@/lib/supabase/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'
/**
 * Hostnames that are the platform, never a partner storefront.
 *
 * 'docs' is here so that docs.hanghut.com is routed deliberately (see the branch
 * below) rather than by accident. Without it, `getSubdomain` returns 'docs', the
 * storefront branch rewrites `/` to `/docs`, and the API docs render — but only
 * because a route of that name happens to exist. The moment a partner registered
 * the slug `docs` they would own the hostname, and nothing today stops them:
 * there is no reserved-slug check at signup.
 */
const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'mail', 'smtp', 'send', 'docs']

async function getPartnerSlugForCustomDomain(hostname: string): Promise<string | null> {
    try {
        const supabase = await createServerClient()
        const { data } = await supabase
            .from('partners')
            .select('slug')
            .eq('custom_domain', hostname)
            .eq('custom_domain_verified', true)
            .single()
        return data?.slug ?? null
    } catch {
        return null
    }
}

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

    // 0. Well-known files (Apple AASA for iOS Universal Links, etc.) must serve from
    //    the app root on EVERY host (apex + partner subdomains + custom domains),
    //    bypassing the storefront rewrite. A rewrite in next.config maps the path to
    //    the /aasa route handler. Apple fetches this directly and rejects redirects.
    if (url.pathname.startsWith('/.well-known/')) {
        return NextResponse.next()
    }

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

    // Paths that are the APP, not the storefront, on every host. Anything not
    // listed here is rewritten to /<slug><path> for the partner storefront — and
    // since src/app/[slug] only defines /membership, an unlisted app path 404s on
    // a partner subdomain or custom domain while working fine on the apex.
    //
    // '/monitoring' is Sentry's tunnel. Without it here, an error on a partner
    // subdomain or custom domain would be rewritten to /<slug>/monitoring and
    // 404 — so the reports that matter most, from a partner's own storefront,
    // would be the ones silently lost.
    //
    // The consumer auth routes belong here: a buyer on a storefront who hits
    // "Sign in" from an event page goes to /account/login?next=..., which without
    // this list became /<slug>/account/login and 404'd. Auth cookies are already
    // scoped to `.{ROOT_DOMAIN}` (see src/lib/supabase/*.ts), so a session created
    // on a subdomain is valid on the apex too — only the routing was missing.
    const appRoutePrefixes = ['/events', '/checkout', '/experiences', '/delete-account', '/privacy-policy', '/terms-of-service', '/terms', '/auth', '/api', '/download', '/scan', '/box-office', '/checkin', '/embed', '/t', '/account', '/login', '/reset-password', '/monitoring']

    // 1a. Custom domain → look up partner slug and rewrite to storefront
    const isHanghutDomain = hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`) || hostname.endsWith('.localhost') || hostname === 'localhost'
    if (!isHanghutDomain) {
        const isAppRoute = appRoutePrefixes.some(prefix => url.pathname.startsWith(prefix))
        if (isAppRoute) return NextResponse.next()

        const slug = await getPartnerSlugForCustomDomain(hostname)
        if (slug) {
            url.pathname = `/${slug}${url.pathname}`
            return NextResponse.rewrite(url)
        }
        // Unknown custom domain — let it 404
        return NextResponse.next()
    }

    // 1b. Partner subdomain → rewrite to storefront (no auth needed)
    if (subdomain) {
        const isAppRoute = appRoutePrefixes.some(prefix => url.pathname.startsWith(prefix))

        if (isAppRoute) {
            // Let it pass through to the normal app route
            return NextResponse.next()
        }

        // Rewrite root and unknown paths to the storefront slug page
        url.pathname = `/${subdomain}${url.pathname}`
        return NextResponse.rewrite(url)
    }

    // 1c. Docs subdomain → rewrite to /docs. Public, so no session round trip.
    //
    // docs.hanghut.com/          → /docs
    // docs.hanghut.com/api       → /docs/api
    // docs.hanghut.com/api/v1/…  → left alone: /api is in appRoutePrefixes and the
    //                              real API must stay reachable on this host, or
    //                              the sandbox console on the docs page would have
    //                              to call across an origin it does not control.
    //
    // The '/docs' guard stops a doubled path if someone links the canonical
    // docs.hanghut.com/docs by hand.
    if (hostname === `docs.${ROOT_DOMAIN}`) {
        if (url.pathname.startsWith('/api')) return NextResponse.next()
        if (url.pathname === '/docs' || url.pathname.startsWith('/docs/')) return NextResponse.next()
        url.pathname = `/docs${url.pathname === '/' ? '' : url.pathname}`
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
    // '/x' is the hosted experience pass, the experiences twin of '/t'. Both are
    // addressed by an unguessable token and render with the anon key, so an auth
    // round trip here would buy nothing and undo their ISR.
    // '/docs' is here for the apex spelling (hanghut.com/docs). The docs
    // subdomain already returned above; this stops the canonical path paying for
    // a session lookup it never reads.
    const publicPrefixes = ['/events', '/terms', '/privacy', '/how-it-works', '/embed', '/checkout', '/t', '/x', '/docs']
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
         * - Next's generated metadata routes
         *
         * The metadata routes matter on PARTNER HOSTS. Anything middleware sees
         * on a subdomain or custom domain that is not an app route gets
         * rewritten to /<slug><path> for the storefront, and src/app/[slug]
         * defines only page.tsx and membership/ -- so /manifest.webmanifest
         * became /hexfest/manifest.webmanifest and 404'd on every storefront.
         * Same for robots.txt and sitemap.xml. These are host-independent and
         * should always serve from the app root, so exclude them here rather
         * than threading them through appRoutePrefixes.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)',
    ],
}
