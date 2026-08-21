'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { HERO_MAX } from '@/lib/events/discovery'

/**
 * Admin controls for a single event: featuring it, and changing its visibility.
 *
 * Every action here re-checks `is_user_admin` ITSELF rather than relying on
 * app/admin/layout.tsx. That layout guards page RENDERS; a server action is its
 * own POST endpoint, reachable by anyone who can guess the action id, so a
 * layout redirect does not protect it. (Several older admin actions call
 * createAdminClient with no check at all — deliberately not copied here.)
 */

/**
 * Statuses an admin may set from the dashboard.
 *
 * Deliberately EXCLUDES 'cancelled', 'sold_out' and 'completed':
 *  - `cancelled` is a money-path action. The event may have sold tickets, and a
 *    real cancellation has to settle refunds, reverse the ledger and notify
 *    buyers. Flipping the column alone would look successful while stranding
 *    paid customers.
 *  - `sold_out` and `completed` are DERIVED states — capacity and the clock own
 *    them. Setting them by hand puts the row out of step with reality.
 * What's left is exactly the visibility question an admin actually needs:
 * is this event published, hidden, paused, or still a draft.
 */
export const ADMIN_SETTABLE_STATUSES = ['draft', 'active', 'paused', 'hidden'] as const
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number]

export async function setEventStatus(
    eventId: string,
    status: AdminSettableStatus
): Promise<{ success: true } | { error: string }> {
    if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
        // Never trust the client for an allowlist — this is a server action, i.e.
        // its own POST endpoint, callable with any payload.
        return { error: `Status "${status}" cannot be set from admin` }
    }

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminRole, error: roleError } = await supabase.rpc('is_user_admin')
    if (roleError || !adminRole) return { error: 'Not authorised' }

    const admin = createAdminClient()

    // Refuse to move an event OUT of a state this function can't set. Otherwise a
    // cancelled event could be quietly resurrected to 'active' from here, which is
    // the cancel path in reverse and just as unsafe.
    const { data: current, error: readError } = await admin
        .from('events')
        .select('status')
        .eq('id', eventId)
        .single()

    if (readError || !current) return { error: readError?.message ?? 'Event not found' }
    if (!ADMIN_SETTABLE_STATUSES.includes(current.status as AdminSettableStatus)) {
        return { error: `This event is ${current.status} and can't be changed from admin` }
    }

    const { error } = await admin
        .from('events')
        .update({ status })
        .eq('id', eventId)

    if (error) return { error: error.message }

    revalidatePath('/admin/events')
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/events')
    return { success: true }
}

/**
 * Star / unstar an event for the /events hero carousel.
 *
 * `events.is_featured` has existed for a long time and the admin table already
 * drew a star for it, but nothing could ever SET it — so the starred branch of
 * pickSpotlightSlides() in lib/events/discovery was unreachable. This is that
 * control. Starring is exclusive: star anything and the carousel becomes exactly
 * the starred set.
 */
export async function setEventFeatured(
    eventId: string,
    featured: boolean
): Promise<{ success: true } | { error: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminRole, error: roleError } = await supabase.rpc('is_user_admin')
    if (roleError || !adminRole) return { error: 'Not authorised' }

    // Refuse the star rather than accept it and drop it at render time.
    if (featured) {
        const { total } = await countStarred()
        if (total >= HERO_MAX) return { error: heroFullMessage(total) }
    }

    // Service role for the write: is_featured is not something a normal client
    // session is granted, and the caller has just been proven to be an admin.
    const { error } = await createAdminClient()
        .from('events')
        .update({ is_featured: featured })
        .eq('id', eventId)

    if (error) return { error: error.message }

    revalidatePath('/admin/events')
    revalidatePath('/events')
    return { success: true }
}

/**
 * How many things are currently starred, across BOTH pools.
 *
 * Events and experiences share one hero, so they share one budget — counting
 * them separately would let 7 + 7 be starred and silently drop half.
 * Past items don't count: they can't appear in the carousel, so they must not
 * consume a slot.
 */
async function countStarred(): Promise<{ events: number; experiences: number; total: number }> {
    const admin = createAdminClient()

    const [{ count: eventCount }, { data: expRows }] = await Promise.all([
        admin
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('is_featured', true)
            .gte('start_datetime', new Date().toISOString()),
        admin
            .from('tables')
            .select('id')
            .eq('is_featured', true)
            .eq('is_experience', true),
    ])

    const events = eventCount ?? 0
    const experiences = expRows?.length ?? 0
    return { events, experiences, total: events + experiences }
}

/** Star / unstar an EXPERIENCE (a `tables` row) for the hero carousel. */
export async function setExperienceFeatured(
    experienceId: string,
    featured: boolean
): Promise<{ success: true } | { error: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: adminRole, error: roleError } = await supabase.rpc('is_user_admin')
    if (roleError || !adminRole) return { error: 'Not authorised' }

    if (featured) {
        const { total } = await countStarred()
        if (total >= HERO_MAX) {
            return { error: heroFullMessage(total) }
        }
    }

    const { error } = await createAdminClient()
        .from('tables')
        .update({ is_featured: featured })
        .eq('id', experienceId)
        .eq('is_experience', true)

    if (error) return { error: error.message }

    revalidatePath('/admin/experiences')
    revalidatePath('/events')
    return { success: true }
}

function heroFullMessage(total: number): string {
    return `The hero carousel is full (${total} of ${HERO_MAX}). Unstar something first.`
}
