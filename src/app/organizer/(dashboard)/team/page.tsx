import { redirect } from 'next/navigation'
import { TeamManager } from '@/components/organizer/team-manager'
import { getTeamMembers } from '@/lib/organizer/team-actions'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'

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

    // Only owner can manage team
    const userRole = await getUserRole(user.id)
    if (!userRole || userRole.role !== 'owner') {
        redirect('/organizer')
    }

    const userRoleName = userRole.role

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
                userRole={userRoleName}
            />
        </div>
    )
}
