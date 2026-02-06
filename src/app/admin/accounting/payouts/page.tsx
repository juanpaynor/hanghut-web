import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SkeletonTable } from '@/components/admin/skeleton-table'
import { PayoutsClient } from './payouts-client'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getPendingPayouts() {
    const supabase = await createClient()

    const { data: payouts } = await supabase
        .from('payouts')
        .select(`
      *,
      partner:partners(
        id,
        business_name,
        user:users!partners_user_id_fkey(
          display_name,
          email
        )
      )
    `)
        .in('status', ['pending_request', 'approved'])
        .order('requested_at', { ascending: true })

    return payouts || []
}

export default async function PayoutsPage() {
    return (
        <div className="p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <Link
                        href="/admin/accounting"
                        className="text-blue-500 hover:text-blue-400 text-sm mb-4 inline-block"
                    >
                        ← Back to Accounting
                    </Link>
                    <h1 className="text-4xl font-bold mb-2">Payout Requests</h1>
                    <p className="text-slate-400">Review and approve partner payout requests</p>
                </div>

                <Suspense fallback={<SkeletonTable rows={10} />}>
                    <PayoutsWrapper />
                </Suspense>
            </div>
        </div>
    )
}

async function PayoutsWrapper() {
    const payouts = await getPendingPayouts()

    return <PayoutsClient payouts={payouts} />
}
