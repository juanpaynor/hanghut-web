'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActingPartnerId } from '@/lib/auth/cached'

export type RegistrationFormLayout = 'stepper' | 'single'

/**
 * How the registration questions are presented to attendees.
 *
 * Lives in events.layout_config alongside the tier display settings rather than
 * in its own column — it is presentation, it has a sane default, and adding a
 * column per knob is how a table ends up 60 wide.
 *
 * 'stepper' (the original) walks one question per screen. 'single' puts the
 * whole form on one page, which is what partners with 4+ questions ask for
 * every time.
 */
export async function setRegistrationFormLayout(
    eventId: string,
    layout: RegistrationFormLayout,
): Promise<{ success?: boolean; error?: string }> {
    if (layout !== 'stepper' && layout !== 'single') return { error: 'Unknown layout' }

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'Partner account not found' }

    const { data: event } = await supabase
        .from('events')
        .select('id, layout_config')
        .eq('id', eventId)
        .eq('organizer_id', actingPartnerId)
        .maybeSingle()

    if (!event) return { error: 'Event not found or unauthorized' }

    // Merge, never replace — layout_config also carries the tier display config.
    const current = (event.layout_config ?? {}) as Record<string, unknown>
    const next = { ...current, registration: { ...(current.registration as object ?? {}), layout } }

    const { error } = await supabase
        .from('events')
        .update({ layout_config: next })
        .eq('id', eventId)
        .eq('organizer_id', actingPartnerId)

    if (error) {
        console.error('setRegistrationFormLayout failed', error)
        return { error: 'Could not save the layout.' }
    }

    // Only the organizer page: the public event page is force-dynamic, so
    // revalidating it would be a no-op that implies caching it doesn't have.
    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
