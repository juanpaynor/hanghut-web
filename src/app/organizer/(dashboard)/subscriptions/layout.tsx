import { Crown } from 'lucide-react'
import { SubscriptionTabs } from '@/components/organizer/subscriptions/subscription-tabs'

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
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
