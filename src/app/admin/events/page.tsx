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
        query = query.or(`title.ilike.%${search}%,venue_name.ilike.%${search}%`)
    }

    const { data: events, error, count } = await query

    if (error) {
        console.error('Error fetching events:', error)
        return { events: [], total: 0 }
    }

    // [SMART SCALING FIX] Manually count sold tickets
    const eventsWithCounts = await Promise.all((events || []).map(async (event) => {
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .neq('status', 'available')

        return {
            ...event,
            tickets_sold: count || 0
        }
    }))

    return { events: eventsWithCounts || [], total: count || 0 }
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
                    <p className="text-slate-400">Manage ticketed events across the platform</p>
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
