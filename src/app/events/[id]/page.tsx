import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { Calendar, MapPin, Users, Share2, ShieldCheck, Clock, ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { TicketSelector } from '@/components/events/ticket-selector'
import { EventGallery } from '@/components/events/event-gallery'

export const dynamic = 'force-dynamic'

async function getEvent(eventId: string) {
    const supabase = await createClient()

    const { data: event, error } = await supabase
        .from('events')
        .select(`
      *,
      organizer:partners!events_organizer_id_fkey(
        id,
        business_name,
        verified,
        profile_photo_url,
        slug
      ),
      ticket_tiers(*)
    `)
        .eq('id', eventId)
        .eq('status', 'active')
        .single()

    if (error || !event) {
        return null
    }

    return event
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const event = await getEvent(id)

    if (!event) {
        return {
            title: 'Event Not Found',
        }
    }

    return {
        title: `${event.title} - HangHut Events`,
        description: event.description || `Join ${event.title} on ${format(new Date(event.start_datetime), 'MMMM d, yyyy')}`,
        openGraph: {
            title: event.title,
            description: event.description || `Join ${event.title}`,
            images: event.cover_image_url ? [event.cover_image_url] : [],
            type: 'website',
        },
    }
}

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const event = await getEvent(id)

    if (!event) notFound()

    const ticketsRemaining = event.capacity - event.tickets_sold
    const isSoldOut = ticketsRemaining <= 0
    const eventDate = new Date(event.start_datetime)

    return (
        <div className="min-h-screen bg-background font-sans pb-20">
            {/* Navbar (Temporary simple nav) */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-lg">
                            HANGHUT
                        </div>
                    </Link>
                    <div className="flex items-center gap-2">
                        {event.organizer?.slug && (
                            <Link href={`/${event.organizer.slug}`}>
                                <Button variant="ghost" size="sm">
                                    More from this organizer
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <main>
                {/* Hero Section */}
                <div className="relative w-full h-[50vh] min-h-[400px] overflow-hidden bg-muted">
                    {event.cover_image_url ? (
                        <>
                            <Image
                                src={event.cover_image_url}
                                alt={event.title}
                                fill
                                sizes="100vw"
                                className="object-cover"
                                priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                        </>
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                            <h1 className="text-4xl font-bold opacity-20">{event.title}</h1>
                        </div>
                    )}
                </div>

                {/* Content Container */}
                <div className="container mx-auto px-4 -mt-32 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                        {/* LEFT COLUMN: Main Info */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Title Block */}
                            <div className="space-y-4">
                                <div className="flex gap-2 mb-2">
                                    <Badge variant="secondary" className="bg-background/80 backdrop-blur text-foreground border shadow-sm">
                                        {event.event_type ? event.event_type.toUpperCase() : 'EVENT'}
                                    </Badge>
                                    {event.is_featured && <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Featured</Badge>}
                                </div>

                                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-foreground drop-shadow-sm">
                                    {event.title}
                                </h1>
                            </div>

                            {/* Details Card */}
                            <Card className="p-0 overflow-hidden border-none shadow-xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
                                    <div className="p-6 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                            <Calendar className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-lg">{format(eventDate, 'EEEE, MMMM d')}</p>
                                            <p className="text-muted-foreground">{format(eventDate, 'h:mm a')}</p>
                                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded-full w-fit">
                                                <Clock className="h-3 w-3" />
                                                Add to Calendar
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-6 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                            <MapPin className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-lg line-clamp-1">{event.venue_name}</p>
                                            <p className="text-muted-foreground line-clamp-2">{event.address}, {event.city}</p>
                                            <a
                                                href={`https://maps.google.com/?q=${event.latitude},${event.longitude}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-primary font-medium hover:underline mt-2 inline-block"
                                            >
                                                Get Directions
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            {/* Organizer Block */}
                            <div className="flex items-center gap-4 py-6 border-y border-border/50">
                                <div className="w-16 h-16 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-background shadow-md">
                                    {event.organizer?.profile_photo_url ? (
                                        <img src={event.organizer.profile_photo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                            {event.organizer?.business_name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-muted-foreground mb-1">Organized by</p>
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        {event.organizer?.business_name}
                                        {event.organizer?.verified && (
                                            <ShieldCheck className="h-5 w-5 text-blue-500 fill-blue-500/10" />
                                        )}
                                    </h3>
                                    {event.organizer?.slug && (
                                        <Link href={`/${event.organizer.slug}`} className="text-sm text-primary hover:underline">
                                            View Profile
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* About Section */}
                            <div className="prose dark:prose-invert max-w-none">
                                <h2 className="text-2xl font-bold mb-4">About this Event</h2>
                                <p className="whitespace-pre-wrap text-lg leading-relaxed text-muted-foreground">
                                    {event.description || "No description provided."}
                                </p>
                            </div>

                            {/* Event Gallery */}
                            {event.images && event.images.length > 0 && (
                                <div className="pt-8 border-t border-border/50">
                                    <EventGallery images={event.images} title={event.title} />
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Sticky Ticket Card */}
                        <div className="lg:col-span-1 relative">
                            <div className="sticky top-24 space-y-6">
                                <Card className="border-0 shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                                    <div className="bg-primary px-6 py-4 flex justify-between items-center text-primary-foreground">
                                        <span className="font-semibold">Tickets On Sale</span>
                                        <TicketSelector
                                            trigger={
                                                <span className="text-xs bg-white/20 px-2 py-1 rounded cursor-pointer hover:bg-white/30 transition">
                                                    Bulk Buy?
                                                </span>
                                            }
                                            eventId={event.id}
                                            ticketPrice={event.ticket_price}
                                            minTickets={event.min_tickets_per_purchase}
                                            maxTickets={event.max_tickets_per_purchase}
                                            isSoldOut={isSoldOut}
                                            tiers={event.ticket_tiers}
                                        />
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div className="text-center space-y-1">
                                            <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Price per ticket</p>
                                            <div className="text-4xl font-extrabold text-primary">
                                                {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Availability</span>
                                                <span className={cn("font-medium", isSoldOut ? "text-destructive" : "text-green-600")}>
                                                    {isSoldOut ? "Sold Out" : "In Stock"}
                                                </span>
                                            </div>
                                            {/* Could add inventory bar here later */}
                                        </div>

                                        <div className="pt-2">
                                            <TicketSelector
                                                eventId={event.id}
                                                ticketPrice={event.ticket_price}
                                                minTickets={event.min_tickets_per_purchase}
                                                maxTickets={event.max_tickets_per_purchase}
                                                isSoldOut={isSoldOut}
                                                tiers={event.ticket_tiers}
                                                fullWidth
                                            />
                                            <p className="text-center text-xs text-muted-foreground mt-3">
                                                Secure checkout powered by Xendit
                                            </p>
                                        </div>
                                    </div>
                                </Card>

                                <div className="flex justify-center">
                                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                                        <Share2 className="h-4 w-4 mr-2" /> Share this event
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

function cn(...classes: (string | undefined)[]) {
    return classes.filter(Boolean).join(' ')
}
