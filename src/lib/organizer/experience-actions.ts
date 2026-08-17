'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActingPartnerId } from '@/lib/auth/cached'

function experienceDatetime() {
    // Keeps experience out of the hangout feed (which filters by upcoming datetime)
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString()
}

// ─────────────────────────────────────────────
// EXPERIENCE CRUD
// ─────────────────────────────────────────────

export async function createExperience(data: {
    title: string
    description: string
    experience_type: string
    price_per_person: number
    currency?: string
    max_guests: number
    location_name: string
    latitude: number
    longitude: number
    requirements?: string[]
    included_items?: string[]
    images?: string[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' }
    const partner = { id: actingPartnerId }

    if (!data.title?.trim()) return { error: 'Title is required' }
    if (!data.description?.trim()) return { error: 'Description is required' }
    if (!data.experience_type) return { error: 'Experience type is required' }
    if (!data.price_per_person || data.price_per_person <= 0) return { error: 'Price must be greater than ₱0' }
    if (!data.max_guests || data.max_guests < 1) return { error: 'Max guests must be at least 1' }
    if (!data.location_name?.trim()) return { error: 'Location is required' }

    const { data: experience, error } = await supabase
        .from('tables')
        .insert({
            host_id: user.id,
            partner_id: partner.id,
            title: data.title.trim(),
            description: data.description.trim(),
            experience_type: data.experience_type,
            price_per_person: data.price_per_person,
            currency: data.currency || 'PHP',
            max_guests: data.max_guests,
            location_name: data.location_name.trim(),
            latitude: data.latitude,
            longitude: data.longitude,
            requirements: data.requirements || [],
            included_items: data.included_items || [],
            images: data.images || [],
            is_experience: true,
            status: 'open',
            datetime: experienceDatetime(),
        })
        .select('id')
        .single()

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences')
    return { success: true as const, id: experience.id }
}

export async function updateExperience(experienceId: string, data: {
    title?: string
    description?: string
    experience_type?: string
    price_per_person?: number
    currency?: string
    max_guests?: number
    location_name?: string
    latitude?: number
    longitude?: number
    requirements?: string[]
    included_items?: string[]
    images?: string[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('tables')
        .update({
            ...data,
            datetime: experienceDatetime(),
        })
        .eq('id', experienceId)
        .eq('host_id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences')
    revalidatePath(`/experiences/${experienceId}`)
    return { success: true as const }
}

export async function deleteExperience(experienceId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', experienceId)
        .eq('host_id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences')
    return { success: true as const }
}

// ─────────────────────────────────────────────
// SLOT MANAGEMENT
// ─────────────────────────────────────────────

export async function createSlot(data: {
    table_id: string
    start_time: string
    end_time: string
    max_guests: number
    price_per_person?: number | null
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    if (!data.start_time || !data.end_time) return { error: 'Start and end time are required' }
    if (new Date(data.end_time) <= new Date(data.start_time)) return { error: 'End time must be after start time' }
    if (data.max_guests < 1) return { error: 'Max guests must be at least 1' }

    const { error } = await supabase
        .from('experience_schedules')
        .insert({
            table_id: data.table_id,
            start_time: data.start_time,
            end_time: data.end_time,
            max_guests: data.max_guests,
            current_guests: 0,
            price_per_person: data.price_per_person || null,
            status: 'open',
        })

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const }
}

export async function cancelSlot(slotId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('experience_schedules')
        .update({ status: 'cancelled' })
        .eq('id', slotId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const }
}

export async function deleteSlot(slotId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Safety: only delete if no bookings
    const { data: slot } = await supabase
        .from('experience_schedules')
        .select('current_guests')
        .eq('id', slotId)
        .single()

    if (slot && slot.current_guests > 0) {
        return { error: 'Cannot delete a slot with existing bookings. Cancel it instead.' }
    }

    const { error } = await supabase
        .from('experience_schedules')
        .delete()
        .eq('id', slotId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const }
}

// ─────────────────────────────────────────────
// HOST MESSAGING
// ─────────────────────────────────────────────

export async function sendHostMessage(bookingId: string, subject: string, message: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Not authenticated' }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

    const res = await fetch(`${supabaseUrl}/functions/v1/send-host-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ booking_id: bookingId, subject, message }),
    })

    const data = await res.json()
    if (!res.ok) return { error: data?.error || 'Failed to send message' }
    return { success: true as const }
}

// ─────────────────────────────────────────────
// CHECK-IN
// ─────────────────────────────────────────────

export async function updateCheckInStatus(
    intentId: string,
    status: 'checked_in' | 'no_show' | 'pending'
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('experience_purchase_intents')
        .update({
            check_in_status: status,
            checked_in_at: status === 'checked_in' ? new Date().toISOString() : null,
            checked_in_by: status === 'checked_in' ? user.id : null,
        })
        .eq('id', intentId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/experiences/bookings')
    return { success: true as const }
}
