'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'

export interface EmbedContext {
    partner: { id: string; slug: string | null; business_name: string; branding: any }
    events: { id: string; title: string; start_datetime: string }[]
}

/**
 * Everything the Embed page needs, resolved through the ACTING partner —
 * owner or platform-support/team seat. The page used to look up
 * `partners.user_id = auth.uid()` from the browser, which is owner-only:
 * a ghost seat got null back and the page skeleton-loaded forever.
 */
export async function getEmbedContext(): Promise<EmbedContext | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }
    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account is linked to this login.' }

    const admin = createAdminClient()
    const [{ data: partner }, { data: events }] = await Promise.all([
        admin.from('partners').select('id, slug, business_name, branding').eq('id', partnerId).maybeSingle(),
        admin.from('events')
            .select('id, title, start_datetime')
            .eq('organizer_id', partnerId)
            .in('status', ['active', 'hidden'])
            .gte('start_datetime', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .order('start_datetime', { ascending: true }),
    ])
    if (!partner) return { error: 'Partner account not found.' }
    return { partner, events: events ?? [] }
}
