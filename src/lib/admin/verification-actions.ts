'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Admin-only helper to get signed URL for private docs
export async function getDocumentUrl(path: string) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) throw new Error('Config Error')

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Create a signed URL valid for 1 hour
    const { data, error } = await adminSupabase.storage
        .from('kyc-documents')
        .createSignedUrl(path, 3600)

    if (error) throw new Error(error.message)
    return data.signedUrl
}

export async function reviewKYC(
    partnerId: string,
    action: 'approve' | 'reject',
    reason?: string
) {
    const supabase = await createClient()

    // 1. Admin Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Double check admin role
    const { data: adminUser } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!adminUser?.is_admin) return { error: 'Forbidden' }

    // 2. Perform Update
    const updates: any = {
        kyc_status: action === 'approve' ? 'verified' : 'rejected',
        verified: action === 'approve', // Sync with legacy boolean
        approved_by: action === 'approve' ? user.id : null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        kyc_rejection_reason: action === 'reject' ? reason : null,
        status: action === 'approve' ? 'approved' : 'pending' // Optionally activate partner status
    }

    const { error } = await supabase
        .from('partners')
        .update(updates)
        .eq('id', partnerId)

    if (error) return { error: error.message }

    revalidatePath('/admin/verifications')
    return { success: true }
}
