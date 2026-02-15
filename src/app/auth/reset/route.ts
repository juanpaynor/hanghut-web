import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)

    // Supabase sends different parameters depending on the flow
    // For password reset via email, it sends 'token_hash' and 'type'
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    // Sometimes it might send just 'code' (PKCE flow)
    const code = searchParams.get('code')

    const supabase = await createClient()

    // Try PKCE code exchange first
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
    console.error('Password reset failed - invalid token')
    return NextResponse.redirect(`${origin}/organizer/login?error=invalid_reset_link`)
}
