'use client'

import { useState, useMemo } from 'react'
import { PublicEventCard } from '@/components/events/public-event-card'
import { Input } from '@/components/ui/input'
import { Search, Ticket, SlidersHorizontal, User } from 'lucide-react'

const CATEGORIES = [
    { value: 'all', label: 'All Events' },
    { value: 'concert', label: 'Music & Concerts' },
    { value: 'nightlife', label: 'Nightlife & Parties' },
    { value: 'food', label: 'Food & Drink' },
    { value: 'sports', label: 'Sports & Fitness' },
    { value: 'workshop', label: 'Workshops & Classes' },
    { value: 'art', label: 'Arts & Culture' },
]

interface EventsFilterGridProps {
    events: any[]
}

export function EventsFilterGrid({ events }: EventsFilterGridProps) {
    const [activeCategory, setActiveCategory] = useState('all')
    const [activeOrganizer, setActiveOrganizer] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Extract unique organizers from all events
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

    // Filter events client-side — instant
    const filteredEvents = useMemo(() => {
        let result = events

        if (activeCategory !== 'all') {
            result = result.filter((e) => e.event_type === activeCategory)
        }

        if (activeOrganizer) {
            result = result.filter((e) => e.organizer_id === activeOrganizer)
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

        return result
    }, [events, activeCategory, activeOrganizer, searchQuery])

    return (
        <>
            {/* Search */}
            <section className="border-b bg-gradient-to-b from-primary/5 to-background">
                <div className="container mx-auto px-4 py-12 md:py-16">
                    <div className="max-w-2xl">
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
                            Discover Events
                        </h1>
                        <p className="text-lg text-muted-foreground mb-8">
                            Browse upcoming events and buy tickets securely. Powered by Xendit.
                        </p>
                    </div>

                    <div className="relative max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search events, venues, cities..."
                            className="pl-10 h-11 bg-background"
                        />
                    </div>
                </div>
            </section>

            {/* Filters */}
            <section className="border-b bg-background sticky top-16 z-40">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setActiveCategory(cat.value)}
                                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                    activeCategory === cat.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {organizers.length > 0 && (
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
                {searchQuery && (
                    <p className="text-sm text-muted-foreground mb-6">
                        {filteredEvents.length} result{filteredEvents.length !== 1 ? 's' : ''} for
                        &ldquo;{searchQuery}&rdquo;
                    </p>
                )}

                {filteredEvents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredEvents.map((event: any) => (
                            <PublicEventCard key={event.id} event={event} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                            <Ticket className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">No events found</h2>
                        <p className="text-muted-foreground mb-6">
                            {searchQuery
                                ? `No events match "${searchQuery}". Try a different search.`
                                : 'Check back soon for upcoming events!'}
                        </p>
                        {(searchQuery || activeCategory !== 'all' || activeOrganizer) && (
                            <button
                                onClick={() => {
                                    setActiveCategory('all')
                                    setActiveOrganizer(null)
                                    setSearchQuery('')
                                }}
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
