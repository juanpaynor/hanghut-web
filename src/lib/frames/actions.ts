'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'

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
 * Every action here RETURNS its failure instead of throwing.
 *
 * A server action that throws does not reach the browser as its message: Next
 * replaces it with a digest and React renders "Minified React error #441 -- the
 * specific message is omitted in production builds". So the one thing the
 * organizer needs, the reason, is the one thing thrown errors destroy. Returning
 * the reason costs a union type and makes the UI able to say what went wrong.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Confirm the caller may manage this event, through the partner that organises it.
 *
 * Uses getActingPartnerId, NOT `partners.user_id = auth.uid()`. That helper
 * exists precisely because a platform-support seat is not an owner row, and
 * comparing user_id directly locks ghost mode out of the dashboard -- the same
 * mistake this file made in its first version.
 *
 * Permission comes from the EVENT, never from a frame's `created_by`: a frame
 * uploaded by HangHut staff on a partner's behalf must stay manageable by the
 * partner.
 */
async function resolveAccess(
    eventId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { ok: false, error: 'You are signed out. Reload the page and sign in again.' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { ok: false, error: 'This account has no partner profile.' }

    const supabase = await createClient()
    const { data: event, error } = await supabase
        .from('events')
        .select('id, organizer_id')
        .eq('id', eventId)
        .maybeSingle()

    if (error) return { ok: false, error: `Could not read the event: ${error.message}` }
    if (!event) return { ok: false, error: 'That event no longer exists.' }
    if (event.organizer_id !== actingPartnerId) {
        return { ok: false, error: 'This event belongs to a different organizer.' }
    }

    return { ok: true, userId: user.id }
}

const FRAME_COLUMNS = 'id, event_id, name, image_url, status, is_active, created_by, created_at'

export async function listEventFrames(eventId: string): Promise<Result<EventFrame[]>> {
    const access = await resolveAccess(eventId)
    if (!access.ok) return access

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('event_frames')
        .select(FRAME_COLUMNS)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    if (error) return { ok: false, error: `Could not load frames: ${error.message}` }
    return { ok: true, data: (data ?? []) as EventFrame[] }
}

/**
 * Record an uploaded frame. The file itself goes browser-direct to storage --
 * a 1080x1920 PNG has no business travelling through a server action body.
 *
 * NO REVIEW GATE. Frames land `approved`, and go live immediately if the event
 * has nothing live already. Rich's call 2026-10-28, overriding the approval step
 * the app team asked for in #368: an organizer uploading at 11pm the night before
 * their event cannot wait on a human, and a gate nobody is awake to clear is just
 * a broken feature. The `status` column and the kill switch both stay, so a frame
 * can still be pulled the moment anyone sees a problem -- what changed is that
 * the default is live rather than blocked.
 */
export async function createEventFrame(input: {
    eventId: string
    name: string
    imageUrl: string
}): Promise<Result<EventFrame>> {
    const access = await resolveAccess(input.eventId)
    if (!access.ok) return access

    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Give the frame a name.' }

    const supabase = await createClient()

    // Only the FIRST frame goes live on its own. If the organizer already has one
    // running, uploading another must not silently swap what their attendees see
    // mid-event -- that is a deliberate act, so it stays behind the toggle.
    const { data: live, error: liveErr } = await supabase
        .from('event_frames')
        .select('id')
        .eq('event_id', input.eventId)
        .eq('is_active', true)
        .maybeSingle()
    if (liveErr) return { ok: false, error: `Could not check the live frame: ${liveErr.message}` }

    const row = {
        event_id: input.eventId,
        name,
        image_url: input.imageUrl,
        created_by: access.userId,
        status: 'approved' as const,
    }

    const { data, error } = await supabase
        .from('event_frames')
        .insert({ ...row, is_active: !live })
        .select(FRAME_COLUMNS)
        .single()

    if (data) {
        revalidatePath(`/organizer/events/${input.eventId}`)
        return { ok: true, data: data as EventFrame }
    }

    // A second upload racing this one loses the unique partial index rather than
    // the data: retry inactive, so the organizer gets their frame and simply has
    // to pick which is live.
    if (error?.code === '23505') {
        const { data: retry, error: retryErr } = await supabase
            .from('event_frames')
            .insert({ ...row, is_active: false })
            .select(FRAME_COLUMNS)
            .single()
        if (retryErr) return { ok: false, error: `Could not save the frame: ${retryErr.message}` }
        revalidatePath(`/organizer/events/${input.eventId}`)
        return { ok: true, data: retry as EventFrame }
    }

    return { ok: false, error: `Could not save the frame: ${error?.message ?? 'unknown error'}` }
}

/**
 * The kill switch, and how an organizer swaps which frame is live.
 *
 * Deactivating is always allowed and never blocked by state -- if artwork has
 * to come down at 11pm on a Saturday, nothing about this call should be able to
 * refuse. Activating is the guarded direction: with the review gate dropped the
 * `approved` check now only stops a frame WE rejected from being switched back
 * on by the organizer who uploaded it.
 */
export async function setEventFrameActive(
    frameId: string,
    eventId: string,
    active: boolean,
): Promise<Result<null>> {
    const access = await resolveAccess(eventId)
    if (!access.ok) return access

    const supabase = await createClient()

    if (active) {
        const { data: frame, error: readErr } = await supabase
            .from('event_frames')
            .select('status')
            .eq('id', frameId)
            .eq('event_id', eventId)
            .maybeSingle()
        if (readErr) return { ok: false, error: `Could not read the frame: ${readErr.message}` }
        if (!frame) return { ok: false, error: 'That frame no longer exists.' }
        if (frame.status !== 'approved') {
            return { ok: false, error: 'HangHut took this frame down, so it cannot go back up.' }
        }

        // One active frame per event is a unique partial index, so the old one
        // has to stand down first or the update collides.
        const { error: clearErr } = await supabase
            .from('event_frames')
            .update({ is_active: false })
            .eq('event_id', eventId)
            .eq('is_active', true)
            .neq('id', frameId)
        if (clearErr) return { ok: false, error: `Could not stand down the live frame: ${clearErr.message}` }
    }

    const { error } = await supabase
        .from('event_frames')
        .update({ is_active: active })
        .eq('id', frameId)
        .eq('event_id', eventId)

    if (error) return { ok: false, error: `Could not change the frame: ${error.message}` }
    revalidatePath(`/organizer/events/${eventId}`)
    return { ok: true, data: null }
}

export async function deleteEventFrame(frameId: string, eventId: string): Promise<Result<null>> {
    const access = await resolveAccess(eventId)
    if (!access.ok) return access

    const supabase = await createClient()
    const { error } = await supabase
        .from('event_frames')
        .delete()
        .eq('id', frameId)
        .eq('event_id', eventId)

    if (error) return { ok: false, error: `Could not delete the frame: ${error.message}` }
    revalidatePath(`/organizer/events/${eventId}`)
    return { ok: true, data: null }
}
