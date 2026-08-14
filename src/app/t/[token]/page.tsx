import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TicketQR } from '@/components/tickets/ticket-qr'
import { TicketPdfButton } from '@/components/tickets/ticket-pdf-button'
import { CalendarClock, MapPin, Ticket as TicketIcon, Armchair, CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEventDateTime } from '@/lib/datetime'

// Per-URL ISR: the page is keyed by an unguessable token and its content is
// effectively immutable (event, seat, QR payload). Cache it so on-sale spikes
// don't hammer the DB; live check-in status is owned by the gate scanner.
export const revalidate = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TicketTemplate = 'classic' | 'boarding' | 'minimal'
type TicketTheme = 'light' | 'dark'
type TicketBackground = 'default' | 'brand' | 'event'

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
interface TicketLink { label?: string; url?: string }
interface TicketBranding {
    colors?: { primary?: string; accent?: string }
    ticket?: {
        message?: string
        banner_url?: string
        template?: TicketTemplate
        theme?: TicketTheme
        background?: TicketBackground
        show_pdf?: boolean
        show_ticket_number?: boolean
        show_hint?: boolean
        footer?: string
        links?: TicketLink[]
    }
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

function safeUrl(url: string): string {
    const u = url.trim()
    if (/^https?:\/\//i.test(u)) return u
    if (/^(mailto:|tel:)/i.test(u)) return u
    return `https://${u}`
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

    // ── Host ticket-page design ─────────────────────────────
    const design = organizer?.branding?.ticket || {}
    const template: TicketTemplate = design.template ?? 'classic'
    const theme: TicketTheme = design.theme ?? 'light'
    const background: TicketBackground = design.background ?? 'default'
    const showPdf = design.show_pdf !== false
    const showNumber = design.show_ticket_number !== false
    const showHint = design.show_hint !== false
    const footer = design.footer?.trim()
    const links = (design.links || []).filter((l): l is Required<TicketLink> => !!l?.label && !!l?.url)

    const ticketMessage = design.message?.trim()
    const bannerUrl = design.banner_url
    const headerImage = bannerUrl || event.cover_image_url
    const showBanner = template !== 'minimal' && !!headerImage
    const isDark = theme === 'dark'
    const isEventBg = background === 'event' && !!headerImage

    // Page background per host choice.
    const pageClass =
        background === 'default' ? 'bg-muted/30' :
        background === 'event' ? 'bg-background' : ''
    const pageStyle: React.CSSProperties | undefined =
        background === 'brand' && accent
            ? { background: `linear-gradient(180deg, ${accent}22, ${accent}0a)` }
            : background === 'brand'
                ? undefined
                : undefined

    // Pinned to Manila: this page renders on the server (UTC), My Tickets renders in
    // the browser. Without a fixed zone the same ticket showed two different dates.
    const eventDate = event.start_datetime ? formatEventDateTime(event.start_datetime) : null

    // ── Per-template ticket card ────────────────────────────
    function TicketCard({ t }: { t: OrderTicket }) {
        const badge = statusBadge(t.status)
        const seat = seatLine(t.seat_info)
        const isUsed = t.status === 'used'
        const tColor = tierColor(t.tier_sort)

        if (template === 'minimal') {
            return (
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="flex flex-col items-center gap-3 p-6">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={tColor ? { color: tColor } : undefined}>
                            <TicketIcon className="h-3.5 w-3.5" /> {t.tier || 'General'}
                            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${badge.className}`}>{badge.label}</span>
                        </div>
                        <div className={isUsed ? 'opacity-40 grayscale' : ''}>
                            <TicketQR value={t.qr_code || t.id} size={220} />
                        </div>
                        {seat && (
                            <p className="flex items-center gap-1.5 text-sm font-semibold">
                                <Armchair className="h-4 w-4 text-muted-foreground" /> {seat}
                            </p>
                        )}
                        {showNumber && t.ticket_number && (
                            <p className="font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                        )}
                        {isUsed && <p className="text-xs font-medium text-slate-500">Already checked in</p>}
                    </div>
                </div>
            )
        }

        if (template === 'boarding') {
            return (
                <div
                    className="flex items-stretch overflow-hidden rounded-2xl border bg-background shadow-sm"
                    style={tColor ? { borderLeft: `5px solid ${tColor}` } : undefined}
                >
                    {/* Info stub */}
                    <div className="flex flex-1 flex-col justify-between gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-semibold" style={tColor ? { color: tColor } : undefined}>
                                <TicketIcon className="h-4 w-4" /> {t.tier || 'General'}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
                        </div>
                        {seat && (
                            <p className="flex items-center gap-1.5 text-sm font-semibold">
                                <Armchair className="h-4 w-4 text-muted-foreground" /> {seat}
                            </p>
                        )}
                        {showNumber && t.ticket_number && (
                            <p className="font-mono text-[11px] text-muted-foreground">{t.ticket_number}</p>
                        )}
                        {isUsed && <p className="text-[11px] font-medium text-slate-500">Already checked in</p>}
                    </div>
                    {/* Perforation */}
                    <div className="relative flex items-center">
                        <div className="h-full border-l-2 border-dashed border-muted-foreground/30" />
                        <span className="absolute -top-2 -left-2 h-4 w-4 rounded-full bg-muted/60" />
                        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-muted/60" />
                    </div>
                    {/* QR stub */}
                    <div className="flex flex-col items-center justify-center p-4">
                        <div className={isUsed ? 'opacity-40 grayscale' : ''}>
                            <TicketQR value={t.qr_code || t.id} size={124} />
                        </div>
                    </div>
                </div>
            )
        }

        // classic (default)
        return (
            <div
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
                    {showNumber && t.ticket_number && (
                        <p className="font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                    )}
                    {isUsed && (
                        <p className="text-xs font-medium text-slate-500">Already checked in</p>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className={cn('relative min-h-screen py-8 px-4', isDark && 'dark', pageClass)} style={pageStyle}>
            {/* Blurred event image background */}
            {isEventBg && (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={headerImage!} alt="" aria-hidden className="fixed inset-0 -z-10 h-full w-full object-cover" style={{ filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.15)' }} />
                    <div aria-hidden className="fixed inset-0 -z-10 bg-black/30" />
                </>
            )}

            <div className="relative mx-auto w-full max-w-md space-y-4">
                {/* Event header */}
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    {showBanner && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={headerImage!} alt="" className="h-40 w-full object-cover" />
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
                        {tickets.map((t) => <TicketCard key={t.id} t={t} />)}

                        {/* Host links / call-to-action */}
                        {links.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2 pt-1">
                                {links.map((l, i) => (
                                    <a
                                        key={i}
                                        href={safeUrl(l.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:bg-accent"
                                        style={accent ? { borderColor: `${accent}55` } : undefined}
                                    >
                                        {l.label}
                                        <ExternalLink className="h-3 w-3 opacity-50" />
                                    </a>
                                ))}
                            </div>
                        )}

                        {showPdf && (
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
                        )}

                        {footer ? (
                            <p className="px-1 text-center text-xs text-muted-foreground whitespace-pre-line">{footer}</p>
                        ) : showHint ? (
                            <p className="px-1 text-center text-xs text-muted-foreground">
                                Show this screen at the entrance. A screenshot works too.
                            </p>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    )
}
