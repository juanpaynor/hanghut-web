import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { AuditClient } from './audit-client'

export const dynamic = 'force-dynamic'

async function getAuditActions({
    searchParams,
}: {
    searchParams: { page?: string; action_type?: string }
}) {
    const supabase = await createClient()

    const page = Number(searchParams.page) || 1
    const pageSize = 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    //  Build query
    let query = supabase
        .from('admin_actions')
        .select(`
      *,
      admin:admin_id (
        id,
        display_name
      ),
      target_user:target_user_id (
        id,
        display_name
      )
    `, { count: 'exact' })
        .order('created_at', { ascending: false })

    // Apply filters
    if (searchParams.action_type && searchParams.action_type !== 'all') {
        query = query.eq('action_type', searchParams.action_type)
    }

    const { data: actions, error, count } = await query.range(from, to)

    if (error) {
        console.error('Error fetching audit actions:', error)
        return {
            actions: [],
            totalCount: 0,
            currentPage: page,
            totalPages: 0,
        }
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0

    return {
        actions: actions || [],
        totalCount: count || 0,
        currentPage: page,
        totalPages,
    }
}

export default async function AuditLogPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; action_type?: string }>
}) {
    const resolvedParams = await searchParams

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Audit Log</h1>
                    <p className="text-slate-400">Track all admin actions and moderation history</p>
                </div>

                <Suspense
                    key={JSON.stringify(resolvedParams)}
                    fallback={<SkeletonTable rows={20} />}
                >
                    <AuditDataWrapper searchParams={resolvedParams} />
                </Suspense>
            </div>
        </div>
    )
}

async function AuditDataWrapper({
    searchParams,
}: {
    searchParams: { page?: string; action_type?: string }
}) {
    const data = await getAuditActions({ searchParams })
    return <AuditClient {...data} />
}
