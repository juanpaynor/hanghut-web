'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PopupLayout = 'standard' | 'image'

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
    /** 'standard' = image + title + body + CTA card. 'image' = full-bleed poster, the whole image is the button. */
    layout: PopupLayout
    /** Higher shows first in the app's queue; created_at desc breaks ties. */
    priority: number
    /** Hidden before this time. null = no lower bound. */
    starts_at: string | null
    /** Hidden after this time. null = no upper bound. */
    ends_at: string | null
    impression_count: number
    tap_count: number
}

/** The subset an admin can actually set — counters and id are server-owned. */
export type AdminPopupInput = Partial<
    Pick<
        AdminPopup,
        | 'title' | 'body' | 'image_url' | 'action_url' | 'action_text'
        | 'cooldown_days' | 'is_active' | 'layout' | 'priority'
        | 'starts_at' | 'ends_at'
    >
>

/**
 * Ordered the way the APP orders its queue — priority desc, then newest first —
 * so the admin list reads top-to-bottom as the sequence a user will actually see.
 */
export async function getAdminPopups() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('admin_popups')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching admin popups:', error)
        return { success: false, popups: [] as AdminPopup[], error: error.message }
    }

    return { success: true, popups: data as AdminPopup[] }
}

/**
 * Normalises a form payload into a DB row.
 *
 * title/body are NOT NULL in the schema, but layout='image' renders neither —
 * the poster carries its own text. Rather than relax the constraint we treat
 * title as an internal label for the admin list and mirror it into body when
 * the admin hasn't written any, so an image popup never fails on a field the
 * user will never see.
 */
function toRow(input: AdminPopupInput) {
    const layout: PopupLayout = input.layout === 'image' ? 'image' : 'standard'
    const title = (input.title ?? '').trim()
    const body = (input.body ?? '').trim()

    return {
        title,
        body: layout === 'image' ? (body || title) : body,
        image_url: input.image_url || null,
        action_url: input.action_url || null,
        action_text: input.action_text || 'Learn More',
        cooldown_days: input.cooldown_days ?? null,
        is_active: input.is_active ?? false,
        layout,
        priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
        starts_at: input.starts_at || null,
        ends_at: input.ends_at || null,
    }
}

/**
 * NOTE — multiple popups may be active at once, deliberately.
 *
 * This used to deactivate every other popup whenever one was switched on, because
 * the app only ever showed the first active row. The app now renders ALL eligible
 * popups as a sequential queue (team_comms #267/#270), so force-deactivating the
 * others would make the queue impossible to use. Activation is now independent
 * per popup; ordering is `priority`, and the app caps at 3 per launch.
 */
export async function createAdminPopup(popupData: AdminPopupInput) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('admin_popups')
        .insert(toRow(popupData))
        .select()
        .single()

    if (error) {
        console.error('Error creating admin popup:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/popups')
    return { success: true, data }
}

export async function updateAdminPopup(id: string, popupData: AdminPopupInput) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('admin_popups')
        .update(toRow(popupData))
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

/** Independent per popup — see the note on createAdminPopup. */
export async function togglePopupActive(id: string, targetState: boolean) {
    const supabase = await createClient()

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
