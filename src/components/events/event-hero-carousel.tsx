'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, MapPin, ArrowRight, ChevronLeft, ChevronRight, Ticket, BadgeCheck } from 'lucide-react'
import { formatEventDate, formatEventTime, formatEventDateWithEnd, isMultiDayEvent } from '@/lib/datetime'
import { isSoldOut, itemHref, type DiscoveryEvent } from '@/lib/events/discovery'

const AUTOPLAY_MS = 7000

/** Organizer records arrive as an object or a one-element array depending on the join. */
function organizerOf(event: DiscoveryEvent) {
    const o = (event as any).organizer
    return (Array.isArray(o) ? o[0] : o) ?? null
}

function whenLabel(event: DiscoveryEvent) {
    return isMultiDayEvent(event.start_datetime, event.end_datetime)
        ? formatEventDateWithEnd(event.start_datetime, event.end_datetime)
        : `${formatEventDate(event.start_datetime)} · ${formatEventTime(event.start_datetime)}`
}

function whereLabel(event: DiscoveryEvent) {
    // A real event has no venue sometimes (NEVER ON SUNDAY ships with both null),
    // so fall back rather than rendering a bare comma.
    return [event.venue_name, event.city].filter(Boolean).join(', ') || 'Venue to be announced'
}

function priceLabel(event: DiscoveryEvent) {
    return Number(event.ticket_price) === 0 ? 'Free' : `₱${Number(event.ticket_price).toLocaleString()}`
}

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
 *
 * LAYOUT NOTE — height comes from the poster's aspect ratio, never from `vh`.
 * The previous version was `h-[68vh]`, which ignores width: on a wide monitor
 * that renders a ~3:1 letterbox strip that reads as "thin", and `object-cover`
 * then crops organizer artwork to a band. Here the art sits in its own framed
 * panel at a fixed ratio, so the hero grows with the viewport instead of
 * flattening, and nothing is cropped to a sliver. Copy never overlaps the art
 * either — covers are organizer-supplied and routinely have their own baked-in
 * title and date, which used to collide with ours.
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

    const active = events[index]
    const activeOrganizer = organizerOf(active)
    const activeSoldOut = isSoldOut(active)
    const activeHref = itemHref(active)

    return (
        <section
            aria-roledescription="carousel"
            aria-label="Featured events"
            className="relative isolate w-full overflow-hidden bg-[#4f46e5]"
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
            {/* ── Brand bed ────────────────────────────────────────────────
                HangHut indigo, flat out. --lp-brand (#4f46e5) is the app's
                --primary held exactly — the same indigo as the Download app
                button in the header and every CTA below the fold — so the hero
                reads as ours on sight.
                No per-slide artwork bleeds out here on purpose. Tinting the bed
                with each cover dragged the hue toward whatever the organizer
                uploaded (and toward near-black on a dark poster), which is how
                the brand colour got lost. The event's own atmosphere lives
                inside the poster frame instead, where it belongs. */}
            <div className="absolute inset-0 -z-10 bg-[#4f46e5]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#3a30ad] via-[#4f46e5] to-[#6d5efc]" />
                {/* Light source behind the poster, so the frame sits in a glow
                    rather than on a flat field. */}
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(105% 85% at 78% 12%, rgba(167,158,255,0.55) 0%, rgba(109,94,252,0.30) 40%, rgba(58,48,173,0) 72%)',
                    }}
                />
                {/* Deepens the copy side. White on bare #6d5efc is about 4.3:1 —
                    fine for the headline, thin for the 13px meta lines. Under
                    this the copy column sits around #2f268f, which puts white
                    body text near 12:1. */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#241d78]/85 via-[#241d78]/35 to-transparent" />
                {/* A wide flat gradient bands badly on cheap panels. */}
                <div className="noise-texture absolute inset-0 opacity-[0.06] mix-blend-overlay" />
            </div>

            <div className="container relative mx-auto px-4 pb-8 pt-10 md:pb-10 md:pt-14">
                <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">

                    {/* ── Copy ─────────────────────────────────────────── */}
                    <div
                        key={active.id}
                        className="hh-hero-rise order-2 text-white lg:order-1 lg:col-span-5"
                    >
                        {/* On an indigo bed the chip and the active thumbnail are
                            white-tinted, not brand-tinted — indigo on indigo
                            reads as nothing. */}
                        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                            {active.kind === 'experience' ? 'Experience' : active.is_featured ? 'Featured' : 'Spotlight'}
                        </span>

                        <h2 className="font-headline mt-5 text-4xl font-extrabold leading-[1.03] tracking-tight drop-shadow-sm md:text-5xl xl:text-6xl">
                            <Link href={activeHref} className="rounded-sm outline-none transition-colors hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-transparent">
                                {active.title.trim()}
                            </Link>
                        </h2>

                        <dl className="mt-6 space-y-2.5 text-sm text-white/80">
                            <div className="flex items-start gap-2.5">
                                <dt className="sr-only">Date</dt>
                                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                                <dd className="font-medium">{whenLabel(active)}</dd>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <dt className="sr-only">Venue</dt>
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                                <dd>{whereLabel(active)}</dd>
                            </div>
                        </dl>

                        {activeOrganizer?.business_name && (
                            <div className="mt-5 flex items-center gap-2.5 border-t border-white/15 pt-5">
                                {activeOrganizer.profile_photo_url ? (
                                    <Image
                                        src={activeOrganizer.profile_photo_url}
                                        alt=""
                                        width={28}
                                        height={28}
                                        className="h-7 w-7 rounded-full object-cover ring-1 ring-white/25"
                                    />
                                ) : (
                                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-[11px] font-bold text-white">
                                        {activeOrganizer.business_name.charAt(0)}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-sm text-white/70">
                                    {activeOrganizer.business_name}
                                    {activeOrganizer.verified && <BadgeCheck className="h-3.5 w-3.5 text-white/60" />}
                                </span>
                            </div>
                        )}

                        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                            <Link
                                href={activeHref}
                                className="font-headline inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-neutral-900 shadow-xl transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#4f46e5] motion-reduce:transition-none motion-reduce:hover:scale-100"
                            >
                                {activeSoldOut ? 'Join waitlist' : active.kind === 'experience' ? 'Book now' : 'Get tickets'}
                                {!activeSoldOut && (
                                    <>
                                        <span className="opacity-30">·</span>
                                        <span>{priceLabel(active)}</span>
                                    </>
                                )}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            {!activeSoldOut && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
                                    <Ticket className="h-3.5 w-3.5" />
                                    Tickets available now
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Artwork ──────────────────────────────────────────
                        Its own framed panel at a fixed ratio. This is what sets
                        the hero's height, so the section scales with the window
                        rather than flattening on a wide one. */}
                    <div className="order-1 lg:order-2 lg:col-span-7">
                        <Link
                            href={activeHref}
                            tabIndex={-1}
                            aria-hidden="true"
                            className="group relative block aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#3a30ad] shadow-2xl shadow-black/50 ring-1 ring-white/15 md:rounded-3xl lg:aspect-[3/2]"
                        >
                            {events.map((event, i) => (
                                <div
                                    key={event.id}
                                    className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
                                        i === index ? 'opacity-100' : 'opacity-0'
                                    }`}
                                >
                                    {event.cover_image_url ? (
                                        <>
                                            {/* Posters arrive at every ratio — square gig
                                                art, 4:5 flyers, 16:9 photos. object-cover
                                                in a fixed frame guillotines the tall ones
                                                (GB Labrador lost the right third of his
                                                own name). So the poster is CONTAINED and
                                                never cropped, and the frame is filled by
                                                a blurred copy of that same poster rather
                                                than by empty bars. */}
                                            <Image
                                                src={event.cover_image_url}
                                                alt=""
                                                aria-hidden
                                                fill
                                                loading={i === 0 ? 'eager' : 'lazy'}
                                                sizes="640px"
                                                className="scale-125 object-cover opacity-70 blur-2xl"
                                            />
                                            <Image
                                                src={event.cover_image_url}
                                                alt={event.title}
                                                fill
                                                priority={i === 0}
                                                loading={i === 0 ? undefined : 'lazy'}
                                                sizes="(min-width: 1024px) 58vw, 100vw"
                                                className="object-contain drop-shadow-2xl"
                                            />
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 bg-gradient-to-br from-[#6d5efc] via-[#4f46e5] to-[#2e2a8f]" />
                                    )}
                                </div>
                            ))}
                            {activeSoldOut && (
                                <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                                    Sold out
                                </span>
                            )}
                        </Link>
                    </div>
                </div>

                {/* ── Slide rail ───────────────────────────────────────────
                    Replaces the dot row. Dots say "there are six of these";
                    thumbnails say what the other five actually are, which is the
                    only thing that makes a visitor press one. The bar under the
                    active thumb is the autoplay timer, so the movement is
                    explained before it happens rather than surprising a reader. */}
                {count > 1 && (
                    <div className="mt-8 flex items-end gap-4 border-t border-white/10 pt-5 md:mt-10">
                        <ul className="-mb-2 flex flex-1 snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {events.map((event, i) => (
                                <li key={event.id} className="snap-start">
                                    <button
                                        onClick={() => go(i)}
                                        aria-label={`Show ${event.title.trim()}`}
                                        aria-current={i === index}
                                        className={`group flex w-[172px] shrink-0 flex-col gap-2 rounded-lg p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-[196px] ${
                                            i === index ? 'bg-white/20 ring-1 ring-white/30' : 'hover:bg-white/10'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-white/10 ring-1 ring-white/15">
                                                {event.cover_image_url && (
                                                    <Image
                                                        src={event.cover_image_url}
                                                        alt=""
                                                        fill
                                                        sizes="56px"
                                                        className={`object-cover transition-opacity ${i === index ? 'opacity-100' : 'opacity-65 group-hover:opacity-100'}`}
                                                    />
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className={`block truncate text-xs font-semibold ${i === index ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                                                    {event.title.trim()}
                                                </span>
                                                <span className="mt-0.5 block truncate text-[11px] text-white/45">
                                                    {formatEventDate(event.start_datetime)}
                                                </span>
                                            </span>
                                        </div>
                                        <span className="block h-0.5 w-full overflow-hidden rounded-full bg-white/15">
                                            {i === index && (
                                                <span
                                                    key={`${event.id}-${paused}`}
                                                    className={paused ? 'block h-full w-full bg-white/50' : 'hh-hero-progress block h-full w-full bg-white'}
                                                    style={{ ['--hh-hero-ms' as any]: `${AUTOPLAY_MS}ms` }}
                                                />
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <div className="hidden shrink-0 items-center gap-2 pb-2 md:flex">
                            <span className="font-headline mr-1 text-xs tabular-nums text-white/50">
                                {String(index + 1).padStart(2, '0')}
                                <span className="mx-1 text-white/25">/</span>
                                {String(count).padStart(2, '0')}
                            </span>
                            <button
                                onClick={prev}
                                aria-label="Previous event"
                                className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                onClick={next}
                                aria-label="Next event"
                                className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}
