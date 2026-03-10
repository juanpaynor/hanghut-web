'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface AdminPopup {
    id: string
    title: string
    body: string
    image_url: string | null
    action_url: string | null
    action_text: string
    cooldown_days: number | null
    is_active: boolean
    created_at: string
}

export async function getAdminPopups() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('admin_popups')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching admin popups:', error)
        return { success: false, popups: [] as AdminPopup[], error: error.message }
    }

    return { success: true, popups: data as AdminPopup[] }
}

export async function createAdminPopup(popupData: Partial<AdminPopup>) {
    const supabase = await createClient()

    // If setting active, deactivate others
    if (popupData.is_active) {
        await supabase
            .from('admin_popups')
            .update({ is_active: false })
            .eq('is_active', true)
    }

    const { data, error } = await supabase
        .from('admin_popups')
        .insert({
            title: popupData.title,
            body: popupData.body,
            image_url: popupData.image_url || null,
            action_url: popupData.action_url || null,
            action_text: popupData.action_text || 'Learn More',
            cooldown_days: popupData.cooldown_days,
            is_active: popupData.is_active || false,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating admin popup:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/popups')
    return { success: true, data }
}

export async function updateAdminPopup(id: string, popupData: Partial<AdminPopup>) {
    const supabase = await createClient()

    // If setting active, deactivate others
    if (popupData.is_active) {
        await supabase
            .from('admin_popups')
            .update({ is_active: false })
            .eq('is_active', true)
            .neq('id', id)
    }

    const { data, error } = await supabase
        .from('admin_popups')
        .update({
            title: popupData.title,
            body: popupData.body,
            image_url: popupData.image_url || null,
            action_url: popupData.action_url || null,
            action_text: popupData.action_text,
            cooldown_days: popupData.cooldown_days,
            is_active: popupData.is_active,
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating admin popup:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/popups')
    return { success: true, data }
}

export async function deleteAdminPopup(id: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('admin_popups')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting admin popup:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/popups')
    return { success: true }
}

export async function togglePopupActive(id: string, targetState: boolean) {
    const supabase = await createClient()

    // If toggling ON, deactivate all others first
    if (targetState) {
        await supabase
            .from('admin_popups')
            .update({ is_active: false })
            .eq('is_active', true)
    }

    const { error } = await supabase
        .from('admin_popups')
        .update({ is_active: targetState })
        .eq('id', id)

    if (error) {
        console.error('Error toggling admin popup:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/popups')
    return { success: true }
}
