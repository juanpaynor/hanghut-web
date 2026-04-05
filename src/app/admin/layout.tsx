import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminNav } from '@/components/admin/admin-nav'
import type { AdminRole } from '@/components/admin/admin-nav'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        redirect('/login')
    }

    // Check if user is admin — now returns role string or null
    const { data: adminRole, error: userError } = await supabase
        .rpc('is_user_admin')

    if (userError || !adminRole) {
        redirect('/login')
    }

    // 2FA enforcement: check mfa_verified_at within 8 hours
    const mfaVerifiedAt = user.app_metadata?.mfa_verified_at
    const EIGHT_HOURS = 8 * 60 * 60 * 1000

    if (!mfaVerifiedAt || Date.now() - new Date(mfaVerifiedAt).getTime() > EIGHT_HOURS) {
        // Allow access to the verify page itself
        // The verify page is at /admin/verify — handled by its own route
        // We check the URL in the middleware instead — for now, redirect
        redirect('/verify')
    }

    return (
        <div className="min-h-screen bg-gray-50 text-slate-900 light" data-theme="light" style={{ colorScheme: 'light' }}>
            <div className="flex min-h-screen">
                {/* Sidebar */}
                <aside className="w-64 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shadow-sm z-30">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-2">
                        <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-foreground font-bold">A</div>
                        <Link href="/admin" className="text-xl font-bold tracking-tight text-slate-900">
                            HangHut
                        </Link>
                    </div>
                    <AdminNav adminRole={adminRole as AdminRole} />
                </aside>

                {/* Main content */}
                <main className="flex-1 overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    )
}
