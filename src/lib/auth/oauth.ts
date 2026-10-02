'use client'

import { createClient } from '@/lib/supabase/client'

export type OAuthProvider = 'google' | 'apple'

/**
 * Start a partner OAuth sign-in. Redirects to the provider, then back to
 * /auth/callback which forwards to `next` — by default /organizer/post-login,
 * the shared gate that routes by partner status (approved → dashboard, none →
 * finish application).
 *
 * `next` is encoded because callers pass paths that carry their own query
 * string (the invite page sends `?token=…`); unencoded, the callback would read
 * a truncated path and silently drop the token.
 */
export async function signInWithProvider(
    provider: OAuthProvider,
    next: string = '/organizer/post-login',
) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
    })
    if (error) throw error
}
