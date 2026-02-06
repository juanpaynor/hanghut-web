import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamManager } from '@/components/organizer/team-manager'
import { getTeamMembers } from '@/lib/organizer/team-actions'

export default async function TeamPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    // Get current partner context
    // First check own partner (Owner)
    let partnerId = null
    let userRole = 'owner'

    const { data: ownPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (ownPartner) {
        partnerId = ownPartner.id
    } else {
        // Check if member of another partner
        const { data: member } = await supabase
            .from('partner_team_members')
            .select('partner_id, role')
            .eq('user_id', user.id)
            .single()

        if (member) {
            partnerId = member.partner_id
            userRole = member.role
        }
    }

    if (!partnerId) {
        redirect('/organizer/register')
    }

    // Fetch team data
    const { members, invites, error } = await getTeamMembers(partnerId)

    if (error) {
        // Handle error gracefully
        console.error('Error fetching team:', error)
        // Maybe show error UI?
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Team Management</h1>
            <TeamManager
                partnerId={partnerId}
                currentUserId={user.id}
                members={members || []}
                invites={invites || []}
                userRole={userRole}
            />
        </div>
    )
}
