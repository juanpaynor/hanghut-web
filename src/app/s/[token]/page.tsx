import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { EventStatusView, type EventStatus } from '@/components/status/event-status-view'
import type { Metadata } from 'next'

/**
 * Shared, read-only "how is the show doing" page.
 *
 * Per-URL ISR at 20s. This is the load story: one link goes to a dozen door
 * staff who each leave it open all night, across every partner running a show
 * that evening. Rendering per request would turn a status board into a
 * self-inflicted load test -- the seat picker already taught that lesson by
 * re-fetching a 2-3MB map every 30s. Twenty seconds is live enough for a door
 * (people arrive over minutes, not milliseconds) and collapses N viewers into
 * one database read.
 *
 * Side effect of caching: event_status_links.view_count counts RENDERS, not
 * people. It answers "has anyone opened this at all", which is what the
 * organizer actually wants from it, and nothing more precise is claimed in the UI.
 */
export const revalidate = 20

// Tokens are 32 random bytes base64url. Reject anything that cannot be one
// before spending a round trip on it.
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/

function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

// Never let a shared status link turn into a search result or a link preview
// that leaks an event's numbers into a group chat's unfurl.
export const metadata: Metadata = {
    title: 'Event status',
    robots: { index: false, follow: false, nocache: true },
}

export default async function EventStatusPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!TOKEN_RE.test(token)) notFound()

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_event_status_by_token', { p_token: token })

    // The RPC answers a uniform {ok:false} for missing, revoked and expired
    // alike, so there is exactly one failure surface here by design.
    if (error || !data || (data as EventStatus).ok !== true) notFound()

    return <EventStatusView status={data as EventStatus} />
}
