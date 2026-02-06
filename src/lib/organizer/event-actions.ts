'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function createEvent(formData: FormData) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Get partner record
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        return { error: 'Partner account not found' }
    }

    // Use service role for file uploads and event creation
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
        return { error: 'Server configuration error' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    try {
        // 1. Upload cover image
        const coverImage = formData.get('cover_image') as File
        if (!coverImage) {
            return { error: 'Cover image is required' }
        }

        const coverFileName = `${partner.id}/${Date.now()}-${coverImage.name}`
        const { data: coverData, error: coverError } = await adminSupabase.storage
            .from('event-covers')
            .upload(coverFileName, coverImage, {
                contentType: coverImage.type,
                upsert: false,
            })

        if (coverError) {
            console.error('Cover upload error:', coverError)
            return { error: 'Failed to upload cover image' }
        }

        const { data: { publicUrl: coverUrl } } = adminSupabase.storage
            .from('event-covers')
            .getPublicUrl(coverData.path)

        // 2. Upload additional images
        const additionalImageUrls: string[] = []
        let imageIndex = 0
        while (formData.has(`additional_image_${imageIndex}`)) {
            const image = formData.get(`additional_image_${imageIndex}`) as File
            if (image) {
                const fileName = `${partner.id}/${Date.now()}-${imageIndex}-${image.name}`
                const { data: imageData, error: imageError } = await adminSupabase.storage
                    .from('event-images')
                    .upload(fileName, image, {
                        contentType: image.type,
                        upsert: false,
                    })

                if (!imageError && imageData) {
                    const { data: { publicUrl } } = adminSupabase.storage
                        .from('event-images')
                        .getPublicUrl(imageData.path)
                    additionalImageUrls.push(publicUrl)
                }
            }
            imageIndex++
        }

        // 3. Prepare event data
        const startDatetime = formData.get('start_datetime') as string
        const salesEndDatetime = formData.get('sales_end_datetime') as string

        // Default sales_end to 1 hour before event if not provided
        const defaultSalesEnd = new Date(new Date(startDatetime).getTime() - 3600000).toISOString()

        const eventData = {
            organizer_id: partner.id,
            title: formData.get('title') as string,
            description: formData.get('description') as string || null,
            event_type: formData.get('event_type') as string,
            venue_name: formData.get('venue_name') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            latitude: parseFloat(formData.get('latitude') as string),
            longitude: parseFloat(formData.get('longitude') as string),
            start_datetime: startDatetime,
            end_datetime: formData.get('end_datetime') as string || null,
            sales_end_datetime: salesEndDatetime || defaultSalesEnd,
            ticket_price: parseFloat(formData.get('ticket_price') as string),
            capacity: parseInt(formData.get('capacity') as string),
            tickets_sold: 0,
            min_tickets_per_purchase: 1, // Default from migration
            max_tickets_per_purchase: 10, // Default from migration
            cover_image_url: coverUrl,
            images: additionalImageUrls.length > 0 ? additionalImageUrls : null,
            status: formData.get('status') as string,
            is_featured: false,
        }

        // 4. Insert event
        const { data: event, error: eventError } = await adminSupabase
            .from('events')
            .insert(eventData)
            .select()
            .single()

        if (eventError) {
            console.error('Event creation error:', eventError)
            return { error: 'Failed to create event: ' + eventError.message }
        }

        // 5. Create default "General Admission" ticket tier
        const { error: tierError } = await adminSupabase
            .from('ticket_tiers')
            .insert({
                event_id: event.id,
                name: 'General Admission',
                description: 'Standard entry ticket',
                price: parseFloat(formData.get('ticket_price') as string),
                quantity_total: parseInt(formData.get('capacity') as string),
                quantity_sold: 0,
                is_active: true,
                sort_order: 0,
            })

        if (tierError) {
            console.error('Ticket tier creation error:', tierError)
            // Don't fail the entire operation if tier creation fails
            // The event is still valid, we can add tiers later
        }

        revalidatePath('/organizer/events')
        return { success: true, eventId: event.id }

    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

export async function updateEvent(eventId: string, formData: FormData) {
    const supabase = await createClient()

    // Get current user and partner
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    // Use service role for storage/updates
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }
    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Verify ownership
    const { data: existingEvent } = await adminSupabase
        .from('events')
        .select('organizer_id, cover_image_url, images')
        .eq('id', eventId)
        .single()

    if (!existingEvent || existingEvent.organizer_id !== partner.id) {
        return { error: 'Event not found or unauthorized' }
    }

    try {
        // 1. Handle Cover Image
        let coverUrl = existingEvent.cover_image_url
        const coverImage = formData.get('cover_image') as File

        if (coverImage && coverImage.size > 0) {
            const coverFileName = `${partner.id}/${Date.now()}-${coverImage.name}`
            const { data: coverData, error: coverError } = await adminSupabase.storage
                .from('event-covers')
                .upload(coverFileName, coverImage, { contentType: coverImage.type, upsert: false })

            if (coverError) throw new Error('Cover upload failed')

            const { data: { publicUrl } } = adminSupabase.storage
                .from('event-covers')
                .getPublicUrl(coverData.path)
            coverUrl = publicUrl
        }

        // 2. Handle Additional Images
        // existing_images are passed as JSON string of URLs
        const existingImagesStr = formData.get('existing_images') as string
        let finalImages: string[] = existingImagesStr ? JSON.parse(existingImagesStr) : []

        // Upload new images
        let imageIndex = 0
        while (formData.has(`additional_image_${imageIndex}`)) {
            const image = formData.get(`additional_image_${imageIndex}`) as File
            if (image) {
                const fileName = `${partner.id}/${Date.now()}-${imageIndex}-${image.name}`
                const { data: imageData, error: imageError } = await adminSupabase.storage
                    .from('event-images')
                    .upload(fileName, image, { contentType: image.type, upsert: false })

                if (!imageError && imageData) {
                    const { data: { publicUrl } } = adminSupabase.storage
                        .from('event-images')
                        .getPublicUrl(imageData.path)
                    finalImages.push(publicUrl)
                }
            }
            imageIndex++
        }

        // 3. Prepare Update Data
        const startDatetime = formData.get('start_datetime') as string
        const salesEndDatetime = formData.get('sales_end_datetime') as string
        const defaultSalesEnd = new Date(new Date(startDatetime).getTime() - 3600000).toISOString()

        const updateData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string || null,
            event_type: formData.get('event_type') as string,
            venue_name: formData.get('venue_name') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            latitude: parseFloat(formData.get('latitude') as string),
            longitude: parseFloat(formData.get('longitude') as string),
            start_datetime: startDatetime,
            end_datetime: formData.get('end_datetime') as string || null,
            sales_end_datetime: salesEndDatetime || defaultSalesEnd,
            ticket_price: parseFloat(formData.get('ticket_price') as string),
            capacity: parseInt(formData.get('capacity') as string),
            cover_image_url: coverUrl,
            images: finalImages.length > 0 ? finalImages : null,
            status: formData.get('status') as string,
            updated_at: new Date().toISOString(),
        }

        const { error: updateError } = await adminSupabase
            .from('events')
            .update(updateData)
            .eq('id', eventId)

        if (updateError) throw updateError

        revalidatePath('/organizer/events')
        revalidatePath(`/organizer/events/${eventId}`)

        return { success: true }

    } catch (error: any) {
        console.error('Update error:', error)
        return { error: 'Failed to update event: ' + error.message }
    }
}
