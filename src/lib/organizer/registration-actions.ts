'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { RegistrationQuestion } from '@/components/organizer/registration-questions-manager'
import { getActingPartnerId } from '@/lib/auth/cached'

export async function saveRegistrationQuestions(eventId: string, questions: RegistrationQuestion[]) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' }
    const partner = { id: actingPartnerId }

    // Verify event ownership
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) return { error: 'Event not found or unauthorized' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })

    try {
        // Delete all existing questions for this event (cascade deletes answers too)
        await adminSupabase
            .from('registration_questions')
            .delete()
            .eq('event_id', eventId)

        if (questions.length === 0) {
            revalidatePath(`/organizer/events/${eventId}`)
            return { success: true, questions: [] }
        }

        const rows = questions.map((q, index) => ({
            event_id: eventId,
            label: q.label.trim(),
            question_type: q.question_type,
            options: q.options?.filter(o => o.trim()).length > 0
                ? q.options.filter(o => o.trim())
                : null,
            is_required: q.is_required,
            display_order: index,
        }))

        const { data: saved, error } = await adminSupabase
            .from('registration_questions')
            .insert(rows)
            .select()

        if (error) throw error

        revalidatePath(`/organizer/events/${eventId}`)

        return {
            success: true,
            questions: saved.map(q => ({
                id: q.id,
                label: q.label,
                question_type: q.question_type,
                options: q.options || [],
                is_required: q.is_required,
                display_order: q.display_order,
            })) as RegistrationQuestion[]
        }
    } catch (error: any) {
        console.error('saveRegistrationQuestions error:', error)
        return { error: 'Failed to save questions: ' + error.message }
    }
}

export async function getRegistrationQuestions(eventId: string): Promise<RegistrationQuestion[]> {
    const supabase = await createClient()

    const { data } = await supabase
        .from('registration_questions')
        .select('*')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })

    return (data || []).map(q => ({
        id: q.id,
        label: q.label,
        question_type: q.question_type,
        options: q.options || [],
        is_required: q.is_required,
        display_order: q.display_order,
    }))
}
