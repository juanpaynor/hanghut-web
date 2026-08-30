import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { manilaDayStartISO, eventsNotEndedBefore } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

/**
 * Box office event picker.
 *
 * Mirrors /scan's access model rather than the organizer dashboard's: the people
 * working a door are often team members with no dashboard access at all, and the
 * cashier/scanner roles must be able to reach this from a phone.
 */
export default async function BoxOfficePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?next=/box-office')

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
                        You are not on the team for any organizer, so there is nothing to sell here.
                    </p>
                </div>
            </Shell>
        )
    }

    // An event that technically ended an hour ago is still the one being worked —
    // and a multi-day event on its second morning still has its doors open.
    // Filtering on start_datetime dropped the latter; see eventsNotEndedBefore.
    const { data: events } = await supabase
        .from('events')
        .select('id, title, start_datetime, end_datetime, venue_name, is_external')
        .in('organizer_id', partnerIds)
        .in('status', ['active', 'hidden'])
        .or(eventsNotEndedBefore(manilaDayStartISO()))
        .order('start_datetime', { ascending: true })

    // An external event's tickets live on someone else's platform — there is
    // nothing here to sell.
    const sellable = (events ?? []).filter((e) => !e.is_external)

    return (
        <Shell>
            <h1 className="text-2xl font-bold tracking-tight">Box office</h1>
            <p className="text-sm text-muted-foreground">Pick tonight&rsquo;s event.</p>

            <div className="mt-6 space-y-2">
                {sellable.length === 0 && (
                    <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                        No upcoming events to sell for.
                    </p>
                )}
                {sellable.map((e) => (
                    <Link
                        key={e.id}
                        href={`/box-office/${e.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                    >
                        <div className="min-w-0">
                            <p className="truncate font-medium">{e.title}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                {new Date(e.start_datetime).toLocaleString('en-PH', {
                                    weekday: 'short', month: 'short', day: 'numeric',
                                    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
                                })}
                                {e.venue_name && ` · ${e.venue_name}`}
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
