'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ─── Fetch Team Members & Invites ──────────────────────────────────────────

export async function getTeamMembers(partnerId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Get Active Members
    const { data: members, error: membersError } = await supabase
        .from('partner_team_members')
        .select('id, role, created_at, user_id')
        .eq('partner_id', partnerId)

    if (membersError) {
        console.error('Error fetching members:', membersError)
        return { members: [], invites: [], error: membersError.message }
    }

    // Fetch user details
    const userIds = members?.map(m => m.user_id) || []
    let usersMap = new Map()

    if (userIds.length > 0) {
        const { data: usersData } = await supabase
            .from('users')
            .select('id, email, display_name, avatar_url')
            .in('id', userIds)

        if (usersData) {
            usersData.forEach(u => usersMap.set(u.id, u))
        }
    }

    const membersWithUsers = members?.map(member => ({
        ...member,
        users: usersMap.get(member.user_id) || null
    })) || []

    // Get Pending Invites
    const { data: invites, error: invitesError } = await supabase
        .from('partner_invites')
        .select('*')
        .eq('partner_id', partnerId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())

    if (invitesError) {
        console.error('Error fetching invites:', invitesError)
    }

    return {
        members: membersWithUsers,
        invites: invites || []
    }
}

// ─── Invite Team Member (NEW: Proper invite flow) ──────────────────────────

export async function inviteTeamMember(
    partnerId: string,
    email: string,
    role: string,
    _password?: string, // Kept for backward compat but no longer used
    name?: string
) {
    const supabase = await createClient()

    // 1. Verify Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const normalizedEmail = email.toLowerCase().trim()

    // 2. Check if user is already a team member
    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .single()

    if (existingUser) {
        const { data: existingMember } = await supabase
            .from('partner_team_members')
            .select('id')
            .eq('partner_id', partnerId)
            .eq('user_id', existingUser.id)
            .single()

        if (existingMember) {
            return { error: 'This user is already on the team.' }
        }
    }

    // 3. Check for existing pending invite
    const { data: existingInvite } = await supabase
        .from('partner_invites')
        .select('id')
        .eq('partner_id', partnerId)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single()

    if (existingInvite) {
        return { error: 'An invite for this email is already pending.' }
    }

    // 4. Get organization name for the email
    const { data: partner } = await supabase
        .from('partners')
        .select('business_name')
        .eq('id', partnerId)
        .single()

    // 5. Get inviter's display name
    const { data: inviterProfile } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .single()

    // 6. Insert the invite
    const { data: invite, error: insertError } = await supabase
        .from('partner_invites')
        .insert({
            partner_id: partnerId,
            email: normalizedEmail,
            role: role,
            invited_by: user.id,
            status: 'pending',
        })
        .select('token')
        .single()

    if (insertError) {
        console.error('Error creating invite:', insertError)
        if (insertError.code === '23505') {
            return { error: 'An invite for this email already exists.' }
        }
        return { error: 'Failed to create invite: ' + insertError.message }
    }

    // 7. Send invite email via Edge Function
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceRoleKey) {
        try {
            const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-team-invite`
            const res = await fetch(fnUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to_email: normalizedEmail,
                    to_name: name || normalizedEmail.split('@')[0],
                    inviter_name: inviterProfile?.display_name || 'A team member',
                    organization_name: partner?.business_name || 'An organization',
                    role: role,
                    invite_token: invite.token,
                }),
            })

            if (!res.ok) {
                const err = await res.json()
                console.error('Failed to send invite email:', err)
                // Don't fail the invite — it's created, email just didn't send
            } else {
                console.log('✅ Invite email sent to', normalizedEmail)
            }
        } catch (emailErr) {
            console.error('Error calling send-team-invite function:', emailErr)
        }
    }

    revalidatePath('/organizer/team')

    return {
        success: true,
        inviteToken: invite.token,
    }
}

// ─── Get Invite Info (Public — no auth required) ───────────────────────────

export async function getInviteInfo(token: string) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return { error: 'Server configuration error' }

    const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    )

    const { data: invite, error } = await adminClient
        .from('partner_invites')
        .select('id, partner_id, email, role, status, expires_at')
        .eq('token', token)
        .single()

    if (error || !invite) {
        return { error: 'Invite not found.' }
    }

    if (invite.status !== 'pending') {
        return { error: `This invite has already been ${invite.status}.` }
    }

    if (new Date(invite.expires_at) < new Date()) {
        return { error: 'This invite has expired.' }
    }

    // Get org name
    const { data: partner } = await adminClient
        .from('partners')
        .select('business_name, profile_photo_url')
        .eq('id', invite.partner_id)
        .single()

    return {
        email: invite.email,
        role: invite.role,
        organizationName: partner?.business_name || 'An organization',
        organizationLogo: partner?.profile_photo_url || null,
    }
}

// ─── Accept Invite ─────────────────────────────────────────────────────────

export async function acceptInvite(token: string) {
    const supabase = await createClient()

    // 1. Verify Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated', needsLogin: true }

    // 2. Look up the invite using service role (RLS might block cross-user reads)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return { error: 'Server configuration error' }

    const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    )

    const { data: invite, error: findError } = await adminClient
        .from('partner_invites')
        .select('id, partner_id, email, role, status, expires_at')
        .eq('token', token)
        .single()

    if (findError || !invite) {
        return { error: 'Invite not found or has expired.' }
    }

    // 3. Check invite status
    if (invite.status !== 'pending') {
        return { error: `This invite has already been ${invite.status}.` }
    }

    // 4. Check expiration
    if (new Date(invite.expires_at) < new Date()) {
        await adminClient
            .from('partner_invites')
            .update({ status: 'expired' })
            .eq('id', invite.id)
        return { error: 'This invite has expired.' }
    }

    // 5. Check email match
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return {
            error: `This invite was sent to ${invite.email}. You are logged in as ${user.email}.`,
            emailMismatch: true
        }
    }

    // 6. Check if already a member
    const { data: existingMember } = await adminClient
        .from('partner_team_members')
        .select('id')
        .eq('partner_id', invite.partner_id)
        .eq('user_id', user.id)
        .single()

    if (existingMember) {
        // Mark invite as accepted anyway
        await adminClient
            .from('partner_invites')
            .update({ status: 'accepted' })
            .eq('id', invite.id)
        return { success: true, alreadyMember: true }
    }

    // 7. Add to team
    const { error: addError } = await adminClient
        .from('partner_team_members')
        .insert({
            partner_id: invite.partner_id,
            user_id: user.id,
            role: invite.role,
            invited_by: null, // Could track from invite if needed
            is_active: true,
        })

    if (addError) {
        console.error('Error accepting invite:', addError)
        return { error: 'Failed to join team: ' + addError.message }
    }

    // 8. Mark invite as accepted
    await adminClient
        .from('partner_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id)

    revalidatePath('/organizer/team')
    return { success: true, partnerId: invite.partner_id }
}

// ─── Update Member Role ────────────────────────────────────────────────────

export async function updateMemberRole(memberId: string, newRole: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Validate role
    const validRoles = ['manager', 'scanner', 'finance', 'marketing']
    if (!validRoles.includes(newRole)) {
        return { error: 'Invalid role' }
    }

    // Fetch the member to get partner_id
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return { error: 'Server configuration error' }

    const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    )

    const { data: member } = await adminClient
        .from('partner_team_members')
        .select('partner_id, user_id, role')
        .eq('id', memberId)
        .single()

    if (!member) return { error: 'Member not found' }

    // Only owner can change roles
    const { data: ownerPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('id', member.partner_id)
        .eq('user_id', user.id)
        .single()

    if (!ownerPartner) {
        return { error: 'Only the organization owner can change roles.' }
    }

    // Cannot change your own role
    if (member.user_id === user.id) {
        return { error: 'You cannot change your own role.' }
    }

    // Update role
    const { error } = await adminClient
        .from('partner_team_members')
        .update({ role: newRole })
        .eq('id', memberId)

    if (error) {
        console.error('Error updating role:', error)
        return { error: 'Failed to update role' }
    }

    revalidatePath('/organizer/team')
    return { success: true }
}

// ─── Remove Team Member ────────────────────────────────────────────────────

export async function removeTeamMember(memberId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partner_team_members')
        .delete()
        .eq('id', memberId)

    if (error) {
        console.error('Error removing team member:', error)
        return { error: 'Failed to remove member' }
    }

    revalidatePath('/organizer/team')
    return { success: true }
}

// ─── Cancel Invite ─────────────────────────────────────────────────────────

export async function cancelInvite(inviteId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('partner_invites')
        .delete()
        .eq('id', inviteId)

    if (error) {
        console.error('Error cancelling invite:', error)
        return { error: 'Failed to cancel invite' }
    }

    revalidatePath('/organizer/team')
    return { success: true }
}
