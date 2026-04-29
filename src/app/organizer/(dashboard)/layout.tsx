import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Briefcase } from 'lucide-react'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'
import type { UserRole } from '@/lib/auth/cached'
import { OrganizerSidebar } from '@/components/organizer/organizer-sidebar'

// Role-based nav visibility matrix
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
    embed:        ['owner', 'marketing'],
    verification: ['owner'],
}

export function hasAccess(section: string, role: UserRole['role']): boolean {
    return NAV_PERMISSIONS[section]?.includes(role) ?? false
}

export default async function OrganizerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)

    if (!partner) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md text-center space-y-4">
                    <Briefcase className="h-16 w-16 mx-auto text-primary" />
                    <h1 className="text-2xl font-bold">Partner Access Required</h1>
                    <p className="text-muted-foreground">
                        You don&apos;t have a partner account. Apply to become an organizer or ask your team admin to invite you.
                    </p>
                    <Button onClick={async () => {
                        'use server'
                        const supabase = await createClient()
                        await supabase.auth.signOut()
                        redirect('/organizer/login')
                    }}>
                        Back to Login
                    </Button>
                </div>
            </div>
        )
    }

    const userRole = await getUserRole(user.id)
    const role = userRole?.role ?? 'scanner'
    const isVerified = true

    return (
        <div className="min-h-screen bg-background flex">
            {/* Sidebar */}
            <OrganizerSidebar
                role={role}
                isVerified={isVerified}
                businessName={partner.business_name}
                partnerSlug={partner.slug ?? null}
            />

            {/* Main content — offset by sidebar width on md+ */}
            <div className="flex-1 min-w-0 md:ml-56">
                {/* Mobile top bar */}
                <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-30">
                    <Link href="/organizer">
                        <div className="bg-primary px-3 py-1.5 rounded transform -rotate-1">
                            <span className="font-headline font-bold text-sm text-primary-foreground">HANGHUT</span>
                        </div>
                    </Link>
                    <span className="text-sm font-medium truncate max-w-[140px]">{partner.business_name}</span>
                </header>

                <main className="p-6 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
