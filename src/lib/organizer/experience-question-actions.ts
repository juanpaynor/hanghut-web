'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { RegistrationQuestion } from '@/components/organizer/registration-questions-manager'

/**
 * Custom booking questions for an experience — the events registration-questions
 * feature, keyed to a table (experience) instead of an event.
 *
 * Writes go through the service role after proving the caller manages the
 * experience, exactly like saveRegistrationQuestions: the table is public-read
 * (buyers see the questions) but must not be public-write.
 */
export async function saveExperienceQuestions(tableId: string, questions: RegistrationQuestion[]) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Ownership: the host, or an owner/manager on the experience's partner.
    // Mirrors can_manage_experience so the write gate matches the RPC gate.
    const { data: table } = await supabase
        .from('tables')
        .select('id, host_id, partner_id')
        .eq('id', tableId)
        .single()

    if (!table) return { error: 'Experience not found' }

    let canManage = table.host_id === user.id
    if (!canManage && table.partner_id) {
        const { data: owns } = await supabase
            .from('partners').select('id').eq('id', table.partner_id).eq('user_id', user.id).maybeSingle()
        if (owns) canManage = true
    }
    if (!canManage && table.partner_id) {
        const { data: member } = await supabase
            .from('partner_team_members').select('role')
            .eq('partner_id', table.partner_id).eq('user_id', user.id)
            .in('role', ['owner', 'manager']).maybeSingle()
        if (member) canManage = true
    }
    if (!canManage) return { error: 'You do not have permission to edit this experience' }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { error: 'Server configuration error' }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })

    try {
        await adminSupabase.from('experience_questions').delete().eq('table_id', tableId)

        if (questions.length === 0) {
            revalidatePath(`/organizer/experiences/${tableId}/edit`)
            return { success: true, questions: [] }
        }

        const rows = questions.map((q, index) => ({
            table_id: tableId,
            label: q.label.trim(),
            question_type: q.question_type,
            options: q.options?.filter(o => o.trim()).length > 0
                ? q.options.filter(o => o.trim())
                : null,
            is_required: q.is_required,
            display_order: index,
        }))

        const { data: saved, error } = await adminSupabase
            .from('experience_questions')
            .insert(rows)
            .select()

        if (error) throw error

        revalidatePath(`/organizer/experiences/${tableId}/edit`)
        revalidatePath(`/experiences/${tableId}`)

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
        console.error('saveExperienceQuestions error:', error)
        return { error: 'Failed to save questions: ' + error.message }
    }
}

export async function getExperienceQuestions(tableId: string): Promise<RegistrationQuestion[]> {
    const supabase = await createClient()

    const { data } = await supabase
        .from('experience_questions')
        .select('*')
        .eq('table_id', tableId)
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
