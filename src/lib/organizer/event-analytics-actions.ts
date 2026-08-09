'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPartnerId } from '@/lib/auth/cached'

export interface EventAnalyticsBundle {
    analytics: any | null
    customers: any | null
    emailCampaigns: any[]
}

/**
 * Heavy, analytics-tab-only data — deliberately NOT fetched on initial event-page
 * load. The organizer detail page renders instantly; this is called client-side
 * only when the Analytics tab is opened (see analytics-tab-lazy.tsx).
 *
 * Authorization: the two RPCs are SECURITY DEFINER + organizer-scoped on
 * auth.uid(), so they self-gate. email_campaign_stats is read with the admin
 * client, so we first verify the caller's partner owns this event.
 */
export async function getEventAnalyticsBundle(eventId: string): Promise<EventAnalyticsBundle> {
    const empty: EventAnalyticsBundle = { analytics: null, customers: null, emailCampaigns: [] }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return empty

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return empty

    // Ownership gate (admin client below bypasses RLS).
    const { data: owned } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partnerId)
        .maybeSingle()
    if (!owned) return empty

    const [analyticsRes, customersRes, campaignsRes] = await Promise.all([
        supabase.rpc('get_event_analytics', { p_event_id: eventId }),
        supabase.rpc('get_event_customer_breakdown', { p_event_id: eventId }),
        createAdminClient()
            .from('email_campaign_stats')
            .select('id, subject, sent_at, recipient_count, sent_count, delivered_count, opened_count, clicked_count')
            .eq('event_id', eventId)
            .order('sent_at', { ascending: false }),
    ])

    return {
        analytics: analyticsRes.data ?? null,
        customers: customersRes.data ?? null,
        emailCampaigns: campaignsRes.data ?? [],
    }
}
