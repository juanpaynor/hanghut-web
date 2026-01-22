import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { ReportsClient } from './reports-client'
import { getReports } from '@/lib/supabase/queries'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; search?: string }>
}) {
    const resolvedParams = await searchParams
    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Reports</h1>
                    <p className="text-slate-400">Manage user reports and moderation</p>
                </div>

                <Suspense
                    key={JSON.stringify(resolvedParams)}
                    fallback={<SkeletonTable rows={20} />}
                >
                    <ReportsDataWrapper searchParams={resolvedParams} />
                </Suspense>
            </div>
        </div>
    )
}

async function ReportsDataWrapper({
    searchParams,
}: {
    searchParams: { page?: string; status?: string; search?: string }
}) {
    const supabase = await createClient()
    const page = Number(searchParams.page) || 1

    const data = await getReports(
        supabase,
        page,
        20,
        searchParams.status,
        searchParams.search
    )

    return <ReportsClient {...data} />
}
