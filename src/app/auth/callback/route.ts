import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/admin'
    const error = searchParams.get('error')
    const error_description = searchParams.get('error_description')

    // Handle Supabase auth errors (e.g., expired token)
    if (error) {
        console.error('[Auth Callback] Supabase error:', error, error_description)
        return NextResponse.redirect(`${origin}/login?error=${error}`)
    }

    if (code) {
        const supabase = await createClient()
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (!exchangeError) {
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
            // Prevent caching of auth responses
            response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            response.headers.set('Pragma', 'no-cache')
            response.headers.set('Expires', '0')
            return response
        }

        // Code exchange failed — likely PKCE code_verifier mismatch
        // (user opened reset email on different browser/device)
        console.error('[Auth Callback] Code exchange failed:', exchangeError.message)

        // If this was a password reset, redirect to reset-password with an error message
        if (next === '/reset-password') {
            return NextResponse.redirect(
                `${origin}/reset-password?error=link_expired&message=This reset link has expired or was opened in a different browser. Please request a new password reset link.`
            )
        }
    }

    // Fallback: return the user to login with an error
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
