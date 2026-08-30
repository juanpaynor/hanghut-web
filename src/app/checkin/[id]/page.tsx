import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CheckinKiosk } from '@/components/checkin/kiosk'
import { getKioskCounts } from '@/lib/checkin/actions'

export const dynamic = 'force-dynamic'

export default async function CheckinKioskPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/login?next=/checkin/${id}`)

    const { data: event } = await supabase
        .from('events')
        .select('id, title, venue_name, organizer_id')
        .eq('id', id)
        .single()
    if (!event) notFound()

    // The database owns this rule (can_sell_at_door). Asking it directly keeps a
    // second copy of the role list from drifting out of sync with the RPC.
    const { data: allowed } = await supabase.rpc('can_sell_at_door', { p_org: event.organizer_id })
    if (!allowed) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
                    <h1 className="text-lg font-bold">Not your door</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        You don&rsquo;t have permission to check people in for this event.
                    </p>
                </div>
            </div>
        )
    }

    // FREE EVENTS ONLY — the same rule the RPC enforces, checked here so a paid
    // event never renders a screen that would refuse every guest who used it.
    const { data: isFree } = await supabase.rpc('event_is_free', { p_event_id: id })
    if (!isFree) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
                    <h1 className="text-lg font-bold">Not for ticketed events</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        The check-in desk is for free and RSVP events. Typing an email
                        isn&rsquo;t proof of a ticket, so paid events check in through the
                        scanner or the box office.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                        <a
                            href="/scan"
                            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                        >
                            Scanner
                        </a>
                        <a
                            href={`/box-office/${id}`}
                            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                        >
                            Box office
                        </a>
                    </div>
                </div>
            </div>
        )
    }

    // No page chrome: a guest is going to be looking at this, so the kiosk owns
    // the whole viewport and carries its own (staff-only) header.
    return (
        <CheckinKiosk
            eventId={id}
            eventTitle={event.title}
            venueName={event.venue_name}
            initialCounts={await getKioskCounts(id)}
        />
    )
}
