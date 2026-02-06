'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getTeamMembers(partnerId: string) {
    const supabase = await createClient()

    // verify auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Get Active Members (without the users join - can't cross-reference auth schema)
    const { data: members, error: membersError } = await supabase
        .from('partner_team_members')
        .select('id, role, created_at, user_id')
        .eq('partner_id', partnerId)

    if (membersError) {
        console.error('Error fetching members:', membersError)
        return { members: [], invites: [], error: membersError.message }
    }

    // Manually fetch user details from the users table (public schema)
    // The users table mirrors auth.users with additional fields
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

    // Combine the data
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

import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function inviteTeamMember(
    partnerId: string,
    email: string,
    role: string,
    password?: string,
    name?: string
) {
    const supabase = await createClient()

    // 1. Verify Auth (Can only be called by authenticated users)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // 2. Initialize Admin Client (for user management)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
        return { error: 'Server configuration error: Contact support' }
    }

    const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    const normalizedEmail = email.toLowerCase().trim()
    let userIdToAdd = null
    let newUserPassword = null
    let isNewUser = false

    // 3. Check if user exists
    const { data: existingPublicUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .single()

    if (existingPublicUser) {
        if (password) {
            return { error: 'User already exists. You cannot set a password for an existing account.' }
        }
        userIdToAdd = existingPublicUser.id
    } else {
        // Create User
        // Use provided password or generate one
        newUserPassword = password || (Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2))

        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: normalizedEmail,
            password: newUserPassword,
            email_confirm: true,
            user_metadata: {
                display_name: name || email.split('@')[0]
            }
        })

        if (createError) {
            console.error('Error creating user:', createError)

            // Check for "User already registered" error
            if ((createError as any).code === 'email_exists' ||
                createError.message.includes('already_registered') ||
                createError.status === 422) {

                console.log('User exists in Auth but not Public. Attempting to sync...')

                // Attempt to find the user in Auth to get their ID
                // Note: This iterates through users. Efficient for small bases, but ideally we'd have getUserByEmail
                // We'll limit to checking the first 1000 users for now as a safeguard
                const { data: { users: authUsers }, error: listError } = await adminClient.auth.admin.listUsers({
                    page: 1,
                    perPage: 1000
                })

                if (listError || !authUsers) {
                    console.error('Failed to list users for sync:', listError)
                    return { error: 'User exists but could not be synced. Auth List failed.' }
                }

                const foundUser = authUsers.find(u => u.email?.toLowerCase() === normalizedEmail)

                if (foundUser) {
                    userIdToAdd = foundUser.id

                    // Create the missing public.users entry
                    // We must use the admin service role client because strict RLS might block inserting for "other" users
                    // even if we are them (but we are not authenticated as them here, we are the organizer)

                    // Supabase Service Role Client for DB operations
                    const supabaseService = createAdminClient(
                        process.env.NEXT_PUBLIC_SUPABASE_URL!,
                        serviceRoleKey
                    )

                    const { error: insertError } = await supabaseService
                        .from('users')
                        .insert({
                            id: foundUser.id,
                            email: normalizedEmail,
                            display_name: name || email.split('@')[0],
                            avatar_url: ''
                        })

                    if (insertError) {
                        console.error('Failed to sync public user:', insertError)
                        // If duplicate key, maybe it exists now? ignore.
                        if (insertError.code !== '23505') {
                            return { error: 'Failed to create public profile for existing user.' }
                        }
                    } else {
                        console.log('Successfully synced public user profile for:', normalizedEmail)
                    }
                } else {
                    return { error: 'User reports as registered but could not be found in user list.' }
                }
            } else {
                return { error: 'Failed to create user: ' + createError.message }
            }
        } else {
            // Success creating new user
            userIdToAdd = newUser.user.id
            isNewUser = true
        }

        // Need to wait a moment or manually insert into public.users?
        // Trigger usually handles it on INSERT to auth.users.
        // If we just created the user via admin.createUser, the trigger SHOULD fire.
        // But if it fails, we might want to manually ensure it exists.
        // For now, iterate on trust.
    }

    if (!userIdToAdd) {
        console.error('Failed to determine user ID to add')
        return { error: 'Could not determine user ID' }
    }

    // 4. Add to Team
    const { data, error } = await supabase
        .from('partner_team_members')
        .insert({
            partner_id: partnerId,
            user_id: userIdToAdd,
            role: role,
            invited_by: user.id
            // is_active defaults to true
        })
        .select()
        .single()

    if (error) {
        console.error('Error adding team member:', error)
        if (error.code === '23505') { // Unique violation
            return { error: 'This user is already on the team.' }
        }
        return { error: 'Failed to add team member: ' + error.message }
    }

    revalidatePath('/organizer/team')

    return {
        success: true,
        member: data,
        // Only return credentials if we auto-generated them OR if the user asked to see them (though they typed them in)
        // Actually, if they typed it, they know it. But consistency is fine.
        newUser: isNewUser ? { email: normalizedEmail, password: newUserPassword } : null
    }
}

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
