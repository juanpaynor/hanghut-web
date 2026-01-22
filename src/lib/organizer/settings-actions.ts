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
    social_links: z.object({
        facebook: z.string().optional(),
        instagram: z.string().optional(),
        twitter: z.string().optional(),
        website: z.string().optional(),
    }).optional(),
    cover_image_url: z.string().optional(),
    profile_photo_url: z.string().optional(),
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
        }
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

    // Prepare update payload
    const updates: any = {
        business_name: data.business_name,
        description: data.description,
        slug: data.slug || null,
        social_links: data.social_links,
        profile_photo_url: profilePhotoUrl,
        cover_image_url: coverImageUrl,
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
