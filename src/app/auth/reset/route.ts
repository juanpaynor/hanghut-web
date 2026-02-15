import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)

    const supabase = await createClient()

    // Check if there's already a valid session
    // (Supabase API may have already verified the token and set the session)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (session && !sessionError) {
        // Valid session exists - redirect to reset password page
        return NextResponse.redirect(`${origin}/reset-password`)
    }

    // Try to handle token parameters if present
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const code = searchParams.get('code')

    // Try PKCE code exchange
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${origin}/reset-password`)
        }
    }

    // Try token_hash verification
    if (token_hash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
        })

        if (!error) {
            return NextResponse.redirect(`${origin}/reset-password`)
        }
    }

    // If all methods failed, redirect to login with error
    console.error('Password reset failed - no valid session or token')
    return NextResponse.redirect(`${origin}/organizer/login?error=invalid_reset_link`)
}
