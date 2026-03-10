import { getAdminPopups } from '@/lib/admin/popup-actions'
import { PopupsClient } from './popups-client'

export const dynamic = 'force-dynamic'

export default async function AdminPopupsPage() {
    const { popups, error } = await getAdminPopups()

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">App Popups</h1>
                <p className="text-slate-500">
                    Manage the forceful "News & Announcements" popups that appear when users open the mobile app.
                </p>
            </div>

            {error ? (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                    <p className="font-medium">Failed to load popups</p>
                    <p className="text-sm">{error}</p>
                </div>
            ) : (
                <PopupsClient initialPopups={popups} />
            )}
        </div>
    )
}
