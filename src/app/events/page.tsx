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

    // Fetch active upcoming events + the category lookup in parallel
    const [{ data: events }, { data: categories }] = await Promise.all([
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
    ])

    return <EventsFilterGrid events={events || []} categories={categories || []} />
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
