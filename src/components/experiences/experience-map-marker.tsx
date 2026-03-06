import Image from 'next/image'

interface ExperienceMapMarkerProps {
    imageUrl?: string | null
    pricePerPerson: number
    currency?: string
    title: string
    glowColor?: string | null
}

/**
 * A map pin marker shaped like a rounded-rect body with a triangular pointer at the bottom.
 * Intended to be used as a custom Mapbox / Leaflet marker icon.
 * ~120×136px at full scale.
 */
export function ExperienceMapMarker({
    imageUrl,
    pricePerPerson,
    currency = 'PHP',
    title,
    glowColor,
}: ExperienceMapMarkerProps) {
    const symbol = currency === 'PHP' ? '₱' : currency

    return (
        <div
            className="relative flex flex-col items-center select-none"
            style={{ width: 120, filter: glowColor ? `drop-shadow(0 0 8px ${glowColor}88)` : undefined }}
        >
            {/* Pin body */}
            <div
                className="relative w-[120px] h-[112px] rounded-2xl overflow-hidden border-[3px] shadow-xl"
                style={{ borderColor: glowColor ?? '#ffffff' }}
            >
                {/* Background image */}
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="120px"
                        className="object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-white/60 text-center px-1 line-clamp-2">
                            {title}
                        </span>
                    </div>
                )}

                {/* Dark gradient overlay at bottom for price pill legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Price pill */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="bg-black/80 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                        {symbol}{pricePerPerson.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Triangular pointer */}
            <div
                className="w-0 h-0"
                style={{
                    borderLeft: '10px solid transparent',
                    borderRight: '10px solid transparent',
                    borderTop: `14px solid ${glowColor ?? '#ffffff'}`,
                    marginTop: -1,
                    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
                }}
            />
        </div>
    )
}
