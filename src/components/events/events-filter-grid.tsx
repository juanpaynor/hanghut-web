'use client'

import { useState, useMemo } from 'react'
import { PublicEventCard } from '@/components/events/public-event-card'
import { EventHeroCarousel } from '@/components/events/event-hero-carousel'
import { EventRail } from '@/components/events/event-rail'
import { useDebounce } from '@/hooks/use-debounce'
import { Input } from '@/components/ui/input'
import { Search, Ticket, CalendarDays, ArrowDownUp, MapPin } from 'lucide-react'
import {
    pickSpotlightSlides,
    isBuyable,
    weekendWindow,
    inWindow,
    cityFacets,
    type DiscoveryEvent,
} from '@/lib/events/discovery'

interface Category {
    key: string
    label: string
    emoji: string | null
}

interface EventsFilterGridProps {
    events: DiscoveryEvent[]
    categories: Category[]
    /** Starred experiences. They join the HERO pool only — the rails and grid
     *  below stay events-only, since this is the events page. */
    heroExtras?: DiscoveryEvent[]
}

type SortKey = 'soon' | 'price_asc' | 'price_desc'
type DateKey = 'any' | 'today' | 'weekend' | 'week' | 'month'

const SORTS: { value: SortKey; label: string }[] = [
    { value: 'soon', label: 'Soonest' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
]

const DATE_FILTERS: { value: DateKey; label: string }[] = [
    { value: 'any', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: 'weekend', label: 'This weekend' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
]

// Returns [start, end) window for a date quick-filter, or null for "any time".
function dateWindow(key: DateKey): [Date, Date] | null {
    if (key === 'any') return null
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (key === 'today') {
        const end = new Date(startOfToday)
        end.setDate(end.getDate() + 1)
        return [now, end]
    }
    if (key === 'week') {
        const end = new Date(startOfToday)
        end.setDate(end.getDate() + 7)
        return [now, end]
    }
    if (key === 'month') {
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        return [now, end]
    }
    return weekendWindow(now)
}

const chip = (active: boolean) =>
    `shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
    }`

const chipSm = (active: boolean) =>
    `shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active
            ? 'bg-foreground text-background'
            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
    }`

export function EventsFilterGrid({ events, categories, heroExtras = [] }: EventsFilterGridProps) {
    const [activeCategory, setActiveCategory] = useState('all')
    const [activeCity, setActiveCity] = useState<string | null>(null)
    const [onlyOnHangHut, setOnlyOnHangHut] = useState(false)
    const [searchInput, setSearchInput] = useState('') // instant, bound to the input
    const searchQuery = useDebounce(searchInput, 250) // debounced, drives filtering
    const [sort, setSort] = useState<SortKey>('soon')
    const [dateKey, setDateKey] = useState<DateKey>('any')

    const categoryMeta = useMemo(() => {
        const m = new Map<string, Category>()
        for (const c of categories) m.set(c.key, c)
        return m
    }, [categories])

    // Only surface category chips that actually have live events.
    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const e of events) {
            if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1)
        }
        return counts
    }, [events])

    const activeCategories = useMemo(
        () => categories.filter(c => categoryCounts.has(c.key)),
        [categories, categoryCounts]
    )

    // The organizer chip row that used to live here was removed: it offered a
    // choice between the "Hanghut Select" house account and one other name, took
    // a full row on mobile, and surfaced an internal account as a brand. City is
    // the facet this catalogue actually varies on — 17 of them, previously
    // unfilterable.
    const cities = useMemo(() => cityFacets(events), [events])

    // ── Curated slices. Derived from the same array the grid filters, so no
    //    extra queries — the page already fetched everything.
    const heroSlides = useMemo(
        () => pickSpotlightSlides([...heroExtras, ...events]),
        [events, heroExtras]
    )
    const heroIds = useMemo(() => new Set(heroSlides.map(e => e.id)), [heroSlides])

    const onSale = useMemo(
        () =>
            events
                .filter(isBuyable)
                .filter(e => !heroIds.has(e.id))
                .sort(
                    (a, b) =>
                        new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
                )
                .slice(0, 12),
        [events, heroIds]
    )

    const thisWeekend = useMemo(() => {
        const win = weekendWindow()
        return events
            .filter(e => inWindow(e, win))
            .filter(e => !heroIds.has(e.id))
            .sort(
                (a, b) =>
                    new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
            )
            .slice(0, 12)
    }, [events, heroIds])

    const filteredEvents = useMemo(() => {
        let result = events

        if (activeCategory !== 'all') {
            result = result.filter(e => e.category === activeCategory)
        }

        if (activeCity) {
            result = result.filter(e => e.city === activeCity)
        }

        if (onlyOnHangHut) {
            result = result.filter(isBuyable)
        }

        const win = dateWindow(dateKey)
        if (win) {
            result = result.filter(e => inWindow(e, win))
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter(
                e =>
                    e.title?.toLowerCase().includes(q) ||
                    e.venue_name?.toLowerCase().includes(q) ||
                    e.city?.toLowerCase().includes(q)
            )
        }

        // Sort (copy first — never mutate the memoized source array)
        const sorted = [...result]
        if (sort === 'price_asc') {
            sorted.sort((a, b) => (a.ticket_price ?? 0) - (b.ticket_price ?? 0))
        } else if (sort === 'price_desc') {
            sorted.sort((a, b) => (b.ticket_price ?? 0) - (a.ticket_price ?? 0))
        } else {
            sorted.sort(
                (a, b) =>
                    new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
            )
        }
        return sorted
    }, [events, activeCategory, activeCity, onlyOnHangHut, searchQuery, sort, dateKey])

    const hasFilters =
        searchQuery.trim() !== '' ||
        activeCategory !== 'all' ||
        activeCity !== null ||
        onlyOnHangHut ||
        dateKey !== 'any'

    const clearFilters = () => {
        setActiveCategory('all')
        setActiveCity(null)
        setOnlyOnHangHut(false)
        setSearchInput('')
        setDateKey('any')
    }

    // The curated top of the page is a browsing surface. The moment someone
    // states an intent — a search, a category, a city — it becomes noise between
    // them and their answer, so it collapses and the grid takes over.
    const showCurated = !hasFilters

    const jumpToGrid = () => {
        document.getElementById('all-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    return (
        <>
            {/* Full-bleed and first. The hero IS the page's thesis, so it opens
                the page rather than sitting in a gutter below a title — and it
                breaks the container deliberately, unlike everything below it.
                Hidden once a filter is active, along with the rest of the
                curation. */}
            {showCurated && heroSlides.length > 0 && <EventHeroCarousel events={heroSlides} />}

            {/* Page header — slim on purpose. The old version led with
                "N upcoming events across N cities", which reads as a promise of N
                things to buy; most of them are listings that redirect off-site.
                The count now lives on the grid, where it describes results. */}
            <section className="container mx-auto px-4 pt-10">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight">
                            Discover Events
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Concerts, workshops, markets and more — across the Philippines.
                        </p>
                    </div>
                    <div className="relative w-full md:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search events, venues, cities..."
                            className="pl-10 h-11 bg-background"
                        />
                    </div>
                </div>
            </section>

            {showCurated && (
                <>
                    <EventRail
                        title="On sale now"
                        subtitle="Buy directly on HangHut"
                        events={onSale}
                        categoryMeta={categoryMeta}
                        onSeeAll={() => {
                            setOnlyOnHangHut(true)
                            jumpToGrid()
                        }}
                    />

                    <EventRail
                        title="This weekend"
                        events={thisWeekend}
                        categoryMeta={categoryMeta}
                        onSeeAll={() => {
                            setDateKey('weekend')
                            jumpToGrid()
                        }}
                    />

                    {/* Category counts are shown rather than hidden: the catalogue is
                        lopsided (workshops dominate), and saying so sets honest
                        expectations instead of implying even coverage. */}
                    {activeCategories.length > 1 && (
                        <section className="container mx-auto px-4 pt-10">
                            <h2 className="font-headline text-xl font-bold tracking-tight mb-4">
                                Browse by what you&rsquo;re into
                            </h2>
                            <div className="flex flex-wrap gap-2.5">
                                {activeCategories.map(cat => (
                                    <button
                                        key={cat.key}
                                        onClick={() => {
                                            setActiveCategory(cat.key)
                                            jumpToGrid()
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/40 hover:bg-muted/50 transition-colors"
                                    >
                                        {cat.emoji && <span aria-hidden>{cat.emoji}</span>}
                                        {cat.label}
                                        <span className="text-muted-foreground tabular-nums text-xs">
                                            {categoryCounts.get(cat.key)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* Filters (sticky under the fixed h-20 header) */}
            <section
                id="all-events"
                className="border-y bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-20 z-40 mt-12 scroll-mt-20"
            >
                <div className="container mx-auto px-4">
                    {/* Categories */}
                    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
                        <button onClick={() => setActiveCategory('all')} className={chip(activeCategory === 'all')}>
                            All Events
                        </button>
                        {activeCategories.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setActiveCategory(cat.key)}
                                className={`${chip(activeCategory === cat.key)} flex items-center gap-1.5`}
                            >
                                {cat.emoji && <span aria-hidden>{cat.emoji}</span>}
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Date + Sort row */}
                    <div className="flex flex-col gap-2 pb-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                            {DATE_FILTERS.map(d => (
                                <button
                                    key={d.value}
                                    onClick={() => setDateKey(d.value)}
                                    className={chipSm(dateKey === d.value)}
                                >
                                    {d.label}
                                </button>
                            ))}
                            <span className="w-px h-4 bg-border shrink-0 mx-1" />
                            <button
                                onClick={() => setOnlyOnHangHut(v => !v)}
                                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                    onlyOnHangHut
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }`}
                            >
                                On HangHut
                            </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                            <select
                                value={sort}
                                onChange={e => setSort(e.target.value as SortKey)}
                                className="h-8 rounded-md border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                aria-label="Sort events"
                            >
                                {SORTS.map(s => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Cities — the facet this catalogue actually varies on. */}
                    {cities.length > 1 && (
                        <div className="flex items-center gap-2 pb-3 overflow-x-auto no-scrollbar">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                            <button onClick={() => setActiveCity(null)} className={chipSm(!activeCity)}>
                                All cities
                            </button>
                            {cities.map(({ city, count }) => (
                                <button
                                    key={city}
                                    onClick={() => setActiveCity(city)}
                                    className={`${chipSm(activeCity === city)} flex items-center gap-1.5`}
                                >
                                    {city}
                                    <span className="tabular-nums opacity-60">{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Grid */}
            <main className="container mx-auto px-4 py-10">
                <div className="flex items-center gap-3 mb-6">
                    <p className="text-sm text-muted-foreground">
                        {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                        {searchQuery && <> for &ldquo;{searchQuery}&rdquo;</>}
                    </p>
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {filteredEvents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredEvents.map(event => {
                            const meta = event.category ? categoryMeta.get(event.category) : undefined
                            return (
                                <PublicEventCard
                                    key={event.id}
                                    event={event}
                                    categoryLabel={meta?.label}
                                    categoryEmoji={meta?.emoji ?? undefined}
                                />
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                            <Ticket className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">No events found</h2>
                        <p className="text-muted-foreground mb-6">
                            {hasFilters
                                ? 'No events match your filters. Try widening your search.'
                                : 'Check back soon for upcoming events!'}
                        </p>
                        {hasFilters && (
                            <button
                                onClick={clearFilters}
                                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}
            </main>
        </>
    )
}
