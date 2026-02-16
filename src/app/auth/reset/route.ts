import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)

    const supabase = await createClient()

    // DO NOT accept existing sessions - only fresh sessions from reset tokens
    // This prevents accidentally resetting the wrong user's password

    // Try to handle token parameters
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const code = searchParams.get('code')

    // Try PKCE code exchange
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const response = NextResponse.redirect(`${origin}/reset-password`)
            // Prevent caching of auth responses
            response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            response.headers.set('Pragma', 'no-cache')
            response.headers.set('Expires', '0')
            return response
        }
    }

    // Try token_hash verification
    if (token_hash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
        })

        if (!error) {
            const response = NextResponse.redirect(`${origin}/reset-password`)
            // Prevent caching of auth responses
            response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            response.headers.set('Pragma', 'no-cache')
            response.headers.set('Expires', '0')
            return response
        }
    }

    // Check if there's a session after token verification
    // (Supabase API may have already verified the token and set the session)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (session && !sessionError) {
        // Valid session exists from the reset flow - redirect to reset password page
        const response = NextResponse.redirect(`${origin}/reset-password`)
        // Prevent caching of auth responses
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        response.headers.set('Pragma', 'no-cache')
        response.headers.set('Expires', '0')
        return response
    }

    // If all methods failed, redirect to login with error
    console.error('Password reset failed - no valid token or session')
    const response = NextResponse.redirect(`${origin}/organizer/login?error=invalid_reset_link`)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return response
}
