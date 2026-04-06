import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { EmbedEventCard } from '@/components/embed/embed-event-card'
import { EmbedThemeWrapper } from '@/components/embed/embed-theme-wrapper'

export const revalidate = 60

export default async function EmbedStorefrontPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ primary?: string; bg?: string; text?: string; radius?: string }>
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
        .gte('start_datetime', now)
        .order('start_datetime', { ascending: true })
        .limit(20)

    const upcomingEvents = events || []

    return (
        <EmbedThemeWrapper
            primaryColor={search.primary}
            bgColor={search.bg}
            textColor={search.text}
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

                {/* Event grid */}
                {upcomingEvents.length > 0 ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '16px',
                    }}>
                        {upcomingEvents.map((event: any) => (
                            <EmbedEventCard key={event.id} event={event} />
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
