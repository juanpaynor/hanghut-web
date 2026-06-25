'use client'

import { createClient } from '@/lib/supabase/client'

export type OAuthProvider = 'google' | 'apple'

/**
 * Start a partner OAuth sign-in. Redirects to the provider, then back to
 * /auth/callback which forwards to /organizer/post-login — the shared gate that
 * routes by partner status (approved → dashboard, none → finish application).
 */
export async function signInWithProvider(provider: OAuthProvider) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: `${window.location.origin}/auth/callback?next=/organizer/post-login`,
        },
    })
    if (error) throw error
}
