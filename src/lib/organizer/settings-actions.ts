'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const profileSchema = z.object({
    business_name: z.string().min(2, 'Business name must be at least 2 characters'),
    description: z.string().optional(),
    slug: z.string()
        .min(3, 'Slug must be at least 3 characters')
        .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
        .optional()
        .or(z.literal('')),
    branding: z.object({
        colors: z.object({
            primary: z.string().optional(),
            secondary: z.string().optional(),
            accent: z.string().optional(),
        }).optional(),
        design: z.object({
            layout: z.enum(['modern', 'classic']).optional(),
            font: z.enum(['sans', 'serif', 'mono']).optional(),
            primary_mode: z.enum(['auto', 'events', 'membership', 'hybrid']).optional(),
            enable_animations: z.boolean().optional(),
            show_footer: z.boolean().optional(),
            show_navbar: z.boolean().optional(),
        }).optional(),
        announcement: z.object({
            enabled: z.boolean().optional(),
            text: z.string().optional(),
            link: z.string().optional(),
        }).optional(),
        content: z.object({
            sort_by: z.enum(['upcoming', 'newest', 'alpha']).optional(),
            show_past_events: z.boolean().optional(),
        }).optional(),
        video_url: z.string().nullable().optional(),
        tagline: z.string().nullable().optional(),
        description_html: z.string().nullable().optional(),
        contact_display: z.object({
            email: z.boolean().optional(),
            phone: z.boolean().optional(),
        }).optional(),
        sections: z.array(z.object({
            type: z.string(),
            visible: z.boolean(),
            config: z.record(z.any()),
        })).optional(),
        selected_template: z.string().nullable().optional(),
        video_position: z.string().optional(),
        ticket: z.object({
            message: z.string().nullable().optional(),
            banner_url: z.string().nullable().optional(),
            template: z.enum(['classic', 'boarding', 'minimal']).optional(),
            theme: z.enum(['light', 'dark']).optional(),
            background: z.enum(['default', 'brand', 'event']).optional(),
            show_pdf: z.boolean().optional(),
            show_ticket_number: z.boolean().optional(),
            show_hint: z.boolean().optional(),
            footer: z.string().max(280).nullable().optional(),
            links: z.array(z.object({
                label: z.string().max(40),
                url: z.string().max(400),
            })).max(4).optional(),
        }).optional(),
    }).optional(),
    social_links: z.object({
        facebook: z.string().optional(),
        instagram: z.string().optional(),
        twitter: z.string().optional(),
        website: z.string().optional(),
    }).optional(),
    cover_image_url: z.string().optional(),
    profile_photo_url: z.string().optional(),
    custom_tos: z.string().max(2000).optional(),
})

export type ProfileFormState = {
    errors?: {
        business_name?: string[]
        description?: string[]
        slug?: string[]
        _form?: string[]
    }
    message?: string
}

export async function updatePartnerProfile(
    prevState: ProfileFormState | undefined,
    formData: FormData
): Promise<ProfileFormState> {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { message: 'Unauthorized' }
    }

    // Parse raw data with safe defaults
    let branding = {}
    try {
        const brandingRaw = formData.get('branding') as string
        if (brandingRaw) branding = JSON.parse(brandingRaw)
    } catch (e) {
        console.error('Failed to parse branding JSON', e)
    }

    const rawData = {
        business_name: formData.get('business_name') as string || '',
        description: formData.get('description') as string || '',
        slug: formData.get('slug') as string || '',
        cover_image_url: formData.get('cover_image_url') as string || undefined,
        profile_photo_url: formData.get('profile_photo_url') as string || undefined,
        social_links: {
            facebook: formData.get('facebook') as string || '',
            instagram: formData.get('instagram') as string || '',
            twitter: formData.get('twitter') as string || '',
            website: formData.get('website') as string || '',
        },
        branding
    }

    const customTos = formData.get('custom_tos') as string
    if (customTos !== undefined) {
        (rawData as any).custom_tos = customTos
    }

    // Validate
    const validatedFields = profileSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors as any,
            message: 'Invalid fields. Please check your input.'
        }
    }

    const { data } = validatedFields

    // Get partner ID
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        return { message: 'Partner profile not found' }
    }

    // Use service role for file uploads
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
        return { message: 'Server configuration error' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Handle Profile Photo (Logo)
    let profilePhotoUrl = data.profile_photo_url // Keep existing by default
    const profilePhotoFile = formData.get('profile_photo') as File

    if (profilePhotoFile && profilePhotoFile.size > 0) {
        const fileName = `${partner.id}/avatar-${Date.now()}-${profilePhotoFile.name}`
        const { data: uploadData, error: uploadError } = await adminSupabase.storage
            .from('partner-assets')
            .upload(fileName, profilePhotoFile, { upsert: true, contentType: profilePhotoFile.type })

        if (!uploadError && uploadData) {
            const { data: { publicUrl } } = adminSupabase.storage
                .from('partner-assets')
                .getPublicUrl(uploadData.path)
            profilePhotoUrl = publicUrl
        }
    }

    // Handle Cover Image
    let coverImageUrl = data.cover_image_url // Keep existing
    const coverImageFile = formData.get('cover_image') as File

    if (coverImageFile && coverImageFile.size > 0) {
        const fileName = `${partner.id}/cover-${Date.now()}-${coverImageFile.name}`
        const { data: uploadData, error: uploadError } = await adminSupabase.storage
            .from('partner-assets')
            .upload(fileName, coverImageFile, { upsert: true, contentType: coverImageFile.type })

        if (!uploadError && uploadData) {
            const { data: { publicUrl } } = adminSupabase.storage
                .from('partner-assets')
                .getPublicUrl(uploadData.path)
            coverImageUrl = publicUrl
        }
    }

    // Handle Ticket Banner (custom header image for the hosted ticket page)
    let ticketBannerUrl: string | null = (data.branding as any)?.ticket?.banner_url ?? null
    const ticketBannerFile = formData.get('ticket_banner') as File
    if (ticketBannerFile && ticketBannerFile.size > 0) {
        const fileName = `${partner.id}/ticket-banner-${Date.now()}-${ticketBannerFile.name}`
        const { data: uploadData, error: uploadError } = await adminSupabase.storage
            .from('partner-assets')
            .upload(fileName, ticketBannerFile, { upsert: true, contentType: ticketBannerFile.type })
        if (!uploadError && uploadData) {
            const { data: { publicUrl } } = adminSupabase.storage
                .from('partner-assets')
                .getPublicUrl(uploadData.path)
            ticketBannerUrl = publicUrl
        }
    }

    // Fold the resolved banner URL back into branding.ticket (message is already
    // in data.branding from the form JSON).
    const mergedBranding = {
        ...(data.branding as any),
        ticket: {
            ...((data.branding as any)?.ticket || {}),
            banner_url: ticketBannerUrl,
        },
    }

    // Prepare update payload
    const updates: any = {
        business_name: data.business_name,
        description: data.description,
        slug: data.slug || null,
        social_links: data.social_links,
        branding: mergedBranding,
        profile_photo_url: profilePhotoUrl,
        cover_image_url: coverImageUrl,
        custom_tos: data.custom_tos || null,
        updated_at: new Date().toISOString(),
    }

    console.log('[updatePartnerProfile] Performing update:', updates)

    // Perform Update
    const { error } = await supabase
        .from('partners')
        .update(updates)
        .eq('id', partner.id)


    if (error) {
        if (error.code === '23505') { // Unique violation
            return {
                errors: {
                    slug: ['This URL is already taken. Please choose another.']
                },
                message: 'Failed to update profile.'
            }
        }
        return { message: 'Database error: ' + error.message }
    }

    revalidatePath('/organizer/settings')
    if (data.slug) {
        revalidatePath(`/${data.slug}`)
    }

    return { message: 'Profile updated successfully!' }
}

export async function updateMembershipTabVisibility(show: boolean): Promise<{ error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, slug')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    const { error } = await supabase
        .from('partners')
        .update({ show_membership_tab: show })
        .eq('id', partner.id)

    if (error) return { error: error.message }

    revalidatePath('/organizer/settings')
    revalidatePath(`/${partner.slug}`)
    return {}
}
