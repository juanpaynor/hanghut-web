'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
    { label: 'Tiers',       href: '/organizer/subscriptions' },
    { label: 'Subscribers', href: '/organizer/subscriptions/subscribers' },
    { label: 'Posts',       href: '/organizer/subscriptions/posts' },
    { label: 'Claims',      href: '/organizer/subscriptions/claims' },
    { label: 'Analytics',   href: '/organizer/subscriptions/analytics' },
]

export function SubscriptionTabs() {
    const pathname = usePathname()

    return (
        <div className="flex gap-1 border-b border-border mb-8">
            {TABS.map(tab => {
                const isActive = tab.href === '/organizer/subscriptions'
                    ? pathname === '/organizer/subscriptions'
                    : pathname.startsWith(tab.href)

                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                            isActive
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        )}
                    >
                        {tab.label}
                    </Link>
                )
            })}
        </div>
    )
}
