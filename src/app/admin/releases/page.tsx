import { getApkReleases } from '@/lib/admin/apk-actions'
import { ReleasesClient } from './releases-client'

export const dynamic = 'force-dynamic'

export default async function AdminReleasesPage() {
    const { releases, total } = await getApkReleases()

    return (
        <div className="p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">App Releases</h1>
                <p className="text-slate-500 mt-1">
                    Upload and manage Android APK releases for direct distribution.
                </p>
            </div>
            <ReleasesClient initialReleases={releases} initialTotal={total} />
        </div>
    )
}
