'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, MapPin, ArrowRight, ChevronLeft, ChevronRight, Ticket } from 'lucide-react'
import { formatEventDate, formatEventTime } from '@/lib/datetime'
import { isSoldOut, itemHref, type DiscoveryEvent } from '@/lib/events/discovery'

const AUTOPLAY_MS = 7000

/**
 * Full-bleed hero carousel for /events.
 *
 * Which events appear is decided by pickSpotlightSlides() — starred first, so
 * the admin star toggle is effectively the marquee's running order.
 *
 * Capped at a handful of slides on purpose. On any carousel the overwhelming
 * majority of clicks land on the FIRST slide, so slide 5 earns far less than its
 * screen area suggests; more slides mostly dilutes slide 1 rather than adding
 * reach. Autoplay is slow, pauses on hover/focus, and is disabled outright under
 * prefers-reduced-motion — a hero that moves while someone is reading it is the
 * main way carousels annoy people.
 */
export function EventHeroCarousel({ events }: { events: DiscoveryEvent[] }) {
    const [index, setIndex] = useState(0)
    const [paused, setPaused] = useState(false)
    const touchStartX = useRef<number | null>(null)
    const count = events.length

    const go = useCallback((next: number) => {
        setIndex(((next % count) + count) % count)
    }, [count])

    const prev = useCallback(() => go(index - 1), [go, index])
    const next = useCallback(() => go(index + 1), [go, index])

    useEffect(() => {
        if (count < 2 || paused) return
        // Respect the OS setting rather than animating and hoping.
        if (typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

        const t = setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS)
        return () => clearInterval(t)
    }, [count, paused])

    if (count === 0) return null

    return (
        <section
            aria-roledescription="carousel"
            aria-label="Featured events"
            className="relative w-full h-[68vh] min-h-[460px] max-h-[720px] overflow-hidden bg-muted"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
            onKeyDown={e => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
                if (e.key === 'ArrowRight') { e.preventDefault(); next() }
            }}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
            onTouchEnd={e => {
                const start = touchStartX.current
                touchStartX.current = null
                if (start === null) return
                const dx = e.changedTouches[0].clientX - start
                if (Math.abs(dx) > 48) (dx < 0 ? next : prev)()
            }}
        >
            {events.map((event, i) => {
                const active = i === index
                const soldOut = isSoldOut(event)
                const organizer = Array.isArray(event.organizer)
                    ? (event.organizer[0] as any)
                    : (event.organizer as any)

                return (
                    <div
                        key={event.id}
                        aria-hidden={!active}
                        className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
                            active ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                    >
                        {event.cover_image_url ? (
                            <Image
                                src={event.cover_image_url}
                                alt=""
                                fill
                                // Only the first slide is above the fold on load;
                                // eagerly fetching all five would fight the LCP.
                                priority={i === 0}
                                loading={i === 0 ? undefined : 'lazy'}
                                sizes="100vw"
                                className="object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary to-primary/60" />
                        )}

                        {/* Heavy at the foot because cover art is organizer-supplied —
                            we can't assume a dark or quiet bottom edge behind the copy. */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />

                        <div className="relative h-full container mx-auto px-4 flex flex-col justify-end pb-16 md:pb-20 text-white">
                            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-md">
                                {event.kind === 'experience' ? 'Experience' : event.is_featured ? 'Featured' : 'Spotlight'}
                            </span>

                            <h2 className="font-headline mt-4 max-w-[18ch] text-4xl md:text-6xl font-extrabold leading-[1.02] tracking-tight drop-shadow-lg">
                                {event.title}
                            </h2>

                            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-white/85">
                                <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4" />
                                    {formatEventDate(event.start_datetime)} · {formatEventTime(event.start_datetime)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <MapPin className="h-4 w-4" />
                                    {event.venue_name}{event.city ? `, ${event.city}` : ''}
                                </span>
                                {organizer?.business_name && (
                                    <span className="hidden sm:inline text-white/70">
                                        {organizer.business_name}
                                    </span>
                                )}
                            </div>

                            <div className="mt-6 flex flex-wrap items-center gap-5">
                                <span className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-headline text-sm font-bold text-neutral-900 shadow-lg">
                                    {soldOut ? 'Join waitlist' : event.kind === 'experience' ? 'Book now' : 'Get tickets'}
                                    {!soldOut && (
                                        <>
                                            <span className="opacity-40">·</span>
                                            <span>
                                                {event.ticket_price === 0
                                                    ? 'Free'
                                                    : `₱${Number(event.ticket_price).toLocaleString()}`}
                                            </span>
                                        </>
                                    )}
                                    <ArrowRight className="h-4 w-4" />
                                </span>
                                {!soldOut && (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
                                        <Ticket className="h-3.5 w-3.5" />
                                        Tickets available now
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Whole-slide click target. Sits above the copy (which has no
                            interactive children) but BELOW the controls, so the arrows
                            and dots stay clickable without nesting buttons in a link.
                            tabIndex -1 when inactive keeps hidden slides out of the tab order. */}
                        <Link
                            href={itemHref(event)}
                            aria-label={event.title}
                            tabIndex={active ? 0 : -1}
                            className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/70"
                        />
                    </div>
                )
            })}

            {count > 1 && (
                <>
                    <button
                        onClick={prev}
                        aria-label="Previous event"
                        className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        onClick={next}
                        aria-label="Next event"
                        className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                        {events.map((e, i) => (
                            <button
                                key={e.id}
                                onClick={() => go(i)}
                                aria-label={`Go to slide ${i + 1}: ${e.title}`}
                                aria-current={i === index}
                                className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                                    i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70'
                                }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    )
}
