import { Crown, Lock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { SubscriptionTabs } from '@/components/organizer/subscriptions/subscription-tabs'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { isSubscriptionsEnabled } from '@/lib/subscriptions/access'

export const dynamic = 'force-dynamic'

export default async function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    // Feature-gated while recurring billing is finalized. Admin unlocks per org.
    if (!(await isSubscriptionsEnabled(partnerId))) {
        return (
            <div className="mx-auto max-w-xl py-16 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Lock className="h-7 w-7 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Subscriptions are coming soon</h1>
                <p className="text-muted-foreground">
                    We&apos;re finalizing recurring memberships and rolling them out gradually.
                    This feature isn&apos;t available on your account yet — hang tight, or reach
                    out to the HangHut team if you&apos;d like early access.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
                    <Crown className="h-8 w-8 text-primary" />
                    Subscriptions
                </h1>
                <p className="text-muted-foreground">Manage your membership tiers and subscriber content</p>
            </div>

            <SubscriptionTabs />

            {children}
        </div>
    )
}
