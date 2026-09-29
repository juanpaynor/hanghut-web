'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getActingPartnerId } from '@/lib/auth/cached'
import type { TermsDocument } from '@/lib/legal/terms-documents'

/**
 * Event Terms & Conditions documents.
 *
 * An event's `custom_tos` is the organizer's general terms and stays where it
 * is. These are ADDITIONAL, separately-titled documents, each with its own
 * checkbox at checkout -- asked for by a running organizer who needs a
 * participant waiver and a data privacy consent recorded as distinct
 * agreements rather than folded into one tick.
 *
 * Rows are saved IN PLACE (update / insert / delete individually) rather than
 * wiped and re-inserted. Nothing foreign-keys to these rows today -- checkout
 * snapshots title and body into the purchase intent precisely so that later
 * edits cannot rewrite what somebody already agreed to -- but stable ids make
 * the acceptance snapshot traceable back to the document it came from, and a
 * delete-then-insert save would break that link on every edit.
 */

function adminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return null
    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
}

/** Resolve the caller and confirm they may edit this event.
 *  getActingPartnerId covers owners, team members and platform-support ghosts,
 *  which the table's own RLS policy (partners.user_id only) does not -- hence
 *  the service-role write that follows. */
async function requireEventAccess(eventId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' as const }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' as const }

    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', actingPartnerId)
        .single()

    if (!event) return { error: 'Event not found or unauthorized' as const }
    return { ok: true as const }
}

export async function getEventTermsDocuments(
    eventId: string,
): Promise<{ data?: TermsDocument[]; error?: string }> {
    const gate = await requireEventAccess(eventId)
    if ('error' in gate) return { error: gate.error }

    const admin = adminClient()
    if (!admin) return { error: 'Server configuration error' }

    const { data, error } = await admin
        .from('event_terms_documents')
        .select('id, title, body, is_required, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })

    if (error) {
        console.error('getEventTermsDocuments failed', error)
        return { error: 'Could not load terms documents.' }
    }
    return { data: (data || []) as TermsDocument[] }
}

export async function saveEventTermsDocuments(
    eventId: string,
    documents: TermsDocument[],
): Promise<{ success?: true; error?: string }> {
    const gate = await requireEventAccess(eventId)
    if ('error' in gate) return { error: gate.error }

    const admin = adminClient()
    if (!admin) return { error: 'Server configuration error' }

    // Drop blanks rather than reject the save: an organizer who added a card
    // and left it empty meant to skip it, not to fail the whole form.
    const kept = (documents || [])
        .filter(d => d && String(d.title || '').trim() && String(d.body || '').trim())
        .map((d, i) => ({
            id: d.id,
            title: String(d.title).trim().slice(0, 120),
            body: String(d.body).trim().slice(0, 100000),
            is_required: d.is_required !== false,
            display_order: i,
        }))

    const { data: existing, error: readError } = await admin
        .from('event_terms_documents')
        .select('id')
        .eq('event_id', eventId)

    if (readError) {
        console.error('terms documents read failed', readError)
        return { error: 'Could not save terms documents.' }
    }

    const existingIds = new Set((existing || []).map(r => r.id as string))
    const keptIds = new Set(kept.map(d => d.id).filter(Boolean) as string[])

    const removed = [...existingIds].filter(id => !keptIds.has(id))
    if (removed.length > 0) {
        const { error } = await admin.from('event_terms_documents').delete().in('id', removed)
        if (error) {
            console.error('terms documents delete failed', error)
            return { error: 'Could not save terms documents.' }
        }
    }

    for (const doc of kept) {
        if (doc.id && existingIds.has(doc.id)) {
            const { error } = await admin
                .from('event_terms_documents')
                .update({
                    title: doc.title,
                    body: doc.body,
                    is_required: doc.is_required,
                    display_order: doc.display_order,
                })
                .eq('id', doc.id)
            if (error) {
                console.error('terms document update failed', error)
                return { error: 'Could not save terms documents.' }
            }
        } else {
            const { error } = await admin.from('event_terms_documents').insert({
                event_id: eventId,
                title: doc.title,
                body: doc.body,
                is_required: doc.is_required,
                display_order: doc.display_order,
            })
            if (error) {
                console.error('terms document insert failed', error)
                return { error: 'Could not save terms documents.' }
            }
        }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    return { success: true }
}
