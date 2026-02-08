import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    const url = request.nextUrl
    let hostname = request.headers.get('host') || ''

    // Handle local development hostname
    if (hostname.includes('.localhost')) {
        hostname = hostname.replace('.localhost:3000', `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`)
    }

    const searchParams = request.nextUrl.searchParams.toString()
    const path = `${url.pathname}${searchParams.length > 0 ? `?${searchParams}` : ''}`

    // 1. Admin Subdomain -> Rewrite to /admin
    if (hostname === `admin.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) {
        const urlArgs = new URL(`/admin${path}`, request.url)
        return await updateSession(request, urlArgs)
    }

    // 2. Organizer Subdomains -> Rewrite to /[slug]
    /* 
    // DISABLED: Netlify Personal Plan does not support Wildcard Domains.
    // Re-enable this block if/when upgrading to Pro or if manually adding aliases.
    const isSubdomain = hostname.includes('.') && 
                       !hostname.startsWith('www.') && 
                       !hostname.startsWith('admin.') &&
                       !hostname.startsWith('api.')

    if (isSubdomain) {
        const subdomain = hostname.split('.')[0]
        const urlArgs = new URL(`/${subdomain}${path}`, request.url)
        return await updateSession(request, urlArgs)
    }
    */

    // 3. Default -> No rewrite
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
