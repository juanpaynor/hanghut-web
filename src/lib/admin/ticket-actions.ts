import { createClient } from '@/lib/supabase/client'
import { banUser } from './actions'

export interface TicketActionResponse {
    success: boolean
    message: string
    error?: string
}

/**
 * Update a ticket with admin response
 */
export async function respondToTicket(
    ticketId: string,
    adminId: string,
    response: string,
    newStatus: 'in_progress' | 'resolved' | 'closed'
): Promise<TicketActionResponse> {
    try {
        const supabase = createClient()

        const { error } = await supabase
            .from('support_tickets')
            .update({
                admin_response: response,
                admin_id: adminId,
                status: newStatus,
                resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)

        if (error) throw error

        return {
            success: true,
            message: 'Ticket updated successfully',
        }
    } catch (error) {
        console.error('Error responding to ticket:', error)
        return {
            success: false,
            message: 'Failed to update ticket',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Approve an appeal and reactivate the user account
 */
export async function approveAppeal(
    ticketId: string,
    userId: string,
    adminId: string
): Promise<TicketActionResponse> {
    try {
        // 1. Reactivate user account using existing banUser function
        const activateResult = await banUser(userId, 'activate', 'Appeal approved', adminId)

        if (!activateResult.success) {
            throw new Error(activateResult.error || 'Failed to reactivate user')
        }

        // 2. Update ticket
        const supabase = createClient()
        const { error } = await supabase
            .from('support_tickets')
            .update({
                status: 'resolved',
                admin_response: 'Your appeal has been approved. Your account has been reactivated.',
                admin_id: adminId,
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)

        if (error) throw error

        return {
            success: true,
            message: 'Appeal approved and user reactivated',
        }
    } catch (error) {
        console.error('Error approving appeal:', error)
        return {
            success: false,
            message: 'Failed to approve appeal',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Deny an appeal
 */
export async function denyAppeal(
    ticketId: string,
    adminId: string,
    reason: string
): Promise<TicketActionResponse> {
    try {
        const supabase = createClient()

        const { error } = await supabase
            .from('support_tickets')
            .update({
                status: 'resolved',
                admin_response: `Appeal denied. Reason: ${reason}`,
                admin_id: adminId,
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)

        if (error) throw error

        return {
            success: true,
            message: 'Appeal denied',
        }
    } catch (error) {
        console.error('Error denying appeal:', error)
        return {
            success: false,
            message: 'Failed to deny appeal',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}
