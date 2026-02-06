import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { UsersClient } from './users-client'

export const dynamic = 'force-dynamic'

// Move data fetching logic outside component to avoid prop drilling issues if needed
// but here we just need to fix the params awaiting.

async function UsersData({
    searchParams,
}: {
    searchParams: { page?: string; search?: string }
}) {
    const supabase = await createClient()

    const page = Number(searchParams.page) || 1
    const pageSize = 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query
    let query = supabase
        .from('users')
        .select(`
      *,
      user_photos (
        photo_url
      )
    `, { count: 'exact' })
        .order('created_at', { ascending: false })

    if (searchParams.search) {
        query = query.ilike('display_name', `%${searchParams.search}%`)
    }

    const { data: users, error, count } = await query.range(from, to)

    if (error) {
        console.error('Error fetching users:', error)
        return {
            users: [],
            totalCount: 0,
            currentPage: page,
            totalPages: 0,
        }
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0

    return {
        users: users || [],
        totalCount: count || 0,
        currentPage: page,
        totalPages,
    }
}

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>
}) {
    const resolvedParams = await searchParams

    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Users</h1>
                    <p className="text-muted-foreground">Manage user accounts and view profiles</p>
                </div>

                <Suspense
                    key={JSON.stringify(resolvedParams)}
                    fallback={<SkeletonTable rows={20} />}
                >
                    <UsersDataWrapper searchParams={resolvedParams} />
                </Suspense>
            </div>
        </div>
    )
}

async function UsersDataWrapper({
    searchParams,
}: {
    searchParams: { page?: string; search?: string }
}) {
    const data = await UsersData({ searchParams })
    return <UsersClient {...data} />
}
