import { Suspense } from 'react'
import { createPublicClient } from '@/lib/supabase/public'
import { EventsFilterGrid } from '@/components/events/events-filter-grid'
import Header from '@/components/landing/header'
import Footer from '@/components/landing/footer'
import type { Metadata } from 'next'

export const revalidate = 60 // Cache for 60 seconds

export const metadata: Metadata = {
    title: 'Discover Events - HangHut',
    description: 'Discover and book tickets to the best events, concerts, parties, workshops, and experiences near you.',
    openGraph: {
        title: 'Discover Events - HangHut',
        description: 'Browse upcoming events and buy tickets securely.',
    },
}

async function EventsList() {
    const supabase = createPublicClient()

    // Fetch active upcoming events + the category lookup + any STARRED experiences
    // in parallel. Experiences feed the hero carousel only — the rails and grid
    // below stay events-only, because this is the events page.
    const [{ data: events }, { data: categories }, { data: featuredExperiences }] = await Promise.all([
        supabase
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
                category,
                capacity,
                tickets_sold,
                is_external,
                is_featured,
                organizer_id,
                organizer:partners!events_organizer_id_fkey(
                    id,
                    business_name,
                    profile_photo_url,
                    verified
                )
            `)
            .eq('status', 'active')
            .neq('is_subscriber_only', true)
            .neq('invite_only', true)
            .gte('start_datetime', new Date().toISOString())
            .order('start_datetime', { ascending: true }),
        supabase
            .from('event_categories')
            .select('key,label,emoji')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        supabase
            .from('tables')
            .select(`
                id,
                title,
                location_name,
                price_per_person,
                images,
                host_id,
                experience_schedules(start_time, status)
            `)
            .eq('is_experience', true)
            .eq('is_featured', true),
    ])

    // Normalise a starred experience into the shape the hero renders. Only ones
    // with a bookable date qualify — the same predicate the /experiences index
    // uses ('not cancelled' + in the future, so a sold-out date still counts).
    const now = Date.now()
    const experienceSlides = (featuredExperiences ?? []).flatMap((exp: any) => {
        const upcoming = (exp.experience_schedules ?? [])
            .filter((sch: any) => sch.status !== 'cancelled' && new Date(sch.start_time).getTime() > now)
            .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

        if (upcoming.length === 0) return []

        return [{
            id: exp.id,
            kind: 'experience' as const,
            title: exp.title,
            start_datetime: upcoming[0].start_time,
            venue_name: exp.location_name ?? '',
            city: null,
            cover_image_url: exp.images?.[0] ?? null,
            ticket_price: Number(exp.price_per_person ?? 0),
            // Experiences are always booked on HangHut, never a redirect.
            is_external: false,
            is_featured: true,
        }]
    })

    return (
        <EventsFilterGrid
            events={events || []}
            categories={categories || []}
            heroExtras={experienceSlides}
        />
    )
}

function EventsGridSkeleton() {
    return (
        <div className="container mx-auto px-4 py-16">
            <div className="h-10 w-72 bg-muted rounded-lg animate-pulse mb-4" />
            <div className="h-11 w-full max-w-lg bg-muted rounded-lg animate-pulse mb-10" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card overflow-hidden">
                        <div className="aspect-[4/3] bg-muted animate-pulse" />
                        <div className="p-5 space-y-3">
                            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                            <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                            <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function EventsPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
            <Header />
            {/* pt-20 clears the fixed h-20 landing header */}
            <main className="flex-1 pt-20">
                <Suspense fallback={<EventsGridSkeleton />}>
                    <EventsList />
                </Suspense>
            </main>
            <Footer />
        </div>
    )
}
