'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function deleteReportedContent(
    targetType: string,
    targetId: string
): Promise<{ success: boolean; error?: string }> {
    const adminClient = createAdminClient()

    let tableName: string

    switch (targetType) {
        case 'post':
            tableName = 'posts'
            break
        case 'table':
            tableName = 'tables'
            break
        case 'comment':
            tableName = 'comments'
            break
        case 'message':
            tableName = 'messages'
            break
        default:
            return { success: false, error: `Cannot delete content of type: ${targetType}` }
    }

    const { error } = await adminClient
        .from(tableName)
        .delete()
        .eq('id', targetId)

    if (error) {
        console.error('Delete content error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/reports')
    return { success: true }
}

export async function resolveReport(
    reportId: string
): Promise<{ success: boolean; error?: string }> {
    const adminClient = createAdminClient()

    const { error } = await adminClient
        .from('reports')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', reportId)

    if (error) {
        console.error('Resolve report error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/reports')
    return { success: true }
}
