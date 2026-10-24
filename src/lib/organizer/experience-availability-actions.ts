'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Availability rules for an experience.
 *
 * A host declares a PATTERN ("every Saturday at 2pm, 8 guests") and
 * `extend_experience_availability` materialises real experience_schedules rows
 * from it out to a rolling 90-day horizon. A nightly cron pushes that horizon
 * forward, so a listing with an ongoing rule can never lapse into the state
 * that made /experiences render an empty page: seven listings, six slot rows
 * ever created, none of them upcoming.
 *
 * Slots stay the unit of booking — reserve_experience locks a schedule ROW and
 * capacity lives on it. A rule has nothing to lock, which is why rules generate
 * rows rather than replacing them.
 *
 * Writes go through RLS (host of the parent listing only); generation goes
 * through the RPC, which re-checks host_id itself because it is SECURITY
 * DEFINER and writes schedules on the host's behalf.
 */

import type { RuleInput, AvailabilityRule } from '@/lib/organizer/experience-availability'

/** Mirrors the table's CHECK constraints so a bad rule fails here with a
 *  sentence rather than at the database with a constraint name. */
function validate(rule: RuleInput): string | null {
    if (!rule.byweekday?.length) return 'Pick at least one day of the week'
    if (rule.byweekday.some(d => d < 0 || d > 6)) return 'Invalid day of the week'
    if (!/^\d{2}:\d{2}$/.test(rule.start_time_local || '')) return 'Pick a start time'
    if (!(rule.duration_minutes > 0 && rule.duration_minutes <= 1440)) return 'Duration must be between 1 minute and 24 hours'
    if (!(rule.max_guests > 0)) return 'Capacity must be at least 1 guest'
    if (!rule.starts_on) return 'Pick a start date'
    if (rule.ends_on && rule.ends_on < rule.starts_on) return 'The end date cannot be before the start date'
    return null
}

export async function listAvailabilityRules(experienceId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('experience_availability_rules')
        .select('id, table_id, byweekday, start_time_local, duration_minutes, starts_on, ends_on, max_guests, price_per_person, is_active')
        .eq('table_id', experienceId)
        .order('created_at', { ascending: true })

    if (error) return { error: error.message }
    return { rules: (data ?? []) as AvailabilityRule[] }
}

/**
 * Create or update a rule, then generate immediately for THIS listing so the
 * host sees real dates on the next screen rather than waiting for the nightly
 * sweep. The RPC is idempotent, so calling it here and again at 02:10 is safe.
 */
export async function saveAvailabilityRule(
    experienceId: string,
    rule: RuleInput,
    ruleId?: string,
) {
    const invalid = validate(rule)
    if (invalid) return { error: invalid }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const row = {
        table_id: experienceId,
        byweekday: rule.byweekday,
        start_time_local: rule.start_time_local,
        duration_minutes: rule.duration_minutes,
        starts_on: rule.starts_on,
        ends_on: rule.ends_on || null,
        max_guests: rule.max_guests,
        price_per_person: rule.price_per_person ?? null,
        is_active: true,
    }

    // RLS ("Hosts manage their availability rules") is the authorisation here —
    // a rule on someone else's listing fails the policy rather than needing a
    // separate ownership read.
    const { data, error } = ruleId
        ? await supabase
              .from('experience_availability_rules')
              .update({ ...row, updated_at: new Date().toISOString() })
              .eq('id', ruleId)
              .select('id')
              .single()
        : await supabase
              .from('experience_availability_rules')
              .insert(row)
              .select('id')
              .single()

    if (error) return { error: error.message }

    const generated = await regenerateAvailability(experienceId)
    // The edit page is at [id]/edit -- revalidating `/organizer/experiences/<id>`
    // matched no route at all, so a saved session kept showing the old rules
    // until a hard reload. The Calendar reads the slots these rules generate,
    // so it has to be revalidated too or the new dates appear only on refresh.
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    revalidatePath('/organizer/experiences/calendar')

    return { success: true as const, id: data.id, ...generated }
}

/**
 * Switch a rule off rather than deleting it. Deactivating lets the pruner
 * clean up the future unbooked slots it produced; deleting the row would set
 * experience_schedules.generated_from_rule_id to NULL (ON DELETE SET NULL) and
 * strand those slots as un-prunable manual ones. SET NULL is deliberate — a
 * CASCADE would destroy dates people may already have booked.
 */
export async function deactivateAvailabilityRule(ruleId: string, experienceId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('experience_availability_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', ruleId)

    if (error) return { error: error.message }

    const generated = await regenerateAvailability(experienceId)
    // The edit page is at [id]/edit -- revalidating `/organizer/experiences/<id>`
    // matched no route at all, so a saved session kept showing the old rules
    // until a hard reload. The Calendar reads the slots these rules generate,
    // so it has to be revalidated too or the new dates appear only on refresh.
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const, ...generated }
}

/** Close a single date across every rule on the listing (a holiday, a trip). */
export async function addBlackout(experienceId: string, date: string, reason?: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('experience_availability_blackouts')
        .upsert(
            { table_id: experienceId, blackout_date: date, reason: reason || null },
            { onConflict: 'table_id,blackout_date' },
        )

    if (error) return { error: error.message }

    const generated = await regenerateAvailability(experienceId)
    // The edit page is at [id]/edit -- revalidating `/organizer/experiences/<id>`
    // matched no route at all, so a saved session kept showing the old rules
    // until a hard reload. The Calendar reads the slots these rules generate,
    // so it has to be revalidated too or the new dates appear only on refresh.
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const, ...generated }
}

export async function removeBlackout(experienceId: string, date: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('experience_availability_blackouts')
        .delete()
        .eq('table_id', experienceId)
        .eq('blackout_date', date)

    if (error) return { error: error.message }

    const generated = await regenerateAvailability(experienceId)
    // The edit page is at [id]/edit -- revalidating `/organizer/experiences/<id>`
    // matched no route at all, so a saved session kept showing the old rules
    // until a hard reload. The Calendar reads the slots these rules generate,
    // so it has to be revalidated too or the new dates appear only on refresh.
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    revalidatePath('/organizer/experiences/calendar')
    return { success: true as const, ...generated }
}

/**
 * Materialise + prune for one listing. Separate from the nightly sweep, which
 * passes no id and is refused to anyone holding a JWT.
 */
export async function regenerateAvailability(experienceId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('extend_experience_availability', {
        p_table_id: experienceId,
        p_days: 90,
    })

    // A generation failure must not lose the rule the host just saved — it is
    // recoverable (the nightly sweep will pick it up), so it is reported, not
    // thrown.
    if (error) {
        console.error('extend_experience_availability failed:', error.message)
        return { generated: null, generateError: error.message }
    }

    const result = data as { created: number; pruned: number; horizon_to: string } | null
    return { generated: result, generateError: null }
}

/**
 * How many bookable dates a listing actually has. The wizard cannot publish on
 * zero, which is the entire point of this feature: three live listings on prod
 * had never had a single date created, and nothing told their hosts.
 */
export async function countUpcomingSlots(experienceId: string) {
    const supabase = await createClient()
    const { count, error } = await supabase
        .from('experience_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', experienceId)
        .gt('start_time', new Date().toISOString())
        .neq('status', 'cancelled')

    if (error) return { error: error.message, count: 0 }
    return { count: count ?? 0 }
}
