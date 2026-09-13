'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Email a suspended user the decision on their account appeal.
 *
 * WHY THIS EXISTS: until now, answering an appeal wrote `admin_response` into
 * the row and sent nothing at all — no email, no notification, no push. The
 * app holds a suspended user on a screen offering exactly two choices, file an
 * appeal or sign out, so there was no surface on which they could ever read the
 * answer. An admin would write a careful reply and it would reach nobody. The
 * only thing the user could observe was their account silently coming back.
 *
 * Email is the entire channel here. That makes this the least optional
 * notification in the product, and the reason it is not awaited anywhere is the
 * same as everywhere else: the decision is already recorded, and a Resend
 * outage must not make an admin think the appeal failed to save.
 *
 * Passes ONLY the ticket id. The recipient and the wording are resolved inside
 * the edge function with the service role, so this cannot be turned into a
 * "send arbitrary text from HangHut to arbitrary address" primitive.
 */
export async function notifyAppealDecision(ticketId: string): Promise<void> {
    try {
        const admin = createAdminClient()
        const { error } = await admin.functions.invoke('send-support-notification', {
            body: { ticket_id: ticketId, kind: 'appeal' },
        })
        if (error) console.error('notifyAppealDecision:', error.message)
    } catch (e) {
        console.error('notifyAppealDecision:', e)
    }
}
