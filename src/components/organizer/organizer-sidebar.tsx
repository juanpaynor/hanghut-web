'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard, CalendarDays, Wallet, Mail, Users, ScanLine,
    Settings, Code2, ShieldCheck, ExternalLink, LogOut, Megaphone,
    MousePointerClick,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/auth/cached'

interface NavItem {
    label: string
    href: string
    icon: React.ElementType
    section: string
    external?: boolean
    pulse?: boolean
}

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
    {
        items: [
            { label: 'Dashboard',    href: '/organizer',               icon: LayoutDashboard, section: 'dashboard' },
            { label: 'My Events',    href: '/organizer/events',        icon: CalendarDays,    section: 'events' },
        ],
    },
    {
        title: 'Money',
        items: [
            { label: 'Payouts',      href: '/organizer/payouts',       icon: Wallet,          section: 'payouts' },
            { label: 'Advertising',  href: '/organizer/advertising',   icon: MousePointerClick, section: 'advertising' },
        ],
    },
    {
        title: 'Audience',
        items: [
            { label: 'Email',        href: '/organizer/marketing',     icon: Mail,            section: 'email' },
        ],
    },
    {
        title: 'Team',
        items: [
            { label: 'Team',         href: '/organizer/team',          icon: Users,           section: 'team' },
            { label: 'Scanner',      href: '/scan',                    icon: ScanLine,        section: 'scanner', external: true },
        ],
    },
    {
        title: 'Account',
        items: [
            { label: 'Settings',     href: '/organizer/settings',      icon: Settings,        section: 'settings' },
            { label: 'Developers',   href: '/organizer/developers',    icon: Code2,           section: 'developers' },
            { label: 'Verification', href: '/organizer/verification',  icon: ShieldCheck,     section: 'verification' },
        ],
    },
]

const NAV_PERMISSIONS: Record<string, UserRole['role'][]> = {
    dashboard:    ['owner', 'manager', 'finance', 'marketing'],
    events:       ['owner', 'manager'],
    payouts:      ['owner', 'finance'],
    advertising:  ['owner', 'finance'],
    email:        ['owner', 'marketing'],
    team:         ['owner'],
    scanner:      ['owner', 'manager', 'scanner'],
    settings:     ['owner', 'manager'],
    developers:   ['owner'],
    verification: ['owner'],
}

interface Props {
    role: UserRole['role']
    isVerified: boolean
    businessName: string
    partnerSlug: string | null
}

export function OrganizerSidebar({ role, isVerified, businessName, partnerSlug }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    function canSee(section: string) {
        return NAV_PERMISSIONS[section]?.includes(role) ?? false
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        router.push('/organizer/login')
        router.refresh()
    }

    return (
        <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-card border-r border-border z-40">
            {/* Logo */}
            <div className="px-4 py-5 border-b border-border shrink-0">
                <Link href="/organizer" className="flex items-center gap-2">
                    <div className="bg-primary px-3 py-1.5 rounded transform -rotate-1">
                        <span className="font-headline font-bold text-sm text-primary-foreground tracking-wide">HANGHUT</span>
                    </div>
                </Link>
                <p className="text-xs text-muted-foreground mt-2 truncate font-medium">{businessName}</p>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
                {NAV_GROUPS.map((group, gi) => {
                    const visibleItems = group.items.filter(item =>
                        canSee(item.section) && (isVerified || item.section === 'verification')
                    )
                    if (visibleItems.length === 0) return null

                    return (
                        <div key={gi}>
                            {group.title && (
                                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                    {group.title}
                                </p>
                            )}
                            <div className="space-y-0.5">
                                {visibleItems.map(item => {
                                    const Icon = item.icon
                                    const isActive = item.href === '/organizer'
                                        ? pathname === '/organizer'
                                        : pathname?.startsWith(item.href)

                                    if (item.external) {
                                        return (
                                            <a
                                                key={item.href}
                                                href={item.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                            >
                                                <Icon className="h-4 w-4 shrink-0" />
                                                {item.label}
                                                <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                                            </a>
                                        )
                                    }

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                                                isActive
                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                            )}
                                        >
                                            <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                                            {item.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}

                {/* My Storefront external link */}
                {isVerified && partnerSlug && (
                    <div>
                        <a
                            href={`https://${partnerSlug}.hanghut.com`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors"
                        >
                            <ExternalLink className="h-4 w-4 shrink-0" />
                            My Storefront
                        </a>
                    </div>
                )}
            </nav>

            {/* Footer */}
            <div className="px-2 py-3 border-t border-border shrink-0">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 px-2 py-2 w-full rounded-md text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Logout
                </button>
            </div>
        </aside>
    )
}
