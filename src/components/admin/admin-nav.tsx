'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Shield, ScrollText, Ticket, LogOut, MapPin, AlertTriangle, Briefcase, CalendarDays, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

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
]

export function AdminNav() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <nav className="flex-1 flex flex-col">
            <div className="flex-1 py-4 px-3 space-y-1">
                {navItems.map((item) => {
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
