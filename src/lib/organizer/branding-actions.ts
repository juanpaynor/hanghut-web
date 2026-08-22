'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getActingPartnerId } from '@/lib/auth/cached'

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
    video_url?: string | null
    description_html?: string | null
    layout_config?: {
        order: string[]
        hidden: string[]
    }
    design?: {
        layout?: 'modern' | 'classic'
        font?: 'sans' | 'serif' | 'mono'
        show_footer?: boolean
    }
}) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Verify user owns this partner
    let { data: partner } = await supabase
        .from('partners')
        .select('id, branding, slug')
        .eq('id', partnerId)
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        // Branding is owner-level. A team member can never hold role='owner' (the four
        // assignable roles exclude it), so the only non-owner who may edit branding is a
        // platform-support seat, which is owner-equivalent by design.
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('role, is_platform_support')
            .eq('user_id', user.id)
            .eq('partner_id', partnerId)
            .maybeSingle()

        const mayEditBranding = !!teamMember
            && ((teamMember as any).is_platform_support === true || teamMember.role === 'owner')

        if (!mayEditBranding) {
            return { error: 'Permission denied. Only owners can update branding.' }
        }

        // Fetch partner data for team member
        const { data: teamPartner } = await supabase
            .from('partners')
            .select('id, branding, slug')
            .eq('id', partnerId)
            .single()

        partner = teamPartner
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
    if (partner?.slug) {
        revalidatePath(`/${partner.slug}`)
    }
    return { success: true }
}

export async function uploadBrandingImage(partnerId: string, file: File, type: 'cover' | 'favicon') {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Verify ownership (or an owner-equivalent platform-support seat)
    const actingPartnerId = await getActingPartnerId(user.id)

    if (actingPartnerId !== partnerId) {
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

/**
 * Upload one photo for a storefront Gallery section.
 *
 * Gallery has been selectable in the builder — and baked into the "festival"
 * template — since launch, but there was never a way to put images in it: the
 * config panel just said "coming soon" and told organizers to edit the data by
 * hand. Reuses the same ownership check and bucket as uploadBrandingImage; the
 * URL is stored in `branding.sections[n].config.images`.
 */
export async function uploadGalleryImage(
    partnerId: string,
    file: File
): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (actingPartnerId !== partnerId) return { error: 'Permission denied' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    try {
        // Sanitise the extension rather than trusting the whole filename — it ends
        // up in a public URL path.
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const fileName = `${partnerId}/gallery-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { data, error } = await adminSupabase.storage
            .from('event-covers')
            .upload(fileName, file, { contentType: file.type, upsert: false })

        if (error) {
            console.error('uploadGalleryImage error:', error)
            return { error: 'Failed to upload image' }
        }

        const { data: { publicUrl } } = adminSupabase.storage
            .from('event-covers')
            .getPublicUrl(data.path)

        return { url: publicUrl }
    } catch (error) {
        console.error('uploadGalleryImage unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}
