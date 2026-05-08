import { createClient } from '@supabase/supabase-js'

/**
 * A cookie-free Supabase client for public read-only pages.
 * Using this (instead of createClient from server.ts) allows Next.js ISR
 * to properly cache the page — cookie reads force dynamic rendering and
 * bypass revalidate entirely.
 */
export function createPublicClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}
