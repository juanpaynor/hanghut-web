import { PlatformCampaignComposer } from '@/components/admin/platform-campaign-composer'

export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Marketing — HangHut Admin',
}

export default function AdminMarketingPage() {
    return (
        <div className="p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Marketing</h1>
                <p className="mt-1 text-slate-500">
                    Email HangHut&apos;s own audience — people who bought a ticket here or hold an account.
                </p>
            </div>
            <PlatformCampaignComposer />
        </div>
    )
}
