'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, UsersRound, Shield, ScrollText, Ticket, LogOut, MapPin, AlertTriangle, Briefcase, CalendarDays, Wallet, Sparkles, Mail, Megaphone, Smartphone, Bell, Armchair } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'finance_admin'

// Role-based nav visibility
const NAV_PERMISSIONS: Record<string, AdminRole[]> = {
    '/admin':             ['super_admin', 'admin', 'support', 'finance_admin'],
    '/admin/verifications': ['super_admin', 'admin'],
    '/admin/partners':    ['super_admin', 'admin', 'support', 'finance_admin'],
    '/admin/events':      ['super_admin', 'admin', 'support', 'finance_admin'],
    '/admin/experiences': ['super_admin', 'admin'],
    '/admin/venue-templates': ['super_admin', 'admin'],
    '/admin/accounting':  ['super_admin', 'admin', 'finance_admin'],
    '/admin/users':       ['super_admin', 'admin', 'support'],
    '/admin/reports':     ['super_admin', 'admin', 'support'],
    '/admin/tables':      ['super_admin', 'admin', 'support'],
    '/admin/tickets':     ['super_admin', 'admin', 'support'],
    '/admin/audit':       ['super_admin', 'admin', 'finance_admin'],
    '/admin/waitlist':    ['super_admin', 'admin'],
    '/admin/popups':      ['super_admin', 'admin'],
    '/admin/releases':    ['super_admin', 'admin'],
    '/admin/broadcasts':  ['super_admin', 'admin'],
    '/admin/team':        ['super_admin'],
}

const navItems = [
    {
        title: 'Dashboard',
        href: '/admin',
        icon: LayoutDashboard,
    },
    {
        title: 'Verifications',
        href: '/admin/verifications',
        icon: Shield,
    },
    {
        title: 'Partners',
        href: '/admin/partners',
        icon: Briefcase,
    },
    {
        title: 'Events',
        href: '/admin/events',
        icon: CalendarDays,
    },
    {
        title: 'Experiences',
        href: '/admin/experiences',
        icon: Sparkles,
    },
    {
        title: 'Venue Templates',
        href: '/admin/venue-templates',
        icon: Armchair,
    },
    {
        title: 'Accounting',
        href: '/admin/accounting',
        icon: Wallet,
    },
    {
        title: 'Users',
        href: '/admin/users',
        icon: Users,
    },
    {
        title: 'Reports',
        href: '/admin/reports',
        icon: AlertTriangle,
    },
    {
        title: 'Tables',
        href: '/admin/tables',
        icon: MapPin,
    },
    {
        title: 'Support Tickets',
        href: '/admin/tickets',
        icon: Ticket,
    },
    {
        title: 'Audit Log',
        href: '/admin/audit',
        icon: ScrollText,
    },
    {
        title: 'Waitlist',
        href: '/admin/waitlist',
        icon: Mail,
    },
    {
        title: 'App Popups',
        href: '/admin/popups',
        icon: Megaphone,
    },
    {
        title: 'App Releases',
        href: '/admin/releases',
        icon: Smartphone,
    },
    {
        title: 'Push Broadcasts',
        href: '/admin/broadcasts',
        icon: Bell,
    },
    {
        title: 'Admin Team',
        href: '/admin/team',
        icon: UsersRound,
    },
]

interface AdminNavProps {
    adminRole: AdminRole
}

export function AdminNav({ adminRole }: AdminNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    // Filter nav items based on role
    const visibleItems = navItems.filter(item => {
        const allowedRoles = NAV_PERMISSIONS[item.href]
        return allowedRoles?.includes(adminRole) ?? false
    })

    return (
        <nav className="flex-1 flex flex-col">
            <div className="flex-1 py-4 px-3 space-y-1">
                {visibleItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                    const Icon = item.icon

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all',
                                isActive
                                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            )}
                        >
                            <Icon className={cn("h-5 w-5", isActive ? "text-indigo-600" : "text-slate-400")} />
                            {item.title}
                        </Link>
                    )
                })}
            </div>

            <div className="p-4 border-t border-slate-100">
                <div className="mb-2 px-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        {adminRole.replace('_', ' ')}
                    </span>
                </div>
                <Button
                    onClick={handleLogout}
                    variant="ghost"
                    className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50"
                >
                    <LogOut className="h-5 w-5 mr-3" />
                    Logout
                </Button>
            </div>
        </nav>
    )
}
