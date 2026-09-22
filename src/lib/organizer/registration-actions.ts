'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { RegistrationQuestion } from '@/components/organizer/registration-questions-manager'
import { getActingPartnerId } from '@/lib/auth/cached'

/**
 * Registration question editing.
 *
 * Questions are saved IN PLACE — updated, inserted and deleted individually —
 * rather than wiped and rewritten. Two reasons, and the first is the serious
 * one:
 *
 *  1. registration_answers cascades on question_id. The old save deleted every
 *     question for the event before re-inserting, so an organizer who added one
 *     question after going on sale destroyed every answer already collected.
 *  2. A question's id has to survive an edit for anything to reference it —
 *     conditional questions point at the question they depend on.
 *
 * New rows get their uuid assigned HERE rather than by the database, so a
 * question added in the same session can be depended on by another question
 * added in that same session: the key→id map is known before the insert runs.
 */

function adminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return null
    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
}

function cleanOptions(options: string[] | undefined): string[] | null {
    const kept = (options || []).map(o => o.trim()).filter(Boolean)
    return kept.length > 0 ? kept : null
}

export async function saveRegistrationQuestions(eventId: string, questions: RegistrationQuestion[]) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' }

    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', actingPartnerId)
        .single()

    if (!event) return { error: 'Event not found or unauthorized' }

    const adminSupabase = adminClient()
    if (!adminSupabase) return { error: 'Server configuration error' }

    try {
        const { data: existingRows } = await adminSupabase
            .from('registration_questions')
            .select('id')
            .eq('event_id', eventId)

        const existingIds = new Set((existingRows || []).map(r => r.id as string))

        // key → id for EVERY question in the payload, new ones included, so a
        // dependency can point at a sibling created in the same save.
        const idForKey = new Map<string, string>()
        for (const q of questions) {
            const key = q.key || q.id
            if (!key) continue
            const id = q.id && existingIds.has(q.id) ? q.id : crypto.randomUUID()
            idForKey.set(key, id)
        }

        const rows = questions.map((q, index) => {
            const key = q.key || q.id || ''
            const id = idForKey.get(key)!
            const dependsOnId = q.depends_on_key ? idForKey.get(q.depends_on_key) ?? null : null
            return {
                id,
                event_id: eventId,
                label: q.label.trim(),
                question_type: q.question_type,
                options: cleanOptions(q.options),
                is_required: !!q.is_required,
                display_order: index,
                help_text: q.help_text?.trim() || null,
                help_image_url: q.help_image_url?.trim() || null,
                // A question cannot depend on itself — that would hide it forever.
                depends_on_question_id: dependsOnId && dependsOnId !== id ? dependsOnId : null,
                depends_on_values: (q.depends_on_values || []).length > 0 ? q.depends_on_values : null,
                tier_ids: (q.tier_ids || []).length > 0 ? q.tier_ids : null,
            }
        })

        // Drop the dependency links first. Deleting a question that something
        // still points at would otherwise trip the FK ordering, and a row whose
        // controlling question is being removed in this same save must not keep
        // a stale pointer.
        const keptIds = rows.map(r => r.id)
        const removed = [...existingIds].filter(id => !keptIds.includes(id))

        if (removed.length > 0) {
            await adminSupabase
                .from('registration_questions')
                .update({ depends_on_question_id: null, depends_on_values: null })
                .eq('event_id', eventId)
                .in('depends_on_question_id', removed)

            const { error: delError } = await adminSupabase
                .from('registration_questions')
                .delete()
                .eq('event_id', eventId)
                .in('id', removed)
            if (delError) throw delError
        }

        if (rows.length > 0) {
            // Two passes: write the rows without their dependency pointers, then
            // set the pointers. A single upsert can insert a row whose
            // depends_on_question_id names a sibling that hasn't landed yet.
            const { error: upsertError } = await adminSupabase
                .from('registration_questions')
                .upsert(
                    rows.map(({ depends_on_question_id, ...rest }) => rest),
                    { onConflict: 'id' },
                )
            if (upsertError) throw upsertError

            const linked = rows.filter(r => r.depends_on_question_id)
            for (const r of linked) {
                const { error: linkError } = await adminSupabase
                    .from('registration_questions')
                    .update({ depends_on_question_id: r.depends_on_question_id })
                    .eq('id', r.id)
                if (linkError) throw linkError
            }
        }

        revalidatePath(`/organizer/events/${eventId}`)

        return { success: true, questions: await getRegistrationQuestions(eventId) }
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

    const rows = data || []
    // The editor addresses questions by key, which for a saved row is its id.
    return rows.map(q => ({
        id: q.id,
        key: q.id,
        label: q.label,
        question_type: q.question_type,
        options: q.options || [],
        is_required: q.is_required,
        display_order: q.display_order,
        help_text: q.help_text || '',
        help_image_url: q.help_image_url || '',
        depends_on_key: q.depends_on_question_id || null,
        depends_on_values: q.depends_on_values || [],
        tier_ids: q.tier_ids || [],
    })) as RegistrationQuestion[]
}

/**
 * Upload a helper image for a question — a size chart, a sample ID, a map.
 *
 * Goes to a public bucket on purpose: it is the organizer's own artwork shown
 * to every prospective buyer, not anyone's uploaded document. Routed through
 * the admin client after an ownership check so organizers don't need a storage
 * policy of their own.
 */
export async function uploadQuestionHelpImage(eventId: string, formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' }

    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', actingPartnerId)
        .single()
    if (!event) return { error: 'Event not found or unauthorized' }

    const file = formData.get('file') as File | null
    if (!file) return { error: 'No file provided' }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return { error: 'Use a JPG, PNG or WEBP image.' }
    }
    if (file.size > 5 * 1024 * 1024) return { error: 'Image must be under 5MB.' }

    const adminSupabase = adminClient()
    if (!adminSupabase) return { error: 'Server configuration error' }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `question-help/${eventId}/${crypto.randomUUID()}.${ext}`

    const { error } = await adminSupabase.storage
        .from('event-images')
        .upload(path, file, { contentType: file.type, upsert: false })

    if (error) {
        console.error('uploadQuestionHelpImage failed', error)
        return { error: 'Upload failed. Try again.' }
    }

    const { data: pub } = adminSupabase.storage.from('event-images').getPublicUrl(path)
    return { url: pub.publicUrl }
}
