import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/admin'

    if (code) {
        // For password resets, pass the code to the client-side page
        // The browser's Supabase client has the PKCE code_verifier in localStorage
        // and can exchange the code properly
        if (next === '/reset-password') {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'

            let redirectUrl: string
            if (isLocalEnv) {
                redirectUrl = `${origin}/reset-password?code=${code}`
            } else if (forwardedHost) {
                redirectUrl = `https://${forwardedHost}/reset-password?code=${code}`
            } else {
                redirectUrl = `${origin}/reset-password?code=${code}`
            }

            return NextResponse.redirect(redirectUrl)
        }

        // For other auth flows (login, etc.), exchange server-side
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'

            let redirectUrl: string
            if (isLocalEnv) {
                redirectUrl = `${origin}${next}`
            } else if (forwardedHost) {
                redirectUrl = `https://${forwardedHost}${next}`
            } else {
                redirectUrl = `${origin}${next}`
            }

            const response = NextResponse.redirect(redirectUrl)
            response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            response.headers.set('Pragma', 'no-cache')
            response.headers.set('Expires', '0')
            return response
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
