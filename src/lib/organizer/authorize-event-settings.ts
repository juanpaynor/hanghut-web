import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActingPartnerId } from '@/lib/auth/cached'

/**
 * May this caller change this event's settings?
 *
 * ── WHY THIS LIVES IN ITS OWN FILE, WITHOUT 'use server' ────────────────────
 *
 * It started as a private helper inside registration-layout-actions.ts. The
 * moment a second settings file needed it, the obvious move was to export it
 * from there — and that would have been a security bug, not a refactor. Every
 * export of a 'use server' module is a callable RPC endpoint reachable from any
 * browser. An authorization helper is the last thing that should become one.
 *
 * A plain module has no such property: it can only be reached by server code
 * that imports it.
 *
 * ── WHY IT EXISTS AT ALL ────────────────────────────────────────────────────
 *
 * Every setter used to do `.eq('organizer_id', await getActingPartnerId(user.id))`
 * and give up if no row came back. That reads like an ownership check and is
 * not one: getActingPartnerId returns the partner the caller OWNS, and only
 * falls through to a platform-support seat when they own nothing. A platform
 * admin who also owns a partner of their own therefore resolves to their OWN
 * partner on every event in the system, so the lookup failed on every event
 * belonging to anyone else — silently, because the error read "Event not found
 * or unauthorized" and could equally have meant a bad id.
 *
 * It was wrong in the strict direction too: `events` already carries an
 * "Admins can update all events" RLS policy, so the database would have allowed
 * exactly what the app refused.
 *
 * ── THE THREE WAYS IN ───────────────────────────────────────────────────────
 *
 *   owner / platform-support seat  (getActingPartnerId, as before)
 *   any team member of the owning partner
 *   platform admin (users.is_admin — the COLUMN, never user_metadata, which
 *                   callers can set on themselves)
 *
 * Read with the admin client on purpose: the point is to make the decision
 * HERE, explicitly, rather than let an RLS predicate quietly return no rows and
 * leave the caller unable to tell "not allowed" from "does not exist".
 *
 * NOTE: the select list is shared by every caller. Adding a column here is
 * cheap; a caller that needs one must add it, or it reads back undefined.
 */
export async function authorizeEventSettings(eventId: string): Promise<
    { event: Record<string, any> } | { error: string }
> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = createAdminClient()
    const { data: event } = await admin
        .from('events')
        // Kept on ONE line on purpose: Supabase infers the row type by parsing
        // this string literal, and a concatenated one infers as an error type.
        .select('id, organizer_id, layout_config, require_approval, invite_only, ticket_price, status, start_datetime, sales_end_datetime, presale_starts_at, public_sale_starts_at, presale_registration_closes_at, presale_notified_at')
        .eq('id', eventId)
        .maybeSingle()
    if (!event) return { error: 'Event not found' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (actingPartnerId && event.organizer_id === actingPartnerId) return { event }

    const { data: member } = await admin
        .from('partner_team_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('partner_id', event.organizer_id)
        .maybeSingle()
    if (member) return { event }

    const { data: me } = await admin
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (me?.is_admin === true) return { event }

    return { error: 'You do not have access to this event.' }
}
