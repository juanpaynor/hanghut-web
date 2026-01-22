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
            <div className="flex-1 py-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                    const Icon = item.icon

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 px-6 py-3 text-sm transition-colors',
                                isActive
                                    ? 'bg-slate-700 text-white border-l-4 border-blue-500'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            {item.title}
                        </Link>
                    )
                })}
            </div>

            <div className="p-4 border-t border-slate-700">
                <Button
                    onClick={handleLogout}
                    variant="ghost"
                    className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-700"
                >
                    <LogOut className="h-5 w-5 mr-3" />
                    Logout
                </Button>
            </div>
        </nav>
    )
}
