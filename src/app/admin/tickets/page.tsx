import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { TicketsClient } from './tickets-client'
import { SkeletonTable } from '@/components/admin/skeleton-table'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 20

async function getTickets(page: number, status?: string, type?: string, search?: string) {
    const supabase = await createClient()

    // Calculate range for pagination
    const from = (page - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    // Build query
    let query = supabase
        .from('support_tickets')
        .select(`
      *,
      admin:admin_id (
        display_name
      )
    `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

    // Add filters
    if (status && status !== 'all') {
        query = query.eq('status', status)
    }

    if (type && type !== 'all') {
        query = query.eq('ticket_type', type)
    }

    if (search) {
        query = query.or(`subject.ilike.%${search}%,user_display_name.ilike.%${search}%,user_email.ilike.%${search}%`)
    }

    const { data: tickets, error, count } = await query

    if (error) {
        console.error('Error fetching tickets:', error)
        return { tickets: [], total: 0 }
    }

    return { tickets: tickets || [], total: count || 0 }
}

export default async function TicketsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; type?: string; search?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const status = params.status || 'all'
    const type = params.type || 'all'
    const search = params.search || ''

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Support Tickets</h1>
                    <p className="text-slate-400">Manage user appeals and support requests</p>
                </div>

                <Suspense key={`${page}-${status}-${type}-${search}`} fallback={<SkeletonTable rows={20} />}>
                    <TicketsDataWrapper page={page} status={status} type={type} search={search} />
                </Suspense>
            </div>
        </div>
    )
}

async function TicketsDataWrapper({ page, status, type, search }: { page: number; status: string; type: string; search: string }) {
    const { tickets, total } = await getTickets(page, status, type, search)

    return <TicketsClient tickets={tickets} currentPage={page} totalCount={total} statusFilter={status} typeFilter={type} searchQuery={search} />
}
