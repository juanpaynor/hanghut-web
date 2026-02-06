import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Calendar, Wallet, LogOut, Briefcase, Mail, ScanLine, ShieldCheck } from 'lucide-react'

export default async function OrganizerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    // Check if user is a direct partner (Owner)
    let { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    // If not direct owner, check if they are a team member
    if (!partner) {
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('partner_id, partners(*)')
            .eq('user_id', user.id)
            .single()

        if (teamMember && teamMember.partners) {
            // @ts-ignore
            partner = teamMember.partners
        }
    }

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

    // KYC / Verification Check
    // We allow access if status is 'approved' OR if they are in the verification process
    const isVerified = partner.kyc_status === 'verified' // OR partner.status === 'approved' (legacy)
    // Note: We use 'verified' as the gatekeeper now.

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
                                        <Link href="/organizer" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                            Dashboard
                                        </Link>
                                        <Link href="/organizer/events" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                            My Events
                                        </Link>
                                        <Link href="/organizer/payouts" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                            Payouts
                                        </Link>
                                        <Link href="/organizer/marketing" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                                            Email
                                        </Link>
                                        <Link href="/organizer/team" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                            Team
                                        </Link>
                                        <Link href="/scan" target="_blank" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                                            <ScanLine className="w-4 h-4" />
                                            Scanner
                                        </Link>
                                        <Link href="/organizer/settings" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                            Settings
                                        </Link>
                                    </>
                                ) : (
                                    <span className="text-sm text-muted-foreground italic px-2">
                                        Verify account to unlock features
                                    </span>
                                )}

                                <Link
                                    href="/organizer/verification"
                                    className={`text-sm font-medium flex items-center gap-2 transition-colors ${!isVerified ? 'text-primary font-bold animate-pulse' : 'text-foreground hover:text-primary'}`}
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    Verification
                                </Link>

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
                {/* 
                   If not verified, we can restrict content here too, 
                   but usually better to let the page handle it or redirect.
                   For now, we just unlocked the layout so they can SEE the nav to click Verification.
                */}
                {children}
            </main>
        </div>
    )
}
