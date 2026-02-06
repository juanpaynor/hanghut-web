import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DebugPartnersPage() {
    const supabase = await createClient()

    // Check current user
    const { data: { user } } = await supabase.auth.getUser()

    // Check if user is admin
    const { data: currentUserData } = user ? await supabase
        .from('users')
        .select('id, email, is_admin, role')
        .eq('id', user.id)
        .single() : { data: null }

    // Check users table
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name')
        .order('created_at', { ascending: false })
        .limit(5)

    // Check partners table
    const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*, user:users!partners_user_id_fkey(id, email, display_name)')
        .order('created_at', { ascending: false })
        .limit(10)

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Debug: Database State</h1>

            <div className="space-y-6">
                <div className="bg-blue-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-2">Current User</h2>
                    {user ? (
                        <div>
                            <pre className="text-xs overflow-auto">{JSON.stringify(currentUserData, null, 2)}</pre>
                            <p className="mt-2 text-sm">Auth ID: {user.id}</p>
                        </div>
                    ) : (
                        <p className="text-red-500">Not logged in!</p>
                    )}
                </div>

                <div className="bg-card p-4 rounded">
                    <h2 className="text-lg font-semibold mb-2">Recent Users (Last 5)</h2>
                    {usersError ? (
                        <pre className="text-red-500">{JSON.stringify(usersError, null, 2)}</pre>
                    ) : (
                        <pre className="text-xs overflow-auto">{JSON.stringify(users, null, 2)}</pre>
                    )}
                </div>

                <div className="bg-card p-4 rounded">
                    <h2 className="text-lg font-semibold mb-2">Recent Partners (Last 10)</h2>
                    {partnersError ? (
                        <pre className="text-red-500">{JSON.stringify(partnersError, null, 2)}</pre>
                    ) : (
                        <pre className="text-xs overflow-auto">{JSON.stringify(partners, null, 2)}</pre>
                    )}
                </div>
            </div>
        </div>
    )
}
