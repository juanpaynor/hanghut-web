import { createClient } from '@/lib/supabase/server'
import { PublicEventCard } from '@/components/events/public-event-card'
import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Search, Ticket, Phone, SlidersHorizontal, User } from 'lucide-react'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Events - HangHut',
    description: 'Discover and book tickets to the best events, concerts, parties, workshops, and experiences near you. Secure checkout powered by Xendit.',
    openGraph: {
        title: 'Discover Events - HangHut',
        description: 'Browse upcoming events and buy tickets securely.',
    },
}

const CATEGORIES = [
    { value: 'all', label: 'All Events' },
    { value: 'concert', label: 'Music & Concerts' },
    { value: 'nightlife', label: 'Nightlife & Parties' },
    { value: 'food', label: 'Food & Drink' },
    { value: 'sports', label: 'Sports & Fitness' },
    { value: 'workshop', label: 'Workshops & Classes' },
    { value: 'art', label: 'Arts & Culture' },
]

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; q?: string; organizer?: string }>
}) {
    const { category, q, organizer } = await searchParams
    const supabase = await createClient()

    let query = supabase
        .from('events')
        .select(`
            id,
            title,
            start_datetime,
            venue_name,
            city,
            cover_image_url,
            ticket_price,
            event_type,
            capacity,
            tickets_sold,
            organizer_id,
            organizer:partners!events_organizer_id_fkey(
                id,
                business_name,
                profile_photo_url,
                verified
            )
        `)
        .eq('status', 'active')
        .gte('start_datetime', new Date().toISOString())
        .order('start_datetime', { ascending: true })

    if (category && category !== 'all') {
        query = query.eq('event_type', category)
    }

    if (organizer) {
        query = query.eq('organizer_id', organizer)
    }

    if (q) {
        query = query.or(`title.ilike.%${q}%,venue_name.ilike.%${q}%,city.ilike.%${q}%`)
    }

    const { data: events } = await query

    // Extract unique organizers from the events (no extra query needed)
    const orgMap = new Map<string, any>()
    for (const e of (events || []) as any[]) {
        const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer
        if (org?.id && !orgMap.has(org.id)) {
            orgMap.set(org.id, { id: org.id, business_name: org.business_name, profile_photo_url: org.profile_photo_url })
        }
    }
    const relevantOrganizers = Array.from(orgMap.values()).sort((a, b) => a.business_name.localeCompare(b.business_name))

    const activeCategory = category || 'all'

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 flex h-16 items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-lg">
                            HANGHUT
                        </div>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <a href="tel:+639618478642" className="flex items-center gap-1 hover:text-foreground transition-colors">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">+63 961 847 8642</span>
                        </a>
                    </div>
                </div>
            </header>

            {/* Hero */}
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

                    {/* Search */}
                    <form method="GET" className="flex gap-3 max-w-lg">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                name="q"
                                defaultValue={q || ''}
                                placeholder="Search events, venues, cities..."
                                className="pl-10 h-11 bg-background"
                            />
                        </div>
                        {category && <input type="hidden" name="category" value={category} />}
                        {organizer && <input type="hidden" name="organizer" value={organizer} />}
                        <button type="submit" className="h-11 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                            Search
                        </button>
                    </form>
                </div>
            </section>

            {/* Category Filters */}
            <section className="border-b bg-background sticky top-16 z-40">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                        {CATEGORIES.map((cat) => {
                            const params = new URLSearchParams()
                            if (cat.value !== 'all') params.set('category', cat.value)
                            if (q) params.set('q', q)
                            if (organizer) params.set('organizer', organizer)
                            const href = `/events${params.toString() ? `?${params}` : ''}`
                            return (
                                <Link
                                    key={cat.value}
                                    href={href}
                                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                        activeCategory === cat.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                    }`}
                                >
                                    {cat.label}
                                </Link>
                            )
                        })}
                    </div>

                    {/* Organizer Filter */}
                    {relevantOrganizers.length > 0 && (
                        <div className="flex items-center gap-2 pb-3 overflow-x-auto no-scrollbar">
                            <User className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
                            <Link
                                href={(() => {
                                    const params = new URLSearchParams()
                                    if (category && category !== 'all') params.set('category', category)
                                    if (q) params.set('q', q)
                                    return `/events${params.toString() ? `?${params}` : ''}`
                                })()}
                                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    !organizer
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }`}
                            >
                                All Organizers
                            </Link>
                            {relevantOrganizers.map((org: any) => {
                                const params = new URLSearchParams()
                                if (category && category !== 'all') params.set('category', category)
                                if (q) params.set('q', q)
                                params.set('organizer', org.id)
                                return (
                                    <Link
                                        key={org.id}
                                        href={`/events?${params}`}
                                        className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                            organizer === org.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                        }`}
                                    >
                                        {org.profile_photo_url && (
                                            <img src={org.profile_photo_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                                        )}
                                        {org.business_name}
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Events Grid */}
            <main className="container mx-auto px-4 py-10">
                {q && (
                    <p className="text-sm text-muted-foreground mb-6">
                        {events?.length || 0} result{events?.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
                        {category && category !== 'all' && ` in ${CATEGORIES.find(c => c.value === category)?.label}`}
                    </p>
                )}

                {events && events.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {events.map((event: any) => (
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
                            {q ? `No events match "${q}". Try a different search.` : 'Check back soon for upcoming events!'}
                        </p>
                        {(q || category) && (
                            <Link
                                href="/events"
                                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                            >
                                View All Events
                            </Link>
                        )}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="border-t bg-muted/30">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary px-2 py-0.5 rounded text-primary-foreground text-sm font-bold transform -rotate-2">
                                HANGHUT
                            </div>
                            <span className="text-sm text-muted-foreground">
                                Event ticketing marketplace
                            </span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-muted-foreground">
                            <a href="tel:+639618478642" className="flex items-center gap-1 hover:text-foreground">
                                <Phone className="h-3.5 w-3.5" /> +63 961 847 8642
                            </a>
                            <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
                            <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                        © {new Date().getFullYear()} HangHut. Secure payments powered by Xendit.
                    </p>
                </div>
            </footer>
        </div>
    )
}
