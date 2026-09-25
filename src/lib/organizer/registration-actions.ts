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

/** Drop image entries whose option label is gone. */
function pruneOptionImages(
    images: Record<string, string> | undefined,
    options: string[] | null,
): Record<string, string> | null {
    if (!images || !options?.length) return null
    const kept: Record<string, string> = {}
    for (const opt of options) {
        const url = images[opt]
        if (typeof url === 'string' && url.trim()) kept[opt] = url.trim()
    }
    return Object.keys(kept).length > 0 ? kept : null
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

        // One id per question, decided positionally in a single pass.
        //
        // This used to look the id up in a key→id map, which silently had no
        // entry for a question carrying neither a key nor an id — and an older
        // client bundle (from before `key` existed) sends exactly that. The
        // lookup returned undefined, the non-null assertion hid it, and the
        // undefined landed in a NOT NULL column. Indexing by position cannot
        // miss, so the payload's shape no longer decides whether a row is
        // writable.
        const ids = questions.map(q =>
            q.id && existingIds.has(q.id) ? q.id : crypto.randomUUID()
        )

        // key → id, used only to resolve a conditional question's pointer at a
        // sibling. A question with no key simply cannot be depended on, which
        // is correct rather than fatal.
        const idForKey = new Map<string, string>()
        questions.forEach((q, i) => {
            const key = q.key || q.id
            if (key) idForKey.set(key, ids[i])
        })

        const rows = questions.map((q, index) => {
            const id = ids[index]
            const dependsOnId = q.depends_on_key ? idForKey.get(q.depends_on_key) ?? null : null
            return {
                id,
                event_id: eventId,
                label: q.label.trim(),
                question_type: q.question_type,
                options: cleanOptions(q.options),
                // A section takes no answer, so it can never be required — the
                // database rejects the combination rather than letting it block
                // every submission on a question with no input.
                is_required: q.question_type === 'section' ? false : !!q.is_required,
                display_order: index,
                help_text: q.help_text?.trim() || null,
                help_image_url: q.help_image_url?.trim() || null,
                // A question cannot depend on itself — that would hide it forever.
                depends_on_question_id: dependsOnId && dependsOnId !== id ? dependsOnId : null,
                depends_on_values: (q.depends_on_values || []).length > 0 ? q.depends_on_values : null,
                tier_ids: (q.tier_ids || []).length > 0 ? q.tier_ids : null,
                // Only keep pictures whose option still exists — a renamed or
                // deleted option must not leave an orphan entry behind.
                option_images: pruneOptionImages(q.option_images, cleanOptions(q.options)),
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

            // A dropdown IS a choice question, but get_event_answer_stats infers
            // the analytics kind from question_type and predates this type — so
            // shirt sizes would chart correctly under the heading "Short
            // answers". Seed the override, and only on rows being created:
            // doing it on every save would silently undo an organizer's own
            // "treat as…" choice each time they edited anything.
            const newChoiceIds = rows
                .filter((r, i) => !existingIds.has(r.id) && questions[i].question_type === 'dropdown')
                .map(r => r.id)
            if (newChoiceIds.length > 0) {
                const { error: kindError } = await adminSupabase
                    .from('registration_questions')
                    .update({ analytics_kind: 'choice' })
                    .in('id', newChoiceIds)
                if (kindError) console.error('analytics_kind seed failed', kindError)
            }

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
        option_images: q.option_images || {},
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
