import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { EmbedThemeWrapper } from '@/components/embed/embed-theme-wrapper'
import { EmbedTicketButton } from '@/components/embed/embed-ticket-button'

export const revalidate = 30

export default async function EmbedEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ primary?: string; bg?: string; text?: string; radius?: string }>
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
            organizer:partners!events_organizer_id_fkey(
                business_name,
                profile_photo_url,
                slug
            ),
            ticket_tiers(
                id,
                name,
                price,
                quantity_total,
                quantity_sold,
                is_active
            )
        `)
        .eq('id', id)
        .eq('status', 'active')
        .single()

    if (error || !event) notFound()

    const isSoldOut = event.tickets_sold >= event.capacity
    const eventDate = new Date(event.start_datetime)
    const organizer = Array.isArray(event.organizer) ? event.organizer[0] : event.organizer
    const lowestPrice = event.ticket_tiers?.length > 0
        ? Math.min(...event.ticket_tiers.filter((t: any) => t.is_active).map((t: any) => Number(t.price)))
        : event.ticket_price

    return (
        <EmbedThemeWrapper
            primaryColor={search.primary}
            bgColor={search.bg}
            textColor={search.text}
        >
            <div style={{ overflow: 'hidden', borderRadius: '12px', border: '1px solid rgba(128,128,128,0.15)' }}>
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

                    {/* Buy Ticket button */}
                    <EmbedTicketButton
                        eventId={event.id}
                        isSoldOut={isSoldOut}
                    />
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
