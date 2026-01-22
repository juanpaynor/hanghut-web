import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminNav } from '@/components/admin/admin-nav'

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

    // Check if user is admin using RPC function
    const { data: isAdmin, error: userError } = await supabase
        .rpc('is_user_admin')

    if (userError || !isAdmin) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            <div className="flex min-h-screen">
                {/* Sidebar */}
                <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col sticky top-0 h-screen">
                    <div className="p-6 border-b border-slate-700">
                        <Link href="/admin" className="text-xl font-bold">
                            HangHut Admin
                        </Link>
                    </div>
                    <AdminNav />
                </aside>

                {/* Main content */}
                <main className="flex-1">
                    {children}
                </main>
            </div>
        </div>
    )
}
