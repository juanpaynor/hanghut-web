'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard, CalendarDays, Wallet, Mail, Users, ScanLine,
    Settings, Code2, ShieldCheck, ExternalLink, LogOut, Megaphone,
    MousePointerClick, Crown, Compass, BookOpen, CalendarClock, UserSearch,
    Link2, Shirt, Store, UserCheck, Award, CreditCard, ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OrganizerThemeToggle } from '@/components/organizer/organizer-theme'
import type { UserRole } from '@/lib/auth/cached'

interface NavItem {
    label: string
    href: string
    // LucideIcon, not React.ElementType. ElementType is the union of every
    // intrinsic and component type, so `className` narrows to the intersection
    // of all their props and collapses to `never` -- which is exactly the two
    // long-standing type errors this file carried.
    icon: LucideIcon
    section: string
    external?: boolean
    capability?: 'organizer' | 'experience_host' // undefined = shown to all
}

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
    {
        items: [
            { label: 'Dashboard',    href: '/organizer',               icon: LayoutDashboard, section: 'dashboard' },
            { label: 'My Events',    href: '/organizer/events',        icon: CalendarDays,    section: 'events',       capability: 'organizer' },
            { label: 'Merch',        href: '/organizer/merch',         icon: Shirt,           section: 'merch',        capability: 'organizer' },
        ],
    },
    {
        title: 'Experiences',
        items: [
            { label: 'My Experiences', href: '/organizer/experiences',          icon: Compass,       section: 'experiences',  capability: 'experience_host' },
            { label: 'Bookings',       href: '/organizer/experiences/bookings', icon: BookOpen,      section: 'exp_bookings', capability: 'experience_host' },
            { label: 'Calendar',       href: '/organizer/experiences/calendar', icon: CalendarClock, section: 'exp_calendar', capability: 'experience_host' },
        ],
    },
    {
        title: 'Money',
        items: [
            { label: 'Payouts',      href: '/organizer/payouts',       icon: Wallet,            section: 'payouts' },
            { label: 'Advertising',  href: '/organizer/advertising',   icon: MousePointerClick, section: 'advertising', capability: 'organizer' },
        ],
    },
    {
        title: 'Audience',
        items: [
            { label: 'Customers',      href: '/organizer/customers',      icon: UserSearch, section: 'customers',     capability: 'organizer' },
            { label: 'Email',          href: '/organizer/marketing',      icon: Mail,  section: 'email',          capability: 'organizer' },
            { label: 'Referrals',      href: '/organizer/referrals',      icon: Link2, section: 'referrals',      capability: 'organizer' },
            { label: 'Subscriptions',  href: '/organizer/subscriptions',  icon: Crown, section: 'subscriptions',  capability: 'organizer' },
            { label: 'Badges',         href: '/organizer/badges',         icon: Award, section: 'badges',         capability: 'organizer' },
        ],
    },
    {
        title: 'Team',
        items: [
            { label: 'Team',    href: '/organizer/team', icon: Users,   section: 'team' },
            { label: 'Scanner',    href: '/scan',        icon: ScanLine, section: 'scanner', external: true },
            { label: 'Box office', href: '/box-office',  icon: Store,    section: 'box-office', external: true },
            // Self-service door desk. Sits with the other door tools rather than
            // under Events: the people who open it are working a shift, not
            // managing a listing, and often have no dashboard access at all.
            { label: 'Check-in desk', href: '/checkin', icon: UserCheck, section: 'checkin', external: true },
        ],
    },
    {
        title: 'Account',
        items: [
            { label: 'Settings',     href: '/organizer/settings',      icon: Settings,   section: 'settings' },
            { label: 'Billing',      href: '/organizer/settings/billing', icon: CreditCard, section: 'billing' },
            { label: 'Developers',   href: '/organizer/developers',    icon: Code2,      section: 'developers', capability: 'organizer' },
            { label: 'Verification', href: '/organizer/verification',  icon: ShieldCheck, section: 'verification' },
        ],
    },
]

const NAV_PERMISSIONS: Record<string, UserRole['role'][]> = {
    dashboard:     ['owner', 'manager', 'finance', 'marketing'],
    events:        ['owner', 'manager'],
    merch:         ['owner', 'manager'],
    experiences:   ['owner', 'manager'],
    exp_bookings:  ['owner', 'manager'],
    exp_calendar:  ['owner', 'manager'],
    payouts:       ['owner', 'finance'],
    advertising:   ['owner', 'finance'],
    customers:     ['owner', 'manager', 'marketing'],
    email:         ['owner', 'marketing'],
    referrals:     ['owner', 'manager', 'marketing'],
    badges:        ['owner', 'manager', 'marketing'],
    subscriptions: ['owner', 'manager'],
    team:          ['owner'],
    scanner:       ['owner', 'manager', 'scanner', 'cashier'],
    'box-office':  ['owner', 'manager', 'scanner', 'cashier'],
    checkin:       ['owner', 'manager', 'scanner', 'cashier'],
    settings:      ['owner', 'manager'],
    // Owner only, matching the page and the edge function: committing the
    // business to a recurring charge is not a delegated action.
    billing:       ['owner'],
    developers:    ['owner'],
    embed:         ['owner', 'marketing'],
    verification:  ['owner'],
}

interface Props {
    role: UserRole['role']
    isVerified: boolean
    businessName: string
    partnerSlug: string | null
    storefrontUrl?: string | null
    capabilities?: string[]
    subscriptionsEnabled?: boolean
    merchEnabled?: boolean
}

export function OrganizerSidebar({ role, isVerified, businessName, partnerSlug, storefrontUrl, capabilities = ['organizer'], subscriptionsEnabled = false, merchEnabled = false }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    /**
     * The nav scrolls, and nothing said so.
     *
     * A fully enabled owner has 22 nav items plus a storefront link. On a
     * laptop viewport that runs several hundred pixels past the fold, and
     * macOS draws overlay scrollbars -- invisible until you are already
     * scrolling. So the entire Account group (Settings, Billing, Developers,
     * Embed Widget, Verification) was off-screen with no indication it
     * existed, and partners reported exactly that.
     *
     * Both ends are tracked so the affordances only show when there is really
     * something hidden; on a short list, or a role that sees four items, none
     * of this appears at all.
     */
    const navRef = useRef<HTMLElement>(null)
    const [overflow, setOverflow] = useState({ up: false, down: false })

    const measure = useCallback(() => {
        const el = navRef.current
        if (!el) return
        const { scrollTop, scrollHeight, clientHeight } = el
        const up = scrollTop > 4
        // 4px of slack: sub-pixel layout can leave scrollHeight a hair above
        // clientHeight permanently, which would pin the cue on screen forever
        // on a list that does not actually scroll.
        const down = scrollTop + clientHeight < scrollHeight - 4
        // Scroll fires continuously; only re-render when the answer changes.
        setOverflow(prev => (prev.up === up && prev.down === down) ? prev : { up, down })
    }, [])

    useEffect(() => {
        const el = navRef.current
        if (!el) return
        measure()
        // Observe the children too: groups appear and disappear with role and
        // capability, so the scrollable height changes without a window resize.
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        for (const child of Array.from(el.children)) ro.observe(child)
        window.addEventListener('resize', measure)
        return () => {
            ro.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [measure])

    const scrollDown = useCallback(() => {
        const el = navRef.current
        if (!el) return
        el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' })
    }, [])

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

            {/* Nav groups, in a relative shell so the scroll affordances can
                sit over the list rather than take space from it. */}
            <div className="relative flex-1 min-h-0">
            <nav
                ref={navRef}
                onScroll={measure}
                className="always-scrollbar h-full overflow-y-auto py-3 px-2 space-y-3"
            >
                {NAV_GROUPS.map((group, gi) => {
                    const visibleItems = group.items.filter(item =>
                        canSee(item.section) &&
                        (isVerified || item.section === 'verification') &&
                        (!item.capability || capabilities.includes(item.capability)) &&
                        // Subscriptions are feature-gated per partner while recurring is finalized
                        (item.section !== 'subscriptions' || subscriptionsEnabled) &&
                        // Merch is admin-enabled per partner (controlled rollout)
                        (item.section !== 'merch' || merchEnabled)
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
                                    // /organizer is a prefix of every other item, so it alone
                                    // must match exactly or it would highlight everywhere.
                                    // Everything else prefix-matches, which keeps the parent
                                    // lit on its own child routes (Developers → /developers/embed).
                                    const exactMatch = item.href === '/organizer'
                                    const isActive = exactMatch
                                        ? pathname === item.href
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
                {isVerified && (storefrontUrl || partnerSlug) && (
                    <div>
                        <a
                            href={
                                storefrontUrl ??
                                (typeof window !== 'undefined' && window.location.hostname === 'localhost'
                                    ? `/${partnerSlug}`
                                    : `https://${partnerSlug}.hanghut.com`)
                            }
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

            {/* Top edge, once you have scrolled: tells you the list began
                above, instead of looking like it starts here. */}
            <div
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-card to-transparent transition-opacity duration-200',
                    overflow.up ? 'opacity-100' : 'opacity-0'
                )}
            />

            {/* Bottom edge plus an actual button. A fade on its own is too
                polite for the problem we have -- partners were not failing to
                notice a subtle gradient, they did not know the region scrolled
                at all. This says there is more AND takes you there. */}
            <div
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/85 to-transparent transition-opacity duration-200',
                    overflow.down ? 'opacity-100' : 'opacity-0'
                )}
            />
            <button
                type="button"
                onClick={scrollDown}
                tabIndex={overflow.down ? 0 : -1}
                aria-hidden={!overflow.down}
                className={cn(
                    'absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-xs transition-all duration-200 hover:border-primary/40 hover:text-foreground',
                    overflow.down ? 'opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
                )}
            >
                More
                <ChevronDown className="h-3 w-3" />
            </button>
            </div>

            {/* Footer */}
            <div className="px-2 py-3 border-t border-border shrink-0 space-y-2">
                <OrganizerThemeToggle />
                <button
                    onClick={handleLogout}
                    /* bg-red-50 is a near-white wash -- fine on a light sidebar,
                       a glaring panel on a dark one. An alpha tint of the same
                       red reads correctly on both grounds. */
                    className="flex items-center gap-2.5 px-2 py-2 w-full rounded-md text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Logout
                </button>
            </div>
        </aside>
    )
}
