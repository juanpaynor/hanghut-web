import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { EmbedThemeWrapper, type EmbedTheme } from '@/components/embed/embed-theme-wrapper'
import { resolveFont } from '@/lib/event-fonts'
import { eventHref } from '@/lib/events/urls'
import { EmbedTicketButton } from '@/components/embed/embed-ticket-button'
import { EmbedTierSelector } from '@/components/embed/embed-tier-selector'
import { isTierOnSale, isTierVisible } from '@/lib/tickets/tier-availability'
import { getEventTierModes } from '@/lib/tickets/tier-modes'

// Always render fresh so ticket availability / sold-out / price changes show
// immediately in the embed instead of a cached snapshot.
export const dynamic = 'force-dynamic'

export default async function EmbedEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ primary?: string; bg?: string; text?: string; radius?: string; theme?: string; design?: string }>
}) {
    const { id } = await params
    const search = await searchParams

    const supabase = await createClient()

    const { data: event, error } = await supabase
        .from('events')
        .select(`
            id,
            title,
            start_datetime,
            end_datetime,
            venue_name,
            address,
            city,
            cover_image_url,
            ticket_price,
            event_type,
            capacity,
            tickets_sold,
            slug,
            max_seats_per_order,
            seating_type,
            theme_color,
            layout_config,
            organizer:partners!events_organizer_id_fkey(
                business_name,
                profile_photo_url,
                slug
            ),
            ticket_tiers(
                id,
                name,
                description,
                price,
                quantity_total,
                quantity_sold,
                is_active,
                sort_order,
                perks,
                highlight,
                badge_label,
                accent_color
            )
        `)
        .eq('id', id)
        .in('status', ['active', 'hidden'])
        .single()

    if (error || !event) notFound()

    const eventDate = new Date(event.start_datetime)
    const organizer = Array.isArray(event.organizer) ? event.organizer[0] : event.organizer
    const activeTiers = (event.ticket_tiers || []).filter((t: any) => isTierOnSale(t))

    // Tiers are the authority, matching the full event page. events.capacity
    // and ticket_tiers.quantity_total are edited in different tabs and never
    // sync -- they disagree for 20% of live events -- and checkout gates only
    // on the tier, so capacity here was a second ceiling that could mark an
    // embed Sold Out while the event was still selling perfectly well on
    // hanghut.com. Capacity is still the answer for tierless legacy events.
    const isSoldOut = activeTiers.length > 0
        ? !activeTiers.some((t: any) => Number(t.quantity_total ?? 0) - Number(t.quantity_sold ?? 0) > 0)
        : event.tickets_sold >= event.capacity

    // Mixed events: the embed sells GENERAL ADMISSION ONLY.
    //
    // A seated tier bought by quantity does not oversell -- the money path
    // auto-assigns best-available -- but it hands the buyer seats they never
    // saw, and seat selection needs the map, which does not belong in a
    // publisher's iframe tile. So seated tiers are withheld here and pointed at
    // the full event page instead.
    //
    // If the modes can't be resolved we withhold EVERY tier rather than guess.
    // An embed that shows nothing but a working link is a worse ad; an embed
    // that silently sells reserved seats by quantity is a worse bug.
    let embedTiers = activeTiers
    let seatedCount = 0
    if (event.seating_type === 'mixed') {
        const modes = await getEventTierModes(event.id)
        embedTiers = modes
            ? activeTiers.filter((t: any) => modes.get(t.id) === 'ga')
            : []
        seatedCount = activeTiers.length - embedTiers.length
    }
    const lowestPrice = activeTiers.length > 0
        ? Math.min(...activeTiers.map((t: any) => Number(t.price)))
        : event.ticket_price

    /**
     * design=event — wear the event page's own design.
     *
     * The widget used to have a design system entirely separate from the page
     * it advertises: three hex inputs and a light/dark switch, against the
     * event page's art-directed themes, accent and eight-font picker. An
     * organizer who styled their page got a generic box on their own website.
     *
     * Opt-in, not default: turning this on for every existing embed would
     * silently restyle live publisher sites. Explicit data-* attributes still
     * win, so a publisher who set their own colours keeps them.
     */
    const inherit = search.design === 'event'
    const lc: any = event.layout_config || {}
    const inheritedFont = inherit ? resolveFont(lc.font_body || lc.font_heading) : null

    return (
        <EmbedThemeWrapper
            primaryColor={search.primary ?? (inherit ? (event.theme_color || undefined) : undefined)}
            bgColor={search.bg}
            textColor={search.text ?? (inherit ? (lc.text_color || undefined) : undefined)}
            theme={search.theme === 'dark' || search.theme === 'auto' ? (search.theme as EmbedTheme) : 'light'}
            radius={search.radius}
            fontCss={inheritedFont?.css}
            fontUrl={inheritedFont?.url || undefined}
        >
            <div style={{ overflow: 'hidden', borderRadius: 'var(--embed-radius, 12px)', border: '1px solid rgba(128,128,128,0.15)' }}>
                {/* Cover image */}
                {event.cover_image_url && (
                    <div style={{ position: 'relative', width: '100%', paddingTop: '50%', overflow: 'hidden' }}>
                        <img
                            src={event.cover_image_url}
                            alt={event.title}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                        {/* Category badge */}
                        {event.event_type && (
                            <span style={{
                                position: 'absolute',
                                top: '12px',
                                left: '12px',
                                background: 'rgba(0,0,0,0.55)',
                                color: '#fff',
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                backdropFilter: 'blur(4px)',
                            }}>
                                {event.event_type}
                            </span>
                        )}
                        {/* Sold out badge */}
                        {isSoldOut && (
                            <span style={{
                                position: 'absolute',
                                top: '12px',
                                right: '12px',
                                background: '#ef4444',
                                color: '#fff',
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                            }}>
                                Sold Out
                            </span>
                        )}
                    </div>
                )}

                {/* Event details */}
                <div style={{ padding: '20px' }}>
                    <h2 style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        lineHeight: 1.3,
                        marginBottom: '12px',
                        color: 'var(--embed-text, inherit)',
                    }}>
                        {event.title}
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {/* Date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--embed-text, #666)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span style={{ fontWeight: 500 }}>
                                {format(eventDate, 'EEEE, MMMM d · h:mm a')}
                            </span>
                        </div>

                        {/* Location */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--embed-text, #666)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>{event.venue_name}{event.city ? `, ${event.city}` : ''}</span>
                        </div>

                        {/* Price */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--embed-text, #666)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                            </svg>
                            <span style={{ fontWeight: 600 }}>
                                {lowestPrice === 0 ? 'Free' : `From ₱${lowestPrice.toLocaleString()}`}
                            </span>
                        </div>
                    </div>

                    {/* Organizer row */}
                    {organizer && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '16px',
                            paddingTop: '12px',
                            borderTop: '1px solid rgba(128,128,128,0.12)',
                            fontSize: '12px',
                            color: 'var(--embed-text, #888)',
                        }}>
                            {organizer.profile_photo_url && (
                                <img
                                    src={organizer.profile_photo_url}
                                    alt=""
                                    style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                            )}
                            <span>by <strong>{organizer.business_name}</strong></span>
                        </div>
                    )}

                    {/* Tier selector (multi-tier) or simple buy button (single price) */}
                    {embedTiers.length > 0 ? (
                        <EmbedTierSelector
                            eventId={event.id}
                            tiers={embedTiers}
                            maxPerOrder={event.max_seats_per_order || 10}
                        />
                    ) : activeTiers.length === 0 ? (
                        <EmbedTicketButton
                            eventId={event.id}
                            isSoldOut={isSoldOut}
                        />
                    ) : null}

                    {/* Reserved seating lives on the event page, where the map
                        has room to work. */}
                    {seatedCount > 0 && (
                        <a
                            href={`https://hanghut.com${eventHref(event as any)}`}
                            target="_blank"
                            rel="noopener"
                            style={{
                                display: 'block',
                                marginTop: embedTiers.length > 0 ? '10px' : '0',
                                padding: '10px',
                                textAlign: 'center',
                                fontSize: '13px',
                                fontWeight: 600,
                                borderRadius: 'var(--embed-radius, 8px)',
                                border: '1px solid rgba(128,128,128,0.25)',
                                textDecoration: 'none',
                                color: 'inherit',
                            }}
                        >
                            {seatedCount === 1 ? 'Reserved seating' : 'Reserved seating options'} — pick a seat
                        </a>
                    )}
                </div>

                {/* Powered by */}
                <div style={{
                    textAlign: 'center',
                    padding: '10px',
                    borderTop: '1px solid rgba(128,128,128,0.12)',
                    fontSize: '10px',
                    color: '#aaa',
                }}>
                    Powered by <a href="https://hanghut.com" target="_blank" rel="noopener" style={{ color: '#aaa', fontWeight: 700, textDecoration: 'none' }}>HangHut</a>
                </div>
            </div>
        </EmbedThemeWrapper>
    )
}
