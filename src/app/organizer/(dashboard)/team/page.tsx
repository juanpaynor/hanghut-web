import { redirect } from 'next/navigation'
import { TeamManager } from '@/components/organizer/team-manager'
import { getTeamMembers } from '@/lib/organizer/team-actions'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'

export default async function TeamPage() {
    // Cached — layout already resolved these
    const { user } = await getAuthUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const partner = await getPartner(user.id)
    if (!partner) {
        redirect('/organizer/register')
    }

    // Determine user's role (owner or team member)
    let userRole = 'owner'
    if (partner) {
        // Check if they're NOT the owner (i.e., they're a team member)
        const supabase = await createClient()
        const { data: member } = await supabase
            .from('partner_team_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('partner_id', partner.id)
            .single()

        if (member) {
            userRole = member.role
        }
    }

    // Fetch team data
    const { members, invites, error } = await getTeamMembers(partner.id)

    if (error) {
        // Handle error gracefully
        console.error('Error fetching team:', error)
        // Maybe show error UI?
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Team Management</h1>
            <TeamManager
                partnerId={partner.id}
                currentUserId={user.id}
                members={members || []}
                invites={invites || []}
                userRole={userRole}
            />
        </div>
    )
}
