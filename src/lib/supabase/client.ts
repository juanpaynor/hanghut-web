import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'
    const isLocalEnv = process.env.NODE_ENV === 'development'

    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookieOptions: {
                domain: isLocalEnv ? undefined : `.${rootDomain}`,
            }
        }
    )
}
