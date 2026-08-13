import { getPlatformReferralStats, type PlatformReferralStat } from '@/lib/admin/referral-actions'
import { PlatformReferralManager } from '@/components/admin/platform-referral-manager'

export const dynamic = 'force-dynamic'

/**
 * Admin → Referrals. HangHut-owned influencer links that drive partner signups.
 * Each link tracks clicks, app-download taps (proxy for installs), and the
 * partner accounts that registered carrying its ref.
 */
export default async function AdminReferralsPage() {
    const res = await getPlatformReferralStats()
    const links = ('links' in res ? res.links : []) as PlatformReferralStat[]
    const baseUrl = `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'}`

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
                <p className="text-slate-500 mt-1">
                    HangHut influencer links. Track clicks, app-download taps, and partner signups per influencer.
                </p>
            </div>
            <PlatformReferralManager baseUrl={baseUrl} initialLinks={links} />
        </div>
    )
}
