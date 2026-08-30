import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { EmbedEventCard } from '@/components/embed/embed-event-card'
import { EmbedThemeWrapper, type EmbedTheme } from '@/components/embed/embed-theme-wrapper'
import { eventsNotEndedBefore } from '@/lib/datetime'

// Always render fresh — a ticketing widget must reflect the organizer's current
// events immediately (adds/removes/edits). ISR caching served stale "old events".
export const dynamic = 'force-dynamic'

type EmbedLayout = 'grid' | 'list' | 'carousel'

export default async function EmbedStorefrontPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ primary?: string; bg?: string; text?: string; radius?: string; theme?: string; layout?: string }>
}) {
    const { slug } = await params
    const search = await searchParams

    const supabase = await createClient()

    // Fetch partner
    const { data: partner, error } = await supabase
        .from('partners')
        .select('id, business_name, slug, profile_photo_url, branding')
        .eq('slug', slug)
        .single()

    if (error || !partner) notFound()

    // Fetch upcoming events
    const now = new Date().toISOString()
    const { data: events } = await supabase
        .from('events')
        .select('id, title, description, start_datetime, end_datetime, venue_name, cover_image_url, ticket_price, event_type, capacity, tickets_sold')
        .eq('organizer_id', partner.id)
        .eq('status', 'active')
        .neq('invite_only', true)
        // Still-running counts as upcoming — see eventsNotEndedBefore. This widget
        // sits on the partner's OWN site, so a running event dropping out of it is
        // their homepage saying the show isn't on.
        .or(eventsNotEndedBefore(now))
        .order('start_datetime', { ascending: true })
        .limit(20)

    const upcomingEvents = events || []

    const theme: EmbedTheme = search.theme === 'dark' || search.theme === 'auto' ? search.theme : 'light'
    const layout: EmbedLayout = search.layout === 'list' || search.layout === 'carousel' ? search.layout : 'grid'

    // Container + card variant per layout.
    const containerStyle: React.CSSProperties =
        layout === 'list'
            ? { display: 'flex', flexDirection: 'column', gap: '10px' }
            : layout === 'carousel'
                ? { display: 'flex', gap: '14px', overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: '10px', WebkitOverflowScrolling: 'touch' }
                : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }

    return (
        <EmbedThemeWrapper
            primaryColor={search.primary}
            bgColor={search.bg}
            textColor={search.text}
            theme={theme}
        >
            <div style={{ padding: '16px' }}>
                {/* Minimal header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid rgba(128,128,128,0.15)',
                }}>
                    {partner.profile_photo_url && (
                        <img
                            src={partner.profile_photo_url}
                            alt={partner.business_name}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                            }}
                        />
                    )}
                    <span style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: 'var(--embed-text, inherit)',
                    }}>
                        {partner.business_name}
                    </span>
                </div>

                {/* Event grid / list / carousel */}
                {upcomingEvents.length > 0 ? (
                    <div style={containerStyle}>
                        {upcomingEvents.map((event: any) => (
                            layout === 'carousel' ? (
                                <div key={event.id} style={{ flex: '0 0 260px', scrollSnapAlign: 'start' }}>
                                    <EmbedEventCard event={event} variant="grid" />
                                </div>
                            ) : (
                                <EmbedEventCard key={event.id} event={event} variant={layout === 'list' ? 'list' : 'grid'} />
                            )
                        ))}
                    </div>
                ) : (
                    <div style={{
                        padding: '48px 16px',
                        textAlign: 'center',
                        color: 'var(--embed-text, #666)',
                        fontSize: '14px',
                    }}>
                        <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>No upcoming events</p>
                        <p>Check back soon for new events!</p>
                    </div>
                )}

                {/* Powered by */}
                <div style={{
                    textAlign: 'center',
                    marginTop: '20px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(128,128,128,0.15)',
                    fontSize: '11px',
                    color: '#999',
                }}>
                    Powered by <a href="https://hanghut.com" target="_blank" rel="noopener" style={{ color: '#999', fontWeight: 700, textDecoration: 'none' }}>HangHut</a>
                </div>
            </div>
        </EmbedThemeWrapper>
    )
}
