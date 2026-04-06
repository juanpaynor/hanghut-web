'use client'

interface EmbedTicketButtonProps {
    eventId: string
    isSoldOut: boolean
}

export function EmbedTicketButton({ eventId, isSoldOut }: EmbedTicketButtonProps) {
    const handleClick = () => {
        if (isSoldOut) return

        const checkoutUrl = `${window.location.origin}/checkout?eventId=${eventId}&quantity=1&embed=true`
        window.parent.postMessage({
            type: 'HANGHUT_OPEN_CHECKOUT',
            url: checkoutUrl,
        }, '*')
    }

    return (
        <button
            onClick={handleClick}
            disabled={isSoldOut}
            style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '10px',
                border: 'none',
                fontSize: '15px',
                fontWeight: 700,
                cursor: isSoldOut ? 'not-allowed' : 'pointer',
                background: isSoldOut
                    ? '#e5e7eb'
                    : 'var(--embed-primary, #000)',
                color: isSoldOut
                    ? '#9ca3af'
                    : '#fff',
                transition: 'opacity 0.2s, transform 0.15s',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => {
                if (!isSoldOut) (e.currentTarget as HTMLElement).style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1'
            }}
        >
            {isSoldOut ? 'Sold Out' : '🎫 Get Tickets'}
        </button>
    )
}
