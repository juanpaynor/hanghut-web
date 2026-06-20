import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TicketQR } from '@/components/tickets/ticket-qr'
import { TicketPdfButton } from '@/components/tickets/ticket-pdf-button'
import { CalendarClock, MapPin, Ticket as TicketIcon, Armchair, CheckCircle2 } from 'lucide-react'

// Per-URL ISR: the page is keyed by an unguessable token and its content is
// effectively immutable (event, seat, QR payload). Cache it so on-sale spikes
// don't hammer the DB; live check-in status is owned by the gate scanner.
export const revalidate = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface SeatInfo { section?: string; row?: string; seat?: number; label?: string }
interface OrderTicket {
    id: string
    ticket_number: string | null
    qr_code: string | null
    status: string
    tier: string | null
    tier_sort: number | null
    seat_info: SeatInfo | null
}
interface TicketBranding {
    colors?: { primary?: string; accent?: string }
    ticket?: { message?: string; banner_url?: string }
}
interface TicketOrder {
    order_id: string
    buyer_name: string | null
    event: { id: string; title: string; venue_name: string | null; start_datetime: string | null; cover_image_url: string | null }
    organizer: { name: string | null; logo_url: string | null; branding: TicketBranding | null }
    tickets: OrderTicket[]
}

// Same palette the builder/buyer map use, so a tier's color is stable everywhere.
const TIER_PALETTE = [
    '#f59e0b', '#6366f1', '#22c55e', '#ec4899',
    '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6',
    '#f43f5e', '#3b82f6', '#84cc16', '#d946ef',
]
function tierColor(sort: number | null): string | null {
    if (sort == null) return null
    return TIER_PALETTE[((sort % TIER_PALETTE.length) + TIER_PALETTE.length) % TIER_PALETTE.length]
}

// Cookieless anon client — keeps this page statically cacheable (reading cookies
// would force dynamic rendering on every request).
function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

function statusBadge(status: string) {
    switch (status) {
        case 'used':
            return { label: 'Checked in', className: 'bg-slate-200 text-slate-700' }
        case 'cancelled':
        case 'refunded':
            return { label: 'Void', className: 'bg-red-100 text-red-700' }
        default:
            return { label: 'Valid', className: 'bg-green-100 text-green-700' }
    }
}

function seatLine(s: SeatInfo | null): string | null {
    if (!s) return null
    const parts: string[] = []
    if (s.section) parts.push(s.section)
    if (s.row) parts.push(`Row ${s.row}`)
    if (s.seat != null) parts.push(`Seat ${s.seat}`)
    if (parts.length === 0 && s.label) return s.label
    return parts.length ? parts.join(' · ') : null
}

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!UUID_RE.test(token)) notFound()

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_ticket_order', { p_token: token })
    if (error || !data) notFound()

    const order = data as TicketOrder
    const { event, organizer, tickets } = order
    const accent = organizer?.branding?.colors?.accent || organizer?.branding?.colors?.primary
    const ticketMessage = organizer?.branding?.ticket?.message?.trim()
    const bannerUrl = organizer?.branding?.ticket?.banner_url
    const headerImage = bannerUrl || event.cover_image_url

    const eventDate = event.start_datetime
        ? new Date(event.start_datetime).toLocaleString('en-PH', {
            weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
        : null

    return (
        <div className="min-h-screen bg-muted/30 py-8 px-4">
            <div className="mx-auto w-full max-w-md space-y-4">
                {/* Event header */}
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    {headerImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={headerImage} alt="" className="h-40 w-full object-cover" />
                    )}
                    <div className="space-y-2 p-5" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
                        {/* Organizer logo + name */}
                        {(organizer?.logo_url || organizer?.name) && (
                            <div className="flex items-center gap-2 pb-1">
                                {organizer?.logo_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={organizer.logo_url} alt="" className="h-8 w-8 rounded-full border object-cover" />
                                )}
                                {organizer?.name && (
                                    <span className="text-xs font-medium text-muted-foreground">{organizer.name}</span>
                                )}
                            </div>
                        )}
                        <h1 className="text-xl font-bold tracking-tight">{event.title}</h1>
                        {eventDate && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarClock className="h-4 w-4 shrink-0" /> {eventDate}
                            </p>
                        )}
                        {event.venue_name && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0" /> {event.venue_name}
                            </p>
                        )}
                    </div>
                    {/* Organizer's custom note */}
                    {ticketMessage && (
                        <div
                            className="border-t px-5 py-3 text-sm"
                            style={accent ? { background: `${accent}12`, color: 'inherit' } : { background: 'rgba(99,102,241,0.06)' }}
                        >
                            {ticketMessage}
                        </div>
                    )}
                </div>

                {tickets.length === 0 ? (
                    <div className="rounded-2xl border bg-background p-8 text-center">
                        <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm font-medium">Your tickets aren&apos;t ready yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            If you just paid, they&apos;ll appear here shortly. Refresh in a moment.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="px-1 text-sm text-muted-foreground">
                            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
                            {order.buyer_name ? ` · ${order.buyer_name}` : ''}
                        </p>
                        {tickets.map((t) => {
                            const badge = statusBadge(t.status)
                            const seat = seatLine(t.seat_info)
                            const isUsed = t.status === 'used'
                            const tColor = tierColor(t.tier_sort)
                            return (
                                <div
                                    key={t.id}
                                    className="overflow-hidden rounded-2xl border bg-background shadow-sm"
                                    style={tColor ? { borderLeft: `4px solid ${tColor}` } : undefined}
                                >
                                    <div className="flex items-center justify-between border-b px-5 py-3">
                                        <span className="flex items-center gap-2 text-sm font-medium">
                                            <TicketIcon className="h-4 w-4" style={tColor ? { color: tColor } : undefined} />
                                            {t.tier || 'General'}
                                        </span>
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center gap-3 p-5">
                                        <div className={isUsed ? 'opacity-40 grayscale' : ''}>
                                            <TicketQR value={t.qr_code || t.id} size={200} />
                                        </div>
                                        {seat && (
                                            <p className="flex items-center gap-1.5 text-sm font-semibold">
                                                <Armchair className="h-4 w-4 text-muted-foreground" /> {seat}
                                            </p>
                                        )}
                                        {t.ticket_number && (
                                            <p className="font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                                        )}
                                        {isUsed && (
                                            <p className="text-xs font-medium text-slate-500">Already checked in</p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        <div className="flex justify-center pt-2">
                            <TicketPdfButton
                                eventTitle={event.title}
                                eventDate={eventDate}
                                venue={event.venue_name}
                                organizer={organizer?.name ?? null}
                                tickets={tickets.map((t) => ({
                                    ticket_number: t.ticket_number,
                                    qr_code: t.qr_code || t.id,
                                    tier: t.tier,
                                    seat: seatLine(t.seat_info),
                                }))}
                            />
                        </div>
                        <p className="px-1 text-center text-xs text-muted-foreground">
                            Show this screen at the entrance. A screenshot works too.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
