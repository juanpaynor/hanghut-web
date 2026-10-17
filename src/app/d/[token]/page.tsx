import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import type { Metadata } from 'next'
import Image from 'next/image'
import { CalendarDays, MapPin, ClipboardList } from 'lucide-react'
import { getAttendeeDetails, classifyToken } from '@/lib/events/attendee-detail-actions'
import { AttendeeDetailsClient } from '@/components/attendee/attendee-details-client'

/**
 * /d/<token> — fill in the details for each attendee on a booking.
 *
 * An order used to collect ONE set of answers however many tickets it bought,
 * so a group purchase gave the organizer one shirt size and one emergency
 * contact for six different people. Checkout is being fixed to ask per
 * attendee; this page is how the tickets already sold get their answers, from
 * the only person we hold an address for — the buyer.
 *
 * The token in the URL is the authorization and there is no sign-in. Two kinds
 * are accepted and `classifyToken` tells them apart by shape: an order's
 * access_token, which the buyer already has from their ticket email, or a
 * sublink the buyer minted for one attendee.
 *
 * An order token opens every ticket its buyer holds on that event. Group buys
 * are frequently several separate orders rather than one -- on Sinadya Run,
 * every affected buyer bought one ticket at a time -- so scoping a slot list to
 * a single order would show most of them one slot and hide the rest.
 */

// Never cached and never indexed. The content is one booking's personal data,
// it changes the moment someone saves, and a cached copy on a shared link would
// show one household's answers to the next.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Attendee details',
    robots: { index: false, follow: false, nocache: true },
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'Asia/Manila',
    })
}

export default async function AttendeeDetailsPage({
    params,
}: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!classifyToken(token)) notFound()

    noStore()
    const bundle = await getAttendeeDetails(token)
    if (!bundle.found || !bundle.event) notFound()

    const { event, organizer } = bundle
    const slots = bundle.tickets ?? []
    const outstanding = slots.filter(s => !s.status.complete).length

    return (
        <main className="min-h-screen bg-background">
            <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
                <header className="mb-8">
                    <div className="flex items-center gap-3 mb-5">
                        {organizer?.logo_url ? (
                            <Image
                                src={organizer.logo_url} alt={organizer.name ?? ''}
                                width={40} height={40}
                                className="rounded-full object-cover h-10 w-10"
                            />
                        ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                {organizer?.name ?? 'Event organizer'}
                            </p>
                            <h1 className="text-xl font-semibold tracking-tight truncate">{event.title}</h1>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mb-6">
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" />
                            {formatDate(event.start_datetime)}
                        </span>
                        {event.venue_name && (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {event.venue_name}
                            </span>
                        )}
                    </div>

                    {bundle.closed ? (
                        <p className="rounded-lg border bg-muted/30 p-4 text-sm">
                            This event has already taken place, so its attendee details are closed for
                            changes. Nothing below can be edited.
                        </p>
                    ) : (
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                            <p className="font-medium text-foreground">
                                {outstanding === 0
                                    ? 'Everything the organizer needs is on file.'
                                    : slots.length > 1
                                        ? `${organizer?.name ?? 'The organizer'} needs a few details for each person on this booking.`
                                        : `${organizer?.name ?? 'The organizer'} needs a few details for this ticket.`}
                            </p>
                            {outstanding > 0 && (
                                <p className="text-muted-foreground">
                                    {slots.length > 1
                                        ? 'Only one set of answers was collected across these tickets, so we need each attendee separately. You can also send any of them their own link to fill in.'
                                        : 'It only takes a minute, and it is what gets them in without a queue at the door.'}
                                </p>
                            )}
                            {outstanding === 0 && (
                                <p className="text-muted-foreground">
                                    You can still change anything below if something is wrong.
                                </p>
                            )}
                        </div>
                    )}
                </header>

                {bundle.closed
                    ? null
                    : <AttendeeDetailsClient bundle={bundle} token={token} />}

                <p className="mt-10 text-xs text-muted-foreground">
                    Only {organizer?.name ?? 'the organizer'} can see these answers. They use them to run
                    the event — sizing, safety and getting you through the door.
                </p>
            </div>
        </main>
    )
}
