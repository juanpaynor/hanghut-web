import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { TablesClient } from './tables-client'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 20

async function getTables(page: number, search?: string) {
    const supabase = await createClient()

    // Calculate range for pagination
    const from = (page - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    // Build query
    let query = supabase
        .from('tables')
        .select('*', { count: 'exact' })
        .order('datetime', { ascending: false })
        .range(from, to)

    // Add search filter if provided
    if (search) {
        query = query.or(`title.ilike.%${search}%,location_name.ilike.%${search}%`)
    }

    const { data: tables, error, count } = await query

    if (error) {
        console.error('Error fetching tables:', error)
        return { tables: [], total: 0 }
    }

    if (!tables || tables.length === 0) {
        return { tables: [], total: count || 0 }
    }

    // Get unique host IDs
    const hostIds = [...new Set(tables.map(t => t.host_id).filter(Boolean))]

    // Fetch host details
    const { data: hosts } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', hostIds)

    // Create a map of hosts
    const hostsMap = new Map(hosts?.map(h => [h.id, h]))

    // Attach host data to tables
    const tablesWithHosts = tables.map(table => ({
        ...table,
        host: hostsMap.get(table.host_id) || null
    }))

    return { tables: tablesWithHosts, total: count || 0 }
}

export default async function TablesPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const search = params.search || ''

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Tables / Events</h1>
                    <p className="text-muted-foreground">View all dining events and tables</p>
                </div>

                <Suspense key={`${page}-${search}`} fallback={<SkeletonTable rows={20} />}>
                    <TablesDataWrapper page={page} search={search} />
                </Suspense>
            </div>
        </div>
    )
}

async function TablesDataWrapper({ page, search }: { page: number; search: string }) {
    const { tables, total } = await getTables(page, search)

    return <TablesClient tables={tables} currentPage={page} totalCount={total} searchQuery={search} />
}
