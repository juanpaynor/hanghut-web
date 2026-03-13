'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface PushBroadcast {
    id: string
    title: string
    body: string
    image_url: string | null
    data_payload: Record<string, any> | null
    target_segment: string
    status: string
    total_recipients: number | null
    sent_count: number | null
    failed_count: number | null
    error_message: string | null
    created_by: string | null
    created_at: string
    completed_at: string | null
}

export async function getBroadcasts(page = 1, pageSize = 20): Promise<{ broadcasts: PushBroadcast[], total: number }> {
    const adminClient = createAdminClient()

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await adminClient
        .from('admin_push_broadcasts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) {
        console.error('Error fetching broadcasts:', error)
        return { broadcasts: [], total: 0 }
    }

    return { broadcasts: data || [], total: count || 0 }
}

export async function createBroadcast(payload: {
    title: string
    body: string
    image_url?: string
    data_payload?: Record<string, any>
    target_segment: string
}): Promise<{ success: boolean, id?: string, error?: string }> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current admin user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data, error } = await adminClient
        .from('admin_push_broadcasts')
        .insert({
            title: payload.title,
            body: payload.body,
            image_url: payload.image_url || null,
            data_payload: payload.data_payload || null,
            target_segment: payload.target_segment,
            created_by: user.id,
        })
        .select('id')
        .single()

    if (error) {
        console.error('Create broadcast error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/broadcasts')
    return { success: true, id: data.id }
}

export async function getBroadcastStatus(id: string): Promise<PushBroadcast | null> {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
        .from('admin_push_broadcasts')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !data) return null
    return data
}
