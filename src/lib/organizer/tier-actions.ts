'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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

    revalidatePath(`/organizer/events/${eventId}`)
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

    revalidatePath(`/organizer/events/${tier.event_id}`)
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

    revalidatePath(`/organizer/events/${tier.event_id}`)
    return { success: true }
}
