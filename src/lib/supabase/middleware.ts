import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, rewriteUrl?: URL) {
    let supabaseResponse = rewriteUrl
        ? NextResponse.rewrite(rewriteUrl, { request })
        : NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = rewriteUrl
                        ? NextResponse.rewrite(rewriteUrl, { request })
                        : NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protected routes pattern — exclude login/register/auth pages
    const pathname = request.nextUrl.pathname
    const isProtectedRoute =
        (pathname.startsWith('/admin') || pathname.startsWith('/organizer')) &&
        !pathname.startsWith('/organizer/login') &&
        !pathname.startsWith('/organizer/register') &&
        !pathname.startsWith('/organizer/accept-invite')

    if (!user && isProtectedRoute) {
        // Redirect to the appropriate login page based on the route
        const url = request.nextUrl.clone()
        if (pathname.startsWith('/admin')) {
            url.pathname = '/login'
        } else {
            url.pathname = '/organizer/login'
        }
        url.searchParams.set('next', pathname)
        return NextResponse.redirect(url)
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely.

    return supabaseResponse
}
