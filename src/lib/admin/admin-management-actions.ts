'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type AdminRole = 'super_admin' | 'admin' | 'support' | 'finance_admin'

/**
 * Verify the current user is a super_admin before performing admin management actions.
 */
async function requireSuperAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: role } = await supabase.rpc('is_user_admin')
    if (role !== 'super_admin') throw new Error('Super admin access required')

    return user.id
}

function getServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Config error')
    return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

/**
 * Get all admin users
 */
export async function getAdminUsers() {
    await requireSuperAdmin()
    const adminSupabase = getServiceClient()

    const { data, error } = await adminSupabase
        .from('users')
        .select('id, email, display_name, admin_role, is_admin, created_at, last_active_at')
        .eq('is_admin', true)
        .order('admin_role')

    if (error) throw new Error('Failed to fetch admin users')
    return data || []
}

/**
 * Set a user as admin with a specific role.
 * Looks up user by email.
 */
export async function addAdminUser(email: string, role: AdminRole) {
    const currentUserId = await requireSuperAdmin()
    const adminSupabase = getServiceClient()

    // Find the user by email
    const { data: user, error: findError } = await adminSupabase
        .from('users')
        .select('id, email, is_admin, admin_role')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle()

    if (findError) throw new Error('Failed to look up user')
    if (!user) throw new Error(`No user found with email: ${email}`)
    if (user.is_admin) throw new Error(`${email} is already an admin (${user.admin_role})`)

    // Prevent setting super_admin on others (only via DB directly for safety)
    if (role === 'super_admin') {
        throw new Error('Cannot grant super_admin via UI. Use database directly for security.')
    }

    // Set the user as admin
    const { error } = await adminSupabase
        .from('users')
        .update({
            is_admin: true,
            admin_role: role,
        })
        .eq('id', user.id)

    if (error) throw new Error('Failed to add admin user')

    return { success: true, userId: user.id }
}

/**
 * Update an existing admin's role.
 */
export async function updateAdminRole(userId: string, newRole: AdminRole) {
    const currentUserId = await requireSuperAdmin()
    const adminSupabase = getServiceClient()

    // Can't change your own role
    if (userId === currentUserId) {
        throw new Error('Cannot change your own role')
    }

    // Can't set super_admin via UI
    if (newRole === 'super_admin') {
        throw new Error('Cannot grant super_admin via UI')
    }

    // Can't modify other super_admins
    const { data: target } = await adminSupabase
        .from('users')
        .select('admin_role')
        .eq('id', userId)
        .single()

    if (target?.admin_role === 'super_admin') {
        throw new Error('Cannot modify another super admin')
    }

    const { error } = await adminSupabase
        .from('users')
        .update({ admin_role: newRole })
        .eq('id', userId)

    if (error) throw new Error('Failed to update role')
    return { success: true }
}

/**
 * Remove admin access from a user.
 */
export async function removeAdminUser(userId: string) {
    const currentUserId = await requireSuperAdmin()
    const adminSupabase = getServiceClient()

    if (userId === currentUserId) {
        throw new Error('Cannot remove your own admin access')
    }

    // Can't remove other super_admins
    const { data: target } = await adminSupabase
        .from('users')
        .select('admin_role')
        .eq('id', userId)
        .single()

    if (target?.admin_role === 'super_admin') {
        throw new Error('Cannot remove another super admin')
    }

    const { error } = await adminSupabase
        .from('users')
        .update({
            is_admin: false,
            admin_role: null,
        })
        .eq('id', userId)

    if (error) throw new Error('Failed to remove admin user')
    return { success: true }
}
