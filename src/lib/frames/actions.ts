'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'

export interface EventFrame {
    id: string
    event_id: string
    name: string
    image_url: string
    status: 'pending' | 'approved' | 'rejected'
    is_active: boolean
    created_by: string | null
    created_at: string
}

/**
 * Confirm the caller owns the event, through the partner that organises it.
 *
 * Permission comes from the EVENT, never from a frame's `created_by` -- a frame
 * uploaded by HangHut staff on a partner's behalf still belongs to the
 * partner's event, and must stay manageable by them.
 */
async function assertOwnsEvent(eventId: string): Promise<string> {
    const { user } = await getAuthUser()
    if (!user) throw new Error('Not signed in')

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('events')
        .select('id, partners!inner(user_id)')
        .eq('id', eventId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    const owner = (data as { partners?: { user_id?: string } } | null)?.partners?.user_id
    if (!data || owner !== user.id) throw new Error('Event not found')
    return user.id
}

export async function listEventFrames(eventId: string): Promise<EventFrame[]> {
    await assertOwnsEvent(eventId)
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('event_frames')
        .select('id, event_id, name, image_url, status, is_active, created_by, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []) as EventFrame[]
}

/**
 * Record an uploaded frame. The file itself goes browser-direct to storage --
 * a 1080x1920 PNG has no business travelling through a server action body.
 *
 * Always lands as `pending` and inactive. The database default says so too;
 * this is not relying on the caller.
 */
export async function createEventFrame(input: {
    eventId: string
    name: string
    imageUrl: string
}): Promise<EventFrame> {
    const userId = await assertOwnsEvent(input.eventId)

    const name = input.name.trim()
    if (!name) throw new Error('Give the frame a name')

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('event_frames')
        .insert({
            event_id: input.eventId,
            name,
            image_url: input.imageUrl,
            created_by: userId,
            status: 'pending',
            is_active: false,
        })
        .select('id, event_id, name, image_url, status, is_active, created_by, created_at')
        .single()

    if (error) throw new Error(error.message)
    revalidatePath(`/organizer/events/${input.eventId}`)
    return data as EventFrame
}

/**
 * The kill switch, and the only way a frame goes live.
 *
 * Deactivating is always allowed and never blocked by state -- if artwork has
 * to come down at 11pm on a Saturday, nothing about this call should be able to
 * refuse. Activating is the guarded direction.
 */
export async function setEventFrameActive(
    frameId: string,
    eventId: string,
    active: boolean,
): Promise<void> {
    await assertOwnsEvent(eventId)
    const supabase = await createClient()

    if (active) {
        const { data: frame, error: readErr } = await supabase
            .from('event_frames')
            .select('status')
            .eq('id', frameId)
            .eq('event_id', eventId)
            .maybeSingle()
        if (readErr) throw new Error(readErr.message)
        if (!frame) throw new Error('Frame not found')
        if (frame.status !== 'approved') {
            throw new Error('This frame has not been approved yet, so it cannot go live.')
        }

        // One active frame per event is a unique partial index, so the old one
        // has to stand down first or the insert collides. Same-row update is a
        // no-op, which keeps re-activating the current frame harmless.
        const { error: clearErr } = await supabase
            .from('event_frames')
            .update({ is_active: false })
            .eq('event_id', eventId)
            .eq('is_active', true)
            .neq('id', frameId)
        if (clearErr) throw new Error(clearErr.message)
    }

    const { error } = await supabase
        .from('event_frames')
        .update({ is_active: active })
        .eq('id', frameId)
        .eq('event_id', eventId)

    if (error) throw new Error(error.message)
    revalidatePath(`/organizer/events/${eventId}`)
}

export async function deleteEventFrame(frameId: string, eventId: string): Promise<void> {
    await assertOwnsEvent(eventId)
    const supabase = await createClient()
    const { error } = await supabase
        .from('event_frames')
        .delete()
        .eq('id', frameId)
        .eq('event_id', eventId)
    if (error) throw new Error(error.message)
    revalidatePath(`/organizer/events/${eventId}`)
}
