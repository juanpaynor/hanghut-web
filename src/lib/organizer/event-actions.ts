'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { manilaLocalToISO } from '@/lib/datetime'

/**
 * Resolve the partner whose events the current user may manage. Real owners
 * (partners.user_id) AND team members with role owner/manager qualify — team
 * members used to be bounced because resolution only checked partners.user_id.
 * Returns { id } so existing `partner.id` usages keep working, or null.
 */
async function resolveManagerPartner(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ id: string } | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: owned } = await supabase
        .from('partners').select('id').eq('user_id', user.id).maybeSingle()
    if (owned) return { id: owned.id }
    const { data: tm } = await supabase
        .from('partner_team_members')
        .select('partner_id, role').eq('user_id', user.id).maybeSingle()
    if (tm && (tm.role === 'owner' || tm.role === 'manager')) return { id: tm.partner_id }
    return null
}

export async function createEvent(formData: FormData) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Get partner record
    const partner = await resolveManagerPartner(supabase)

    if (!partner) {
        return { error: 'Partner account not found' }
    }

    // Use service role for file uploads and event creation
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
        return { error: 'Server configuration error' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    })

    try {
        // 1. Upload cover image
        const coverImage = formData.get('cover_image') as File
        if (!coverImage) {
            return { error: 'Cover image is required' }
        }

        // Sanitize filename: remove spaces and special characters
        const sanitizedCoverName = coverImage.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')
        const coverFileName = `${partner.id}/${Date.now()}-${sanitizedCoverName}`
        const { data: coverData, error: coverError } = await supabase.storage
            .from('event-covers')
            .upload(coverFileName, coverImage, {
                contentType: coverImage.type,
                upsert: false,
            })

        if (coverError) {
            console.error('Cover upload error:', coverError)
            return { error: 'Failed to upload cover image' }
        }

        const { data: { publicUrl: coverUrl } } = supabase.storage
            .from('event-covers')
            .getPublicUrl(coverData.path)

        // 2. Upload additional images
        const additionalImageUrls: string[] = []
        let imageIndex = 0
        while (formData.has(`additional_image_${imageIndex}`)) {
            const image = formData.get(`additional_image_${imageIndex}`) as File
            if (image) {
                const sanitizedImageName = image.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')
                const fileName = `${partner.id}/${Date.now()}-${imageIndex}-${sanitizedImageName}`
                const { data: imageData, error: imageError } = await supabase.storage
                    .from('event-images')
                    .upload(fileName, image, {
                        contentType: image.type,
                        upsert: false,
                    })

                if (!imageError && imageData) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('event-images')
                        .getPublicUrl(imageData.path)
                    additionalImageUrls.push(publicUrl)
                }
            }
            imageIndex++
        }

        // 3. Prepare event data.
        // The form sends naive wall-clock strings ("2026-08-28T19:00") meaning
        // Philippine time. Convert to real instants before storing — writing the
        // raw string let Postgres (TZ=UTC) read 7pm Manila as 7pm UTC, i.e. 3am the
        // next day.
        const startDatetime = manilaLocalToISO(formData.get('start_datetime') as string)
        const salesEndDatetime = manilaLocalToISO(formData.get('sales_end_datetime') as string)

        // Default sales_end to 1 hour before event if not provided
        const defaultSalesEnd = new Date(new Date(startDatetime).getTime() - 3600000).toISOString()

        const isExternal = formData.get('is_external') === 'true'
        const externalTicketUrl = formData.get('external_ticket_url') as string || null
        const externalProviderName = formData.get('external_provider_name') as string || null

        const eventData = {
            organizer_id: partner.id,
            title: formData.get('title') as string,
            description: formData.get('description') as string || null,
            description_html: (formData.get('description_html') as string) || null,
            event_type: formData.get('event_type') as string,
            category: (formData.get('category') as string) || null,
            rsvp_enabled: formData.get('rsvp_enabled') === 'true',
            rsvp_button_label: (formData.get('rsvp_button_label') as string) || null,
            venue_name: formData.get('venue_name') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            latitude: parseFloat(formData.get('latitude') as string),
            longitude: parseFloat(formData.get('longitude') as string),
            start_datetime: startDatetime,
            end_datetime: manilaLocalToISO(formData.get('end_datetime') as string) || null,
            sales_end_datetime: salesEndDatetime || defaultSalesEnd,
            ticket_price: parseFloat(formData.get('ticket_price') as string) || 0,
            capacity: isExternal ? 999999 : parseInt(formData.get('capacity') as string),
            tickets_sold: 0,
            min_tickets_per_purchase: 1, // Default from migration
            max_tickets_per_purchase: 10, // Default from migration
            cover_image_url: coverUrl,
            images: additionalImageUrls.length > 0 ? additionalImageUrls : null,
            status: formData.get('status') as string,
            custom_tos: (formData.get('custom_tos') as string) || null,
            is_featured: false,
            seating_type: isExternal ? 'general_admission' : ((formData.get('seating_type') as string) || 'general_admission'),
            max_seats_per_order: parseInt(formData.get('max_seats_per_order') as string) || 10,
            is_external: isExternal,
            external_ticket_url: externalTicketUrl || null,
            external_provider_name: externalProviderName || null,
            require_approval: formData.get('require_approval') === 'true',
            invite_only: formData.get('invite_only') === 'true',
            hide_venue_until_registered: formData.get('hide_venue_until_registered') === 'true',
            approval_email_subject: (formData.get('approval_email_subject') as string) || null,
            approval_email_body: (formData.get('approval_email_body') as string) || null,
            rejection_email_subject: (formData.get('rejection_email_subject') as string) || null,
            rejection_email_body: (formData.get('rejection_email_body') as string) || null,
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

        // 5. Create ticket tiers (internal ticketing only). Prefer the tiers built
        //    in the create wizard; fall back to a single default "General Admission".
        if (!isExternal) {
            let tierRows: Record<string, unknown>[] = []
            try {
                const raw = formData.get('tiers') as string | null
                if (raw) {
                    const parsed = JSON.parse(raw)
                    if (Array.isArray(parsed)) {
                        tierRows = parsed
                            .filter((t: any) => t && typeof t.name === 'string' && t.name.trim())
                            .map((t: any, i: number) => ({
                                event_id: event.id,
                                name: String(t.name).trim().slice(0, 100),
                                description: '',
                                price: Math.max(0, Number(t.price) || 0),
                                quantity_total: Math.max(0, parseInt(String(t.quantity_total)) || 0),
                                quantity_sold: 0,
                                is_active: true,
                                sort_order: Number.isFinite(t.sort_order) ? t.sort_order : i,
                            }))
                    }
                }
            } catch (e) {
                console.error('Tier payload parse error:', e)
            }

            if (tierRows.length === 0) {
                tierRows = [{
                    event_id: event.id,
                    name: 'General Admission',
                    description: 'Standard entry ticket',
                    price: parseFloat(formData.get('ticket_price') as string) || 0,
                    quantity_total: parseInt(formData.get('capacity') as string) || 0,
                    quantity_sold: 0,
                    is_active: true,
                    sort_order: 0,
                }]
            }

            const { error: tierError } = await adminSupabase
                .from('ticket_tiers')
                .insert(tierRows)

            if (tierError) {
                console.error('Ticket tier creation error:', tierError)
                // Don't fail the entire operation if tier creation fails
                // The event is still valid, we can add tiers later
            }
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

    const partner = await resolveManagerPartner(supabase)

    if (!partner) return { error: 'Partner account not found' }

    // Use service role for storage/updates
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }
    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    })

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
            const sanitizedCoverName = coverImage.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')
            const coverFileName = `${partner.id}/${Date.now()}-${sanitizedCoverName}`
            const { data: coverData, error: coverError } = await supabase.storage
                .from('event-covers')
                .upload(coverFileName, coverImage, { contentType: coverImage.type, upsert: false })

            if (coverError) throw new Error('Cover upload failed')

            const { data: { publicUrl } } = supabase.storage
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
                const sanitizedImageName = image.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')
                const fileName = `${partner.id}/${Date.now()}-${imageIndex}-${sanitizedImageName}`
                const { data: imageData, error: imageError } = await supabase.storage
                    .from('event-images')
                    .upload(fileName, image, { contentType: image.type, upsert: false })

                if (!imageError && imageData) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('event-images')
                        .getPublicUrl(imageData.path)
                    finalImages.push(publicUrl)
                }
            }
            imageIndex++
        }

        // 3. Prepare Update Data — same Manila-local → instant conversion as create.
        const startDatetime = manilaLocalToISO(formData.get('start_datetime') as string)
        const salesEndDatetime = manilaLocalToISO(formData.get('sales_end_datetime') as string)
        const defaultSalesEnd = new Date(new Date(startDatetime).getTime() - 3600000).toISOString()
        const isExternal = formData.get('is_external') === 'true'

        const updateData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string || null,
            description_html: (formData.get('description_html') as string) || null,
            event_type: formData.get('event_type') as string,
            category: (formData.get('category') as string) || null,
            rsvp_enabled: formData.get('rsvp_enabled') === 'true',
            rsvp_button_label: (formData.get('rsvp_button_label') as string) || null,
            venue_name: formData.get('venue_name') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            latitude: parseFloat(formData.get('latitude') as string),
            longitude: parseFloat(formData.get('longitude') as string),
            start_datetime: startDatetime,
            end_datetime: manilaLocalToISO(formData.get('end_datetime') as string) || null,
            sales_end_datetime: salesEndDatetime || defaultSalesEnd,
            ticket_price: parseFloat(formData.get('ticket_price') as string) || 0,
            capacity: isExternal ? 999999 : parseInt(formData.get('capacity') as string),
            cover_image_url: coverUrl,
            images: finalImages.length > 0 ? finalImages : null,
            status: formData.get('status') as string,
            custom_tos: (formData.get('custom_tos') as string) || null,
            updated_at: new Date().toISOString(),
            seating_type: isExternal ? 'general_admission' : ((formData.get('seating_type') as string) || 'general_admission'),
            max_seats_per_order: parseInt(formData.get('max_seats_per_order') as string) || 10,
            is_external: isExternal,
            external_ticket_url: (formData.get('external_ticket_url') as string) || null,
            external_provider_name: (formData.get('external_provider_name') as string) || null,
            require_approval: formData.get('require_approval') === 'true',
            invite_only: formData.get('invite_only') === 'true',
            hide_venue_until_registered: formData.get('hide_venue_until_registered') === 'true',
            approval_email_subject: (formData.get('approval_email_subject') as string) || null,
            approval_email_body: (formData.get('approval_email_body') as string) || null,
            rejection_email_subject: (formData.get('rejection_email_subject') as string) || null,
            rejection_email_body: (formData.get('rejection_email_body') as string) || null,
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

export async function updateEventStorefront(eventId: string, data: {
    video_url?: string | null
    description_html?: string | null
    theme_color?: string | null
    layout_config?: any
}) {
    const supabase = await createClient()

    // Get current user and partner
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await resolveManagerPartner(supabase)

    if (!partner) return { error: 'Partner account not found' }

    // Use service role for updates
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }
    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    })

    // Verify ownership
    const { data: existingEvent } = await adminSupabase
        .from('events')
        .select('organizer_id')
        .eq('id', eventId)
        .single()

    if (!existingEvent || existingEvent.organizer_id !== partner.id) {
        return { error: 'Event not found or unauthorized' }
    }

    try {
        const { error: updateError } = await adminSupabase
            .from('events')
            .update({
                video_url: data.video_url,
                description_html: data.description_html,
                theme_color: data.theme_color,
                layout_config: data.layout_config,
                updated_at: new Date().toISOString(),
            })
            .eq('id', eventId)

        if (updateError) throw updateError

        revalidatePath('/organizer/events')
        revalidatePath(`/organizer/events/${eventId}`)
        revalidatePath(`/events/${eventId}`) // Revalidate public page

        return { success: true }

    } catch (error: any) {
        console.error('Update error:', error)
        return { error: 'Failed to update event: ' + error.message }
    }
}

/**
 * Save the ticket-tier DISPLAY settings (how tiers are presented on the event
 * page) into layout_config.tiers. Merges into the existing layout_config so it
 * never clobbers the page's theme/layout/section design.
 */
export async function updateEventTierDisplay(eventId: string, tiersConfig: {
    inline?: boolean          // show tiers inline on the page (vs behind the modal)
    display?: 'cards' | 'list'
    show_remaining?: boolean  // show "N left" per tier
    show_sold_out?: boolean   // keep sold-out tiers visible (greyed) vs hide them
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await resolveManagerPartner(supabase)
    if (!partner) return { error: 'Partner account not found' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }
    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    // Read current layout_config so we merge rather than overwrite.
    const { data: existingEvent } = await adminSupabase
        .from('events')
        .select('organizer_id, layout_config')
        .eq('id', eventId)
        .single()

    if (!existingEvent || existingEvent.organizer_id !== partner.id) {
        return { error: 'Event not found or unauthorized' }
    }

    const nextLayout = { ...(existingEvent.layout_config || {}), tiers: tiersConfig }

    const { error: updateError } = await adminSupabase
        .from('events')
        .update({ layout_config: nextLayout, updated_at: new Date().toISOString() })
        .eq('id', eventId)

    if (updateError) return { error: 'Failed to save display settings: ' + updateError.message }

    revalidatePath(`/organizer/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    return { success: true }
}

export async function uploadEventBgImage(eventId: string, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await resolveManagerPartner(supabase)
    if (!partner) return { error: 'Partner account not found' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })

    // Verify ownership
    const { data: existingEvent } = await adminSupabase
        .from('events')
        .select('organizer_id')
        .eq('id', eventId)
        .single()
    if (!existingEvent || existingEvent.organizer_id !== partner.id) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    const ext = file.name.split('.').pop()
    const path = `${partner.id}/bg-${eventId}-${Date.now()}.${ext}`

    const { error: uploadError } = await adminSupabase.storage
        .from('event-covers')
        .upload(path, file, { contentType: file.type, upsert: true })

    if (uploadError) return { error: uploadError.message }

    const { data: { publicUrl } } = adminSupabase.storage
        .from('event-covers')
        .getPublicUrl(path)

    return { url: publicUrl }
}
