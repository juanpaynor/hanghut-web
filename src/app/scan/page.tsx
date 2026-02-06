import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WebScanner } from '@/components/scanner/web-scanner'

export default async function ScanPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
        redirect('/login?next=/scan')
    }

    // 1. Get ALL Partner IDs this user has access to
    // (Both as Owner and as Team Member)

    const partnerIds: string[] = []

    // Check Owner
    const { data: ownedPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

    if (ownedPartner) {
        partnerIds.push(ownedPartner.id)
    }

    // Check Team Membership
    const { data: teamMemberships } = await supabase
        .from('partner_team_members')
        .select('partner_id')
        .eq('user_id', session.user.id)

    if (teamMemberships) {
        teamMemberships.forEach(tm => partnerIds.push(tm.partner_id))
    }

    // If no access found
    if (partnerIds.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
                    <h1 className="text-xl font-bold text-red-600 mb-2">Access Denied</h1>
                    <p className="text-slate-600">
                        You do not appear to be an organizer or team member for any event partners.
                    </p>
                    <p className="text-sm text-slate-400 mt-4">User ID: {session.user.id}</p>
                </div>
            </div>
        )
    }

    // 2. Fetch Events for THESE Partners
    const { data: events } = await supabase
        .from('events')
        .select('id, title, start_datetime')
        .in('organizer_id', partnerIds) // Check ANY of the partners
        .order('start_datetime', { ascending: false })

    console.log('[ScanPage] Events Found:', events?.length)

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ticket Scanner</h1>
                    <p className="text-slate-500 text-sm">Logged in as {session.user.email}</p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 relative">
                    {/* Pass events to scanner for selection */}
                    <WebScanner events={events || []} />
                </div>
            </div>
        </div>
    )
}
