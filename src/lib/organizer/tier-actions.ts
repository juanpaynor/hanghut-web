'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function createTicketTier(eventId: string, tierData: {
    name: string
    description: string
    price: number
    quantity_total: number
    min_per_order?: number
    max_per_order?: number
    sales_start?: string
    sales_end?: string
    is_active: boolean
    sort_order: number
    // Presentation fields (inline tier showcase)
    perks?: string[]
    highlight?: boolean
    badge_label?: string | null
    accent_color?: string | null
    image_url?: string | null
}) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Verify user owns this event
    const { data: event } = await supabase
        .from('events')
        .select('organizer_id')
        .eq('id', eventId)
        .single()

    if (!event) {
        return { error: 'Event not found' }
    }

    // Check if user has permission (owner or manager)
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', event.organizer_id)
        .single()

    if (!partner) {
        // Check team membership
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('partner_id', event.organizer_id)
            .in('role', ['owner', 'manager'])
            .single()

        if (!teamMember) {
            return { error: 'Permission denied' }
        }
    }

    // Insert tier
    const { data: tier, error } = await supabase
        .from('ticket_tiers')
        .insert({
            event_id: eventId,
            ...tierData
        })
        .select()
        .single()

    if (error) {
        console.error('Tier creation error:', error)
        return { error: 'Failed to create ticket tier' }
    }

    // No revalidatePath: callers patch their list locally, and the event
    // dashboard is force-dynamic (refetches on navigation). Revalidating here
    // forced a full route refresh that felt like a page reload on every save.
    return { success: true, tier }
}

export async function updateTicketTier(tierId: string, tierData: {
    name?: string
    description?: string
    price?: number
    quantity_total?: number
    min_per_order?: number
    max_per_order?: number
    sales_start?: string
    sales_end?: string
    is_active?: boolean
    sort_order?: number
    // Presentation fields (inline tier showcase)
    perks?: string[]
    highlight?: boolean
    badge_label?: string | null
    accent_color?: string | null
    image_url?: string | null
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Get tier and verify ownership
    const { data: tier } = await supabase
        .from('ticket_tiers')
        .select('event_id, events!inner(organizer_id)')
        .eq('id', tierId)
        .single()

    if (!tier) {
        return { error: 'Tier not found' }
    }

    const organizerId = (tier.events as any).organizer_id

    // Check permission
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', organizerId)
        .single()

    if (!partner) {
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('partner_id', organizerId)
            .in('role', ['owner', 'manager'])
            .single()

        if (!teamMember) {
            return { error: 'Permission denied' }
        }
    }

    // Update tier
    const { error } = await supabase
        .from('ticket_tiers')
        .update(tierData)
        .eq('id', tierId)

    if (error) {
        console.error('Tier update error:', error)
        return { error: 'Failed to update ticket tier' }
    }

    return { success: true }
}

export async function deleteTicketTier(tierId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // Get tier and check if any tickets sold
    const { data: tier } = await supabase
        .from('ticket_tiers')
        .select('event_id, quantity_sold, events!inner(organizer_id)')
        .eq('id', tierId)
        .single()

    if (!tier) {
        return { error: 'Tier not found' }
    }

    if (tier.quantity_sold > 0) {
        return { error: 'Cannot delete tier with sold tickets' }
    }

    const organizerId = (tier.events as any).organizer_id

    // Check permission
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', organizerId)
        .single()

    if (!partner) {
        const { data: teamMember } = await supabase
            .from('partner_team_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('partner_id', organizerId)
            .in('role', ['owner', 'manager'])
            .single()

        if (!teamMember) {
            return { error: 'Permission denied' }
        }
    }

    // Delete tier
    const { error } = await supabase
        .from('ticket_tiers')
        .delete()
        .eq('id', tierId)

    if (error) {
        console.error('Tier deletion error:', error)
        return { error: 'Failed to delete ticket tier' }
    }

    return { success: true }
}

/**
 * Upload an image for a ticket tier (stored in the shared event-covers bucket under
 * a tiers/ prefix). Returns a public URL to save on ticket_tiers.image_url. Verifies
 * the caller owns the event before writing.
 */
export async function uploadTierImage(formData: FormData): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const file = formData.get('file') as File | null
    const eventId = formData.get('eventId') as string | null
    if (!file || !eventId) return { error: 'Missing file or event' }
    if (!file.type.startsWith('image/')) return { error: 'File must be an image' }
    if (file.size > 5 * 1024 * 1024) return { error: 'Image must be under 5MB' }

    // Ownership: the caller must own (or manage) the event this tier belongs to.
    const { data: event } = await supabase.from('events').select('organizer_id').eq('id', eventId).single()
    if (!event) return { error: 'Event not found' }
    const { data: partner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).eq('id', event.organizer_id).maybeSingle()
    if (!partner) {
        const { data: teamMember } = await supabase
            .from('partner_team_members').select('role')
            .eq('user_id', user.id).eq('partner_id', event.organizer_id).in('role', ['owner', 'manager']).maybeSingle()
        if (!teamMember) return { error: 'Permission denied' }
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const fileName = `tiers/${eventId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { data, error } = await supabase.storage
        .from('event-covers')
        .upload(fileName, file, { contentType: file.type, upsert: false })

    if (error) {
        console.error('Tier image upload error:', error)
        return { error: 'Upload failed' }
    }

    const { data: pub } = supabase.storage.from('event-covers').getPublicUrl(data.path)
    return { url: pub.publicUrl }
}
