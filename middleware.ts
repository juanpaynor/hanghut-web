import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'
const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'mail', 'smtp', 'send']

function extractSubdomain(request: NextRequest): string | null {
    const url = request.url
    const host = request.headers.get('host') || ''
    const hostname = host.split(':')[0]

    // Local development
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        const fullUrlMatch = url.match(/http:\/\/([^.]+)\.localhost/)
        if (fullUrlMatch && fullUrlMatch[1]) {
            return fullUrlMatch[1]
        }
        if (hostname.includes('.localhost')) {
            return hostname.split('.')[0]
        }
        return null
    }

    // Production: check if hostname is a subdomain of root domain
    const isSubdomain =
        hostname !== ROOT_DOMAIN &&
        hostname !== `www.${ROOT_DOMAIN}` &&
        hostname.endsWith(`.${ROOT_DOMAIN}`)

    if (!isSubdomain) return null

    const subdomain = hostname.replace(`.${ROOT_DOMAIN}`, '')
    return RESERVED_SUBDOMAINS.includes(subdomain) ? null : subdomain
}

export async function middleware(request: NextRequest) {
    const subdomain = extractSubdomain(request)

    // Partner subdomain detected → rewrite to storefront BEFORE Supabase session
    if (subdomain) {
        const { pathname } = request.nextUrl
        const searchParams = request.nextUrl.searchParams.toString()
        const path = `${pathname}${searchParams.length > 0 ? `?${searchParams}` : ''}`

        // Rewrite subdomain to /[slug] storefront route
        const rewriteUrl = new URL(`/${subdomain}${path}`, request.url)
        return NextResponse.rewrite(rewriteUrl)
    }

    // Admin subdomain
    const host = request.headers.get('host') || ''
    const hostname = host.split(':')[0]
    if (hostname === `admin.${ROOT_DOMAIN}`) {
        const { pathname } = request.nextUrl
        const searchParams = request.nextUrl.searchParams.toString()
        const path = `${pathname}${searchParams.length > 0 ? `?${searchParams}` : ''}`
        const urlArgs = new URL(`/admin${path}`, request.url)
        return await updateSession(request, urlArgs)
    }

    // Default: run Supabase session (handles auth, protected routes)
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - public assets
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
