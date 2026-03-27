import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Calendar, Wallet, LogOut, Briefcase, Mail, ScanLine, ShieldCheck, Code } from 'lucide-react'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'
import type { UserRole } from '@/lib/auth/cached'

// Role-based nav visibility matrix
const NAV_PERMISSIONS: Record<string, UserRole['role'][]> = {
    dashboard: ['owner', 'manager', 'finance', 'marketing'],
    events:    ['owner', 'manager'],
    payouts:   ['owner', 'finance'],
    email:     ['owner', 'marketing'],
    team:      ['owner'],
    scanner:   ['owner', 'manager', 'scanner'],
    settings:  ['owner', 'manager'],
    developers:['owner'],
    verification: ['owner'],
}

function hasAccess(section: string, role: UserRole['role']): boolean {
    return NAV_PERMISSIONS[section]?.includes(role) ?? false
}

export default async function OrganizerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Use cached helpers — deduplicated across layout + child pages
    const { user } = await getAuthUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const partner = await getPartner(user.id)

    // If still no partner (User hasn't registered as partner yet)
    if (!partner) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md text-center space-y-4">
                    <Briefcase className="h-16 w-16 mx-auto text-primary" />
                    <h1 className="text-2xl font-bold">Partner Access Required</h1>
                    <p className="text-muted-foreground">
                        You don't have a partner account. Apply to become an organizer or ask your team admin to invite you.
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

    // Get user's role for nav visibility
    const userRole = await getUserRole(user.id)
    const role = userRole?.role ?? 'scanner' // Fallback to most restrictive

    // KYC / Verification Check — TEMPORARILY BYPASSED for smooth partner onboarding
    const isVerified = true // was: partner.kyc_status === 'verified'

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link href="/organizer" className="flex items-center gap-2">
                                <div className="bg-primary px-4 py-2 rounded transform -rotate-1">
                                    <h1 className="font-headline font-bold text-xl text-primary-foreground">
                                        HANGHUT
                                    </h1>
                                </div>
                                <span className="text-sm text-muted-foreground">Organizer</span>
                            </Link>

                            <nav className="hidden md:flex items-center gap-6">
                                {isVerified ? (
                                    <>
                                        {hasAccess('dashboard', role) && (
                                            <Link href="/organizer" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                                Dashboard
                                            </Link>
                                        )}
                                        {hasAccess('events', role) && (
                                            <Link href="/organizer/events" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                                My Events
                                            </Link>
                                        )}
                                        {hasAccess('payouts', role) && (
                                            <Link href="/organizer/payouts" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                                Payouts
                                            </Link>
                                        )}
                                        {hasAccess('email', role) && (
                                            <Link href="/organizer/marketing" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                                                Email
                                            </Link>
                                        )}
                                        {hasAccess('team', role) && (
                                            <Link href="/organizer/team" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                                Team
                                            </Link>
                                        )}
                                        {hasAccess('scanner', role) && (
                                            <Link href="/scan" target="_blank" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                                                <ScanLine className="w-4 h-4" />
                                                Scanner
                                            </Link>
                                        )}
                                        {hasAccess('settings', role) && (
                                            <Link href="/organizer/settings" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                                Settings
                                            </Link>
                                        )}
                                        {hasAccess('developers', role) && (
                                            <Link href="/organizer/developers" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1">
                                                <Code className="w-3.5 h-3.5" />
                                                Developers
                                            </Link>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-sm text-muted-foreground italic px-2">
                                        Verify account to unlock features
                                    </span>
                                )}

                                {hasAccess('verification', role) && (
                                    <Link
                                        href="/organizer/verification"
                                        className={`text-sm font-medium flex items-center gap-2 transition-colors ${!isVerified ? 'text-primary font-bold animate-pulse' : 'text-foreground hover:text-primary'}`}
                                    >
                                        <ShieldCheck className="w-4 h-4" />
                                        Verification
                                    </Link>
                                )}

                                {isVerified && partner.slug && (
                                    <Link href={`/${partner.slug}`} target="_blank" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                                        My Storefront
                                        <span className="text-[10px] leading-none">↗</span>
                                    </Link>
                                )}
                            </nav>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground hidden md:block">
                                {partner.business_name}
                            </span>
                            <form action={async () => {
                                'use server'
                                const supabase = await createClient()
                                await supabase.auth.signOut()
                                redirect('/organizer/login')
                            }}>
                                <Button variant="ghost" size="sm" type="submit">
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
        </div>
    )
}
