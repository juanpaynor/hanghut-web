import { createClient } from '@/lib/supabase/client'

// Edge Function integration for admin actions
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.hanghut.com'
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export type BanAction = 'ban' | 'suspend' | 'activate'

export interface BanUserRequest {
    user_id: string
    action: BanAction
    reason: string
    admin_id: string
}

export interface ResetPasswordRequest {
    user_email: string
    admin_id: string
}

export interface DeleteAccountRequest {
    user_id: string
    admin_id: string
    hard_delete: boolean
    reason: string
}

export interface AdminActionResponse {
    success: boolean
    message: string
    user_id?: string
    user_email?: string
    new_status?: string
    hard_delete?: boolean
    error?: string
}

// Helper to get auth headers
async function getAuthHeaders() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
        throw new Error('No active session found')
    }

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    }
}

export async function banUser(
    userId: string,
    action: BanAction,
    reason: string,
    adminId: string
): Promise<AdminActionResponse> {
    try {
        const headers = await getAuthHeaders()

        console.log('[banUser] Payload:', { userId, action, reason, adminId })
        // console.log('[banUser] Headers:', headers) // Be careful logging full token

        const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/ban-user`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                user_id: userId,
                action,
                reason,
                admin_id: adminId,
            } as BanUserRequest),
        })

        const data = await response.json()
        console.log('[banUser] Response:', data)

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update user status')
        }

        return data
    } catch (error) {
        console.error('Error banning user:', error)
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export async function resetPassword(
    userEmail: string,
    adminId: string
): Promise<AdminActionResponse> {
    try {
        const headers = await getAuthHeaders()

        const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/reset-user-password`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                user_email: userEmail,
                admin_id: adminId,
            } as ResetPasswordRequest),
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || 'Failed to reset password')
        }

        return data
    } catch (error) {
        console.error('Error resetting password:', error)
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export async function deleteAccount(
    userId: string,
    hardDelete: boolean,
    reason: string,
    adminId: string
): Promise<AdminActionResponse> {
    try {
        const headers = await getAuthHeaders()

        const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-user-account`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                user_id: userId,
                admin_id: adminId,
                hard_delete: hardDelete,
                reason,
            } as DeleteAccountRequest),
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete account')
        }

        return data
    } catch (error) {
        console.error('Error deleting account:', error)
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}
