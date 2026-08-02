'use client'

import { useState, useMemo } from 'react'
import { PublicEventCard } from '@/components/events/public-event-card'
import { useDebounce } from '@/hooks/use-debounce'
import { Input } from '@/components/ui/input'
import { Search, Ticket, User, CalendarDays, ArrowDownUp } from 'lucide-react'

interface Category {
    key: string
    label: string
    emoji: string | null
}

interface EventsFilterGridProps {
    events: any[]
    categories: Category[]
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
    // weekend: upcoming Sat 00:00 → Mon 00:00 (if it's already the weekend, use the current one)
    const day = startOfToday.getDay() // 0 Sun … 6 Sat
    const satOffset = day === 0 ? -1 : 6 - day // Sun rolls back to yesterday's Sat
    const sat = new Date(startOfToday)
    sat.setDate(sat.getDate() + satOffset)
    const mon = new Date(sat)
    mon.setDate(mon.getDate() + 2)
    return [now > sat ? now : sat, mon]
}

export function EventsFilterGrid({ events, categories }: EventsFilterGridProps) {
    const [activeCategory, setActiveCategory] = useState('all')
    const [activeOrganizer, setActiveOrganizer] = useState<string | null>(null)
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
    const activeCategories = useMemo(() => {
        const counts = new Map<string, number>()
        for (const e of events) {
            if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1)
        }
        return categories.filter((c) => counts.has(c.key))
    }, [events, categories])

    const organizers = useMemo(() => {
        const orgMap = new Map<string, any>()
        for (const e of events) {
            const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer
            if (org?.id && !orgMap.has(org.id)) {
                orgMap.set(org.id, {
                    id: org.id,
                    business_name: org.business_name,
                    profile_photo_url: org.profile_photo_url,
                })
            }
        }
        return Array.from(orgMap.values()).sort((a, b) =>
            a.business_name.localeCompare(b.business_name)
        )
    }, [events])

    const cityCount = useMemo(() => {
        const cities = new Set<string>()
        for (const e of events) if (e.city) cities.add(e.city)
        return cities.size
    }, [events])

    const filteredEvents = useMemo(() => {
        let result = events

        if (activeCategory !== 'all') {
            result = result.filter((e) => e.category === activeCategory)
        }

        if (activeOrganizer) {
            result = result.filter((e) => e.organizer_id === activeOrganizer)
        }

        const win = dateWindow(dateKey)
        if (win) {
            const [start, end] = win
            result = result.filter((e) => {
                const t = new Date(e.start_datetime)
                return t >= start && t < end
            })
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter(
                (e) =>
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
    }, [events, activeCategory, activeOrganizer, searchQuery, sort, dateKey])

    const hasFilters =
        searchQuery.trim() !== '' ||
        activeCategory !== 'all' ||
        activeOrganizer !== null ||
        dateKey !== 'any'

    const clearFilters = () => {
        setActiveCategory('all')
        setActiveOrganizer(null)
        setSearchInput('')
        setDateKey('any')
    }

    return (
        <>
            {/* Hero + Search */}
            <section className="border-b bg-gradient-to-b from-primary/5 to-background">
                <div className="container mx-auto px-4 py-12 md:py-16">
                    <div className="max-w-2xl">
                        <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight mb-3">
                            Discover Events
                        </h1>
                        <p className="text-lg text-muted-foreground mb-2">
                            Concerts, workshops, markets, and more — book securely in a tap.
                        </p>
                        {events.length > 0 && (
                            <p className="text-sm font-medium text-muted-foreground mb-8">
                                <span className="text-foreground font-bold">{events.length}</span> upcoming event
                                {events.length !== 1 ? 's' : ''}
                                {cityCount > 0 && (
                                    <>
                                        {' '}across <span className="text-foreground font-bold">{cityCount}</span>{' '}
                                        {cityCount !== 1 ? 'cities' : 'city'}
                                    </>
                                )}
                            </p>
                        )}
                    </div>

                    <div className="relative max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search events, venues, cities..."
                            className="pl-10 h-11 bg-background"
                        />
                    </div>
                </div>
            </section>

            {/* Filters (sticky under the fixed h-20 header) */}
            <section className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-20 z-40">
                <div className="container mx-auto px-4">
                    {/* Categories */}
                    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveCategory('all')}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                activeCategory === 'all'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                            }`}
                        >
                            All Events
                        </button>
                        {activeCategories.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => setActiveCategory(cat.key)}
                                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                    activeCategory === cat.key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }`}
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
                            {DATE_FILTERS.map((d) => (
                                <button
                                    key={d.value}
                                    onClick={() => setDateKey(d.value)}
                                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                        dateKey === d.value
                                            ? 'bg-foreground text-background'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                    }`}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                            <select
                                value={sort}
                                onChange={(e) => setSort(e.target.value as SortKey)}
                                className="h-8 rounded-md border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                aria-label="Sort events"
                            >
                                {SORTS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Organizers */}
                    {organizers.length > 1 && (
                        <div className="flex items-center gap-2 pb-3 overflow-x-auto no-scrollbar">
                            <User className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                            <button
                                onClick={() => setActiveOrganizer(null)}
                                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    !activeOrganizer
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }`}
                            >
                                All Organizers
                            </button>
                            {organizers.map((org) => (
                                <button
                                    key={org.id}
                                    onClick={() => setActiveOrganizer(org.id)}
                                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                        activeOrganizer === org.id
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                    }`}
                                >
                                    {org.profile_photo_url && (
                                        <img
                                            src={org.profile_photo_url}
                                            alt=""
                                            className="w-4 h-4 rounded-full object-cover"
                                        />
                                    )}
                                    {org.business_name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Grid */}
            <main className="container mx-auto px-4 py-10">
                <p className="text-sm text-muted-foreground mb-6">
                    {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                    {searchQuery && <> for &ldquo;{searchQuery}&rdquo;</>}
                </p>

                {filteredEvents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredEvents.map((event: any) => {
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
