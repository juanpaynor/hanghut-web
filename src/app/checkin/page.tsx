import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { manilaDayStartISO, eventsNotEndedBefore } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

/**
 * Check-in kiosk event picker.
 *
 * Same access model as /scan and /box-office: door staff are often team members
 * with no dashboard access, reaching this from a phone or a propped-up tablet.
 */
export default async function CheckinPickerPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?next=/checkin')

    const partnerIds: string[] = []

    const { data: owned } = await supabase
        .from('partners').select('id').eq('user_id', user.id).maybeSingle()
    if (owned) partnerIds.push(owned.id)

    const { data: memberships } = await supabase
        .from('partner_team_members')
        .select('partner_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('role', ['owner', 'manager', 'scanner', 'cashier'])
    memberships?.forEach((m) => partnerIds.push(m.partner_id))

    if (partnerIds.length === 0) {
        return (
            <Shell>
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <h1 className="text-lg font-bold">No door access</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        You are not on the team for any organizer, so there is no door to work here.
                    </p>
                </div>
            </Shell>
        )
    }

    // An event that ended an hour ago is still the one being worked, and a
    // multi-day event on its second morning still has its doors open.
    const { data: events } = await supabase
        .from('events')
        .select('id, title, start_datetime, end_datetime, venue_name, is_external, ticket_price')
        .in('organizer_id', partnerIds)
        .in('status', ['active', 'hidden'])
        .or(eventsNotEndedBefore(manilaDayStartISO()))
        .order('start_datetime', { ascending: true })

    // An external event's attendees are on someone else's platform — there is
    // nobody here to check in.
    const local = (events ?? []).filter((e) => !e.is_external)

    // FREE EVENTS ONLY. Typing an email is not authentication — anyone who knows
    // an attendee's address could claim their seat. That is a fair trade for a
    // free RSVP door and not for a ticketed one, which uses /scan (verifies a QR)
    // or the box office (operated by staff). Mirrors event_is_free() server-side;
    // the RPC refuses a paid event regardless, this just keeps them off the list.
    const paidEventIds = new Set<string>()
    if (local.length > 0) {
        const { data: paidTiers } = await supabase
            .from('ticket_tiers')
            .select('event_id')
            .in('event_id', local.map((e) => e.id))
            .gt('price', 0)
        paidTiers?.forEach((t) => paidEventIds.add(t.event_id))
    }
    const workable = local.filter(
        (e) => !paidEventIds.has(e.id) && Number(e.ticket_price ?? 0) === 0,
    )

    return (
        <Shell>
            <h1 className="text-2xl font-bold tracking-tight">Check-in desk</h1>
            <p className="text-sm text-muted-foreground">
                Free and RSVP events. Pick tonight&rsquo;s, then hand the screen to your guests.
            </p>

            <div className="mt-6 space-y-2">
                {workable.length === 0 && (
                    <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                        No upcoming free events to check in for. The check-in desk is
                        for free and RSVP events — ticketed events use the scanner or
                        the box office.
                    </p>
                )}
                {workable.map((e) => (
                    <Link
                        key={e.id}
                        href={`/checkin/${e.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                    >
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{e.title}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                {new Date(e.start_datetime).toLocaleString('en-PH', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                    timeZone: 'Asia/Manila',
                                })}
                                {e.venue_name ? ` · ${e.venue_name}` : ''}
                            </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </Link>
                ))}
            </div>
        </Shell>
    )
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background px-4 py-8">
            <div className="mx-auto w-full max-w-2xl">{children}</div>
        </div>
    )
}
