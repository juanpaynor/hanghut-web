'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function updatePartnerBranding(partnerId: string, branding: {
    colors?: {
        primary?: string
        secondary?: string
        accent?: string
    }
    cover_image_url?: string
    favicon_url?: string
    bio?: string
    tagline?: string
    social_links?: {
        instagram?: string
        facebook?: string
        website?: string
    }
    contact_display?: {
        email?: boolean
        phone?: boolean
    }
}) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Verify user owns this partner
    const { data: partner } = await supabase
        .from('partners')
        .select('id, branding')
        .eq('id', partnerId)
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        // Check team membership (owner only for branding)
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('partner_id', partnerId)
            .eq('role', 'owner')
            .single()

        if (!teamMember) {
            return { error: 'Permission denied. Only owners can update branding.' }
        }
    }

    // Merge with existing branding
    const currentBranding = partner?.branding || {}
    const updatedBranding = {
        ...currentBranding,
        ...branding,
        colors: {
            ...(currentBranding.colors || {}),
            ...(branding.colors || {})
        },
        social_links: {
            ...(currentBranding.social_links || {}),
            ...(branding.social_links || {})
        },
        contact_display: {
            ...(currentBranding.contact_display || {}),
            ...(branding.contact_display || {})
        }
    }

    // Update branding
    const { error } = await supabase
        .from('partners')
        .update({ branding: updatedBranding })
        .eq('id', partnerId)

    if (error) {
        console.error('Branding update error:', error)
        return { error: 'Failed to update branding' }
    }

    revalidatePath('/organizer/settings')
    return { success: true }
}

export async function uploadBrandingImage(partnerId: string, file: File, type: 'cover' | 'favicon') {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Verify ownership
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('id', partnerId)
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        return { error: 'Permission denied' }
    }

    // Use service role for uploads
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
        return { error: 'Server configuration error' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    try {
        const bucket = type === 'cover' ? 'event-covers' : 'event-images'
        const fileName = `${partnerId}/branding-${type}-${Date.now()}-${file.name}`

        const { data, error } = await adminSupabase.storage
            .from(bucket)
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false,
            })

        if (error) {
            console.error('Upload error:', error)
            return { error: 'Failed to upload image' }
        }

        const { data: { publicUrl } } = adminSupabase.storage
            .from(bucket)
            .getPublicUrl(data.path)

        return { success: true, url: publicUrl }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}
