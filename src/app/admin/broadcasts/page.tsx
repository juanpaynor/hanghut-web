import { getBroadcasts } from '@/lib/admin/broadcast-actions'
import { BroadcastsClient } from './broadcasts-client'

export const dynamic = 'force-dynamic'

export default async function AdminBroadcastsPage() {
    const { broadcasts, total } = await getBroadcasts()

    return (
        <div className="p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Push Broadcasts</h1>
                <p className="text-slate-500 mt-1">
                    Send push notifications to app users via Firebase Cloud Messaging.
                </p>
            </div>
            <BroadcastsClient initialBroadcasts={broadcasts} initialTotal={total} />
        </div>
    )
}
