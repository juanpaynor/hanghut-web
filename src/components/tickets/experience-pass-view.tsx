import { TicketQR } from '@/components/tickets/ticket-qr'
import { TicketPdfButton } from '@/components/tickets/ticket-pdf-button'
import { CalendarClock, MapPin, Users, Clock3, CheckCircle2 } from 'lucide-react'
import { formatEventDateTimeWithEnd } from '@/lib/datetime'

/**
 * The hosted experience pass.
 *
 * Built on the events ticket page's design language on purpose — same 28rem
 * column, same stacked rounded cards, same QR block, the same on-demand PDF
 * button — because a guest who has bought a ticket and booked an experience
 * should not be able to tell they came from two different products. What it
 * does NOT borrow is the organizer template/branding machinery: experiences
 * have no ticket design config, and rendering a template picker against data
 * that cannot fill it would be inventing a feature rather than matching a look.
 */

interface ExperienceInfo {
    id: string
    title: string
    venue_name: string | null
    start_datetime: string | null
    end_datetime: string | null
    cover_image_url: string | null
}

export interface ExperienceBooking {
    booking_id: string
    reference: string
    guest_name: string | null
    quantity: number
    status: string
    check_in_status: string
    qr_code: string
    total_amount: number | null
    experience: ExperienceInfo
    host: { name: string | null; logo_url: string | null }
}

/**
 * A booking's state in one badge, from TWO columns.
 *
 * `status` is whether it was paid for; `check_in_status` is whether the guest
 * turned up. Only a completed booking can be checked in, so check-in wins when
 * both say something.
 */
function statusBadge(booking: ExperienceBooking) {
    if (booking.status === 'refunded') return { label: 'Refunded', className: 'bg-red-100 text-red-700' }
    if (booking.status === 'failed' || booking.status === 'expired') {
        return { label: 'Not confirmed', className: 'bg-red-100 text-red-700' }
    }
    if (booking.status === 'pending') return { label: 'Awaiting payment', className: 'bg-amber-100 text-amber-800' }
    if (booking.check_in_status === 'checked_in') return { label: 'Checked in', className: 'bg-slate-200 text-slate-700' }
    if (booking.check_in_status === 'no_show') return { label: 'No show', className: 'bg-slate-200 text-slate-700' }
    return { label: 'Confirmed', className: 'bg-green-100 text-green-700' }
}

export function ExperiencePassView({ booking }: { booking: ExperienceBooking }) {
    const { experience, host } = booking
    const badge = statusBadge(booking)

    // A pass is only a pass once it is paid for. Everything else gets the
    // explanation instead of a QR that would be refused at the door.
    const isConfirmed = booking.status === 'completed'
    const isSpent = booking.check_in_status === 'checked_in' || booking.check_in_status === 'no_show'

    // Pinned to Manila by the shared helper: this renders on the server (UTC)
    // while My Tickets renders in the browser, and without a fixed zone the
    // same booking showed two different dates.
    const when = experience.start_datetime
        ? formatEventDateTimeWithEnd(experience.start_datetime, experience.end_datetime)
        : null

    return (
        <div className="relative min-h-screen bg-muted/30 px-4 py-8">
            <div className="mx-auto w-full max-w-md space-y-4">
                {/* Experience header */}
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    {experience.cover_image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={experience.cover_image_url} alt="" className="h-40 w-full object-cover" />
                    )}
                    <div className="space-y-2 p-5">
                        {(host.logo_url || host.name) && (
                            <div className="flex items-center gap-2 pb-1">
                                {host.logo_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={host.logo_url} alt="" className="h-8 w-8 rounded-full border object-cover" />
                                )}
                                {host.name && (
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Hosted by {host.name}
                                    </span>
                                )}
                            </div>
                        )}
                        <h1 className="text-xl font-bold tracking-tight">{experience.title}</h1>
                        {when && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarClock className="h-4 w-4 shrink-0" /> {when}
                            </p>
                        )}
                        {experience.venue_name && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0" /> {experience.venue_name}
                            </p>
                        )}
                    </div>
                </div>

                {!isConfirmed ? (
                    <div className="rounded-2xl border bg-background p-8 text-center">
                        <Clock3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm font-medium">
                            {booking.status === 'pending'
                                ? 'Your booking isn’t confirmed yet'
                                : 'This booking isn’t active'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {booking.status === 'pending'
                                ? 'If you just paid, it’ll appear here shortly. Refresh in a moment.'
                                : `This booking is ${badge.label.toLowerCase()}. Contact your host if that looks wrong.`}
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="px-1 text-sm text-muted-foreground">
                            {booking.quantity} {booking.quantity === 1 ? 'guest' : 'guests'}
                            {booking.guest_name ? ` · ${booking.guest_name}` : ''}
                        </p>

                        {/* The pass itself — the events "classic" card, with the
                            guest count in the seat row's place. */}
                        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                            <div className="flex items-center justify-between border-b px-5 py-3">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <Users className="h-4 w-4" />
                                    {booking.quantity > 1 ? `Party of ${booking.quantity}` : 'Experience pass'}
                                </span>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                                    {badge.label}
                                </span>
                            </div>
                            <div className="flex flex-col items-center gap-3 p-5">
                                <div className={isSpent ? 'opacity-40 grayscale' : ''}>
                                    <TicketQR value={booking.qr_code} size={200} />
                                </div>
                                <p className="font-mono text-xs text-muted-foreground">{booking.reference}</p>
                                {booking.check_in_status === 'checked_in' && (
                                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Already checked in
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-center pt-2">
                            <TicketPdfButton
                                eventTitle={experience.title}
                                eventDate={when}
                                venue={experience.venue_name}
                                organizer={host.name}
                                fileSuffix="pass"
                                footerNote="Present this to your host on arrival"
                                tickets={[{
                                    ticket_number: booking.reference,
                                    qr_code: booking.qr_code,
                                    tier: booking.quantity > 1 ? `${booking.quantity} guests` : '1 guest',
                                    seat: null,
                                }]}
                            />
                        </div>

                        <p className="px-1 text-center text-xs text-muted-foreground">
                            Show this screen to your host on arrival. A screenshot works too.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
