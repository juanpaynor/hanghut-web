import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Calendar, Wallet, LogOut, Briefcase } from 'lucide-react'

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

    // Check if user has an approved partner account
    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    // If no partner account or not approved, redirect
    if (!partner || partner.status !== 'approved') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md text-center space-y-4">
                    <Briefcase className="h-16 w-16 mx-auto text-primary" />
                    <h1 className="text-2xl font-bold">Partner Access Required</h1>
                    <p className="text-muted-foreground">
                        {!partner
                            ? "You don't have a partner account yet. Apply through the mobile app to become an event organizer."
                            : partner.status === 'pending'
                                ? "Your partner application is pending approval. We'll notify you once it's reviewed."
                                : "Your partner account has been rejected or suspended. Contact support for more information."}
                    </p>
                    <Button onClick={async () => {
                        'use server'
                        const supabase = await createClient()
                        await supabase.auth.signOut()
                        redirect('/login')
                    }}>
                        Back to Login
                    </Button>
                </div>
            </div>
        )
    }

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
                                <Link
                                    href="/organizer"
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                >
                                    Dashboard
                                </Link>
                                <Link
                                    href="/organizer/events"
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                >
                                    My Events
                                </Link>
                                <Link
                                    href="/organizer/payouts"
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                >
                                    Payouts
                                </Link>
                                <Link
                                    href="/organizer/settings"
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                >
                                    Settings
                                </Link>
                                {partner.slug && (
                                    <Link
                                        href={`/${partner.slug}`}
                                        target="_blank"
                                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                                    >
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
                                redirect('/login')
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
