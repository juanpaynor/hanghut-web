import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { PartnersClient } from './partners-client'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 20

async function getPartners(page: number, status?: string, search?: string) {
    const supabase = await createClient()

    // Calculate range for pagination
    const from = (page - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    // Build query
    let query = supabase
        .from('partners')
        .select(`
      *,
      user:users!partners_user_id_fkey(
        id,
        display_name,
        email
      )
    `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

    // Add filters
    if (status && status !== 'all') {
        query = query.eq('status', status)
    }

    if (search) {
        query = query.or(`business_name.ilike.%${search}%`)
    }

    const { data: partners, error, count } = await query

    if (error) {
        console.error('Error fetching partners:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return { partners: [], total: 0 }
    }

    return { partners: partners || [], total: count || 0 }
}

export default async function PartnersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; search?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const status = params.status || 'all'
    const search = params.search || ''

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Event Partners</h1>
                    <p className="text-slate-400">Manage event organizer applications and partnerships</p>
                </div>

                <Suspense key={`${page}-${status}-${search}`} fallback={<SkeletonTable rows={20} />}>
                    <PartnersDataWrapper page={page} status={status} search={search} />
                </Suspense>
            </div>
        </div>
    )
}

async function PartnersDataWrapper({ page, status, search }: { page: number; status: string; search: string }) {
    const { partners, total } = await getPartners(page, status, search)

    return <PartnersClient partners={partners} currentPage={page} totalCount={total} statusFilter={status} searchQuery={search} />
}
