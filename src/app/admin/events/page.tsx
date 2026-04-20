import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { EventsClient } from './events-client'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 20

async function getEvents(page: number, status?: string, eventType?: string, search?: string) {
    const supabase = await createClient()

    // Calculate range for pagination
    const from = (page - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    // Build query
    let query = supabase
        .from('events')
        .select(`
      *,
      organizer:partners!events_organizer_id_fkey(
        id,
        business_name,
        verified
      )
    `, { count: 'exact' })
        .order('start_datetime', { ascending: false })
        .range(from, to)

    // Add filters
    if (status && status !== 'all') {
        query = query.eq('status', status)
    }

    if (eventType && eventType !== 'all') {
        query = query.eq('event_type', eventType)
    }

    if (search) {
        const trimmed = search.trim()
        if (trimmed.length >= 3) {
            // Use full-text search_vector (GIN indexed) for 3+ char queries.
            // Falls back to trigram ilike for partial/typo matches on the same pass.
            // to_tsquery requires word tokens; we build a prefix query: "term:*"
            const tsQuery = trimmed
                .split(/\s+/)
                .filter(Boolean)
                .map(w => `${w.replace(/[^a-zA-Z0-9]/g, '')}:*`)
                .join(' & ')
            if (tsQuery) {
                query = query.textSearch('search_vector', tsQuery, { type: 'websearch' })
            } else {
                query = query.or(`title.ilike.%${trimmed}%,venue_name.ilike.%${trimmed}%`)
            }
        } else if (trimmed.length > 0) {
            // Short terms: trigram ilike (gin_trgm_ops index used for >= 3 chars,
            // sequential for 1-2 chars — acceptable since dataset is small at that point)
            query = query.or(`title.ilike.%${trimmed}%,venue_name.ilike.%${trimmed}%`)
        }
    }

    const { data: events, error, count } = await query

    if (error) {
        console.error('Error fetching events:', error)
        return { events: [], total: 0 }
    }

    if (!events || events.length === 0) {
        return { events: [], total: 0 }
    }

    // tickets_sold is kept in sync by the trg_sync_event_tickets_sold trigger —
    // no secondary query needed.
    return { events, total: count || 0 }
}

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; type?: string; search?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const status = params.status || 'all'
    const eventType = params.type || 'all'
    const search = params.search || ''

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Events</h1>
                    <p className="text-muted-foreground">Manage ticketed events across the platform</p>
                </div>

                <Suspense key={`${page}-${status}-${eventType}-${search}`} fallback={<SkeletonTable rows={20} />}>
                    <EventsDataWrapper page={page} status={status} eventType={eventType} search={search} />
                </Suspense>
            </div>
        </div>
    )
}

async function EventsDataWrapper({ page, status, eventType, search }: { page: number; status: string; eventType: string; search: string }) {
    const { events, total } = await getEvents(page, status, eventType, search)

    return <EventsClient events={events} currentPage={page} totalCount={total} statusFilter={status} typeFilter={eventType} searchQuery={search} />
}
