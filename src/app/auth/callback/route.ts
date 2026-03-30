import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/admin'
    const error_description = searchParams.get('error_description')
    
    // Auth error from Supabase
    if (error_description) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description)}`)
    }

    if (code) {
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
        } else {
            // Log the specific PKCE exchange error
            console.error('[Auth Callback] Code exchange failed:', error.message)
            
            if (next === '/reset-password') {
                return NextResponse.redirect(`${origin}/reset-password?error=link_expired&message=${encodeURIComponent(error.message)}`)
            }
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }
    }

    // Default error
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
