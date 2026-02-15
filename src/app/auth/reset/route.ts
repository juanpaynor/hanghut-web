import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    if (token_hash && type === 'recovery') {
        const supabase = await createClient()

        // Verify the OTP token
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
        })

        if (!error) {
            // Successfully verified - redirect to reset password page
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}/reset-password`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}/reset-password`)
            } else {
                return NextResponse.redirect(`${origin}/reset-password`)
            }
        }
    }

    // If verification failed or invalid parameters, redirect to login with error
    return NextResponse.redirect(`${origin}/organizer/login?error=invalid_reset_link`)
}
