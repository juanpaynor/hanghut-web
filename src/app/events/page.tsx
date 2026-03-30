import { createClient } from '@/lib/supabase/server'
import { EventsFilterGrid } from '@/components/events/events-filter-grid'
import Link from 'next/link'
import { Phone } from 'lucide-react'
import type { Metadata } from 'next'

export const revalidate = 60 // Cache for 60 seconds

export const metadata: Metadata = {
    title: 'Events - HangHut',
    description: 'Discover and book tickets to the best events, concerts, parties, workshops, and experiences near you.',
    openGraph: {
        title: 'Discover Events - HangHut',
        description: 'Browse upcoming events and buy tickets securely.',
    },
}

export default async function EventsPage() {
    const supabase = await createClient()

    // Single query — fetch all active upcoming events, filter client-side
    const { data: events } = await supabase
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

            {/* Client-side filtering — instant */}
            <EventsFilterGrid events={events || []} />

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
                        © {new Date().getFullYear()} HangHut. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    )
}
