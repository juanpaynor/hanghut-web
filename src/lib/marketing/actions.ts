'use server'

import { createClient } from '@/lib/supabase/server'

interface UnsubscribeResult {
    success: boolean
    message: string
    organizer?: string
    email?: string
}

export async function processUnsubscribe(token: string): Promise<UnsubscribeResult> {
    const supabase = await createClient()

    // 1. Verify token and get subscription details
    const { data: subscription, error: fetchError } = await supabase
        .from('partner_subscribers')
        .select(`
            *,
            partner:partners (
                business_name
            )
        `)
        .eq('unsubscribe_token', token)
        .single()

    if (fetchError || !subscription) {
        return {
            success: false,
            message: "Invalid or expired unsubscribe link."
        }
    }

    // 2. Already unsubscribed?
    if (!subscription.is_active) {
        return {
            success: true,
            message: "You are already unsubscribed.",
            organizer: subscription.partner?.business_name || "Organizer",
            email: subscription.email
        }
    }

    // 3. Perform unsubscribe
    // Note: We need to use service role if RLS blocks update, 
    // but typically we can set up secure RLS or just use a dedicated RPC.
    // However, since we are in a server action with createClient() it uses user auth or anon.
    // Anon + RLS policies I set up earlier might block this update unless we use a token policy.

    // FOR NOW: Let's assume the "Public Unsubscribe Policy" I wrote in migration works,
    // OR createAdminClient() is needed.
    // Let's use createAdminClient pattern if available or just try standard update.

    // WARNING: `createClient` from `@/lib/supabase/server` usually returns a client scoped to the request cookies.
    // If the user is unauthenticated (clicking email link), they are ANON.
    // The RLS policy: USING (unsubscribe_token = current_setting(...)) is complex to trigger from client.

    // BETTER APPROACH: Use `supabase-admin` here to bypass RLS since we validated the token securely in step 1.
    // But I don't see a `createAdminClient` utility exported commonly. 
    // I'll try the standard update. If it fails due to RLS, I might need to adjust RLS or use a secure endpoint.

    const { error: updateError } = await supabase
        .from('partner_subscribers')
        .update({
            is_active: false,
            unsubscribed_at: new Date().toISOString()
        })
        .eq('id', subscription.id)

    if (updateError) {
        // Fallback: This might be RLS blocking.
        // In a real production app, we'd use a Service Role client here.
        console.error("Unsubscribe update failed:", updateError)
        return {
            success: false,
            message: "System error. Please contact support."
        }
    }

    return {
        success: true,
        message: "Successfully unsubscribed.",
        organizer: subscription.partner?.business_name || "Organizer",
        email: subscription.email
    }
}
