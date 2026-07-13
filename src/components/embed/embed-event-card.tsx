'use client'

import { format } from 'date-fns'

interface EmbedEventCardProps {
    event: {
        id: string
        title: string
        start_datetime: string
        venue_name: string
        cover_image_url: string | null
        ticket_price: number
        event_type?: string
        capacity?: number
        tickets_sold?: number
    }
    variant?: 'grid' | 'list'
}

export function EmbedEventCard({ event, variant = 'grid' }: EmbedEventCardProps) {
    const isSoldOut = typeof event.capacity === 'number' && typeof event.tickets_sold === 'number'
        ? event.tickets_sold >= event.capacity
        : false

    const handleClick = () => {
        // Open the checkout flow in the parent modal
        const checkoutUrl = `${window.location.origin}/checkout?eventId=${event.id}&quantity=1&embed=true`
        window.parent.postMessage({
            type: 'HANGHUT_OPEN_CHECKOUT',
            url: checkoutUrl,
        }, '*')
    }

    const priceLabel = event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`
    const hover = {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.10)'
        },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
        },
    }

    // ── List / compact variant ──────────────────────────────
    if (variant === 'list') {
        return (
            <div
                onClick={handleClick}
                {...hover}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '12px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid rgba(128,128,128,0.15)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    background: 'var(--embed-bg, #fff)',
                }}
            >
                {/* Thumbnail */}
                <div style={{ position: 'relative', width: '96px', flexShrink: 0, alignSelf: 'stretch', minHeight: '96px', background: '#f3f4f6' }}>
                    {event.cover_image_url ? (
                        <img
                            src={event.cover_image_url}
                            alt={event.title}
                            loading="lazy"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: isSoldOut ? 'grayscale(1)' : 'none' }}
                        />
                    ) : (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '24px' }}>🎫</div>
                    )}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0, padding: '10px 12px 10px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
                    <h3 style={{
                        fontSize: '14px', fontWeight: 700, lineHeight: 1.35, color: 'var(--embed-text, inherit)',
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                        {event.title}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--embed-text, #888)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{format(new Date(event.start_datetime), 'EEE, MMM d · h:mm a')}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--embed-text, #888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.venue_name}
                    </div>
                </div>

                {/* Price / status */}
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', flexShrink: 0 }}>
                    <span style={{
                        fontSize: '13px', fontWeight: 700,
                        color: isSoldOut ? '#ef4444' : 'var(--embed-primary, var(--embed-text, #111))',
                    }}>
                        {isSoldOut ? 'Sold Out' : priceLabel}
                    </span>
                </div>
            </div>
        )
    }

    // ── Grid variant (default) ──────────────────────────────
    return (
        <div
            onClick={handleClick}
            {...hover}
            style={{
                cursor: 'pointer',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid rgba(128,128,128,0.15)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                background: 'var(--embed-bg, #fff)',
                height: '100%',
            }}
        >
            {/* Image */}
            <div style={{ position: 'relative', width: '100%', paddingTop: '60%', overflow: 'hidden' }}>
                {event.cover_image_url ? (
                    <img
                        src={event.cover_image_url}
                        alt={event.title}
                        loading="lazy"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: isSoldOut ? 'grayscale(1)' : 'none',
                        }}
                    />
                ) : (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f3f4f6',
                        color: '#ccc',
                        fontSize: '32px',
                    }}>
                        🎫
                    </div>
                )}

                {/* Price badge */}
                <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(255,255,255,0.92)',
                    color: '#111',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                }}>
                    {priceLabel}
                </span>

                {/* Category badge */}
                {event.event_type && (
                    <span style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        background: 'rgba(0,0,0,0.5)',
                        color: '#fff',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backdropFilter: 'blur(4px)',
                    }}>
                        {event.event_type}
                    </span>
                )}

                {isSoldOut && (
                    <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: '#ef4444',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                    }}>
                        Sold Out
                    </span>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '14px' }}>
                <h3 style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    lineHeight: 1.4,
                    marginBottom: '8px',
                    color: 'var(--embed-text, inherit)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                }}>
                    {event.title}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--embed-text, #888)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span style={{ fontWeight: 500, color: 'var(--embed-text, #333)' }}>
                            {format(new Date(event.start_datetime), 'EEE, MMM d')}
                        </span>
                        <span>{format(new Date(event.start_datetime), 'h:mm a')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--embed-text, #888)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {event.venue_name}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
