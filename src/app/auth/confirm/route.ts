import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/'

    if (token_hash && type) {
        const supabase = await createClient()

        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })

        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'
            const origin = new URL(request.url).origin

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

        console.error('[Auth Confirm] verifyOtp failed:', error.message)
    }

    // Redirect to login with error
    const origin = new URL(request.url).origin
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
