import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Calendar, MapPin, Share2, ShieldCheck, Clock, Ticket } from 'lucide-react'
import type { Metadata } from 'next'
import { TicketSelector } from '@/components/events/ticket-selector'
import { EventGallery } from '@/components/events/event-gallery'
import { cn, hexToHsl, getYouTubeEmbedUrl } from '@/lib/utils'

import { MobileTicketButton, ShareButton } from '@/components/events/event-actions'

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

    if (!event) return { title: 'Event Not Found' }

    return {
        title: `${event.title} - HangHut Events`,
        description: event.description || `Join ${event.title}`,
        openGraph: {
            title: event.title,
            description: event.description || `Join ${event.title}`,
            images: event.cover_image_url ? [event.cover_image_url] : [],
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

    // Theme Logic
    const themeStyle = event.theme_color ? {
        '--primary': hexToHsl(event.theme_color),
        '--ring': hexToHsl(event.theme_color),
    } as React.CSSProperties : undefined;

    // Layout Config
    const defaultOrder = ["hero", "title", "details", "about", "gallery", "organizer", "tickets"]
    const layoutOrder: string[] = event.layout_config?.order || defaultOrder
    const hiddenSections = new Set(event.layout_config?.hidden || [])

    // --- Section Components ---

    const HeroSection = () => {
        const youtubeEmbed = event.video_url ? getYouTubeEmbedUrl(event.video_url) : null

        return (
            <div className="relative w-full h-[50vh] min-h-[400px] overflow-hidden bg-muted group">
                {youtubeEmbed ? (
                    <iframe
                        src={youtubeEmbed}
                        className="w-full h-full object-cover pointer-events-none"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Hero Video"
                    />
                ) : event.video_url ? (
                    <video
                        src={event.video_url}
                        poster={event.cover_image_url}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                ) : event.cover_image_url ? (
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
        )
    }



    const TitleSection = () => (
        <div className="space-y-4 py-8">
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
    )

    const DetailsSection = () => (
        <Card className="p-0 overflow-hidden border-none shadow-xl my-8">
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
    )

    const AboutSection = () => (
        <div className="prose dark:prose-invert max-w-none py-8">
            <h2 className="text-2xl font-bold mb-4">About this Event</h2>
            {event.description_html ? (
                <div
                    dangerouslySetInnerHTML={{ __html: event.description_html }}
                    className="description-html"
                />
            ) : (
                <p className="whitespace-pre-wrap text-lg leading-relaxed text-muted-foreground">
                    {event.description || "No description provided."}
                </p>
            )}
        </div>
    )

    const OrganizerSection = () => (
        <div className="flex items-center gap-4 py-6 border-y border-border/50 my-8">
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
    )

    const GallerySection = () => {
        const galleryImages = [
            ...(event.cover_image_url ? [event.cover_image_url] : []),
            ...(event.images || [])
        ]

        if (galleryImages.length === 0) return null
        return (
            <div className="py-8 border-t border-border/50">
                <EventGallery images={galleryImages} title={event.title} aspectRatio={3 / 4} />
            </div>
        )
    }

    const TicketsSection = () => (
        <Card className="my-8 border-2 border-primary/10 shadow-lg overflow-hidden" id="tickets">
            <div className="bg-primary/5 p-6 border-b border-primary/10 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary text-primary-foreground rounded-lg">
                        <Ticket className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Get Tickets</h2>
                        <p className="text-muted-foreground text-sm">Secure your spot now</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="block text-sm text-muted-foreground uppercase tracking-wider font-semibold">Starting at</span>
                    <span className="text-3xl font-extrabold text-primary">
                        {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                    </span>
                </div>
            </div>
            <div className="p-8">
                <TicketSelector
                    eventId={event.id}
                    ticketPrice={event.ticket_price}
                    minTickets={event.min_tickets_per_purchase}
                    maxTickets={event.max_tickets_per_purchase}
                    isSoldOut={isSoldOut}
                    tiers={event.ticket_tiers}
                    fullWidth
                    trigger={null}
                />
                <p className="text-center text-xs text-muted-foreground mt-6 flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Secure checkout powered by Xendit
                </p>
            </div>
        </Card>
    )

    const LocationSection = () => (
        // Only render if we haven't already rendered details, or if user wants specific map
        <div className="py-8">
            <h3 className="text-xl font-bold mb-4">Location</h3>
            <Card className="h-[300px] flex items-center justify-center bg-muted">
                {/* Embed map or placeholder */}
                <p className="text-muted-foreground">Map View ({event.latitude}, {event.longitude})</p>
            </Card>
        </div>
    )

    const renderSection = (sectionId: string) => {
        if (hiddenSections.has(sectionId)) return null

        switch (sectionId) {
            case 'hero': return <HeroSection key="hero" />
            case 'title': return <TitleSection key="title" />
            case 'details': return <DetailsSection key="details" />
            case 'about': return <AboutSection key="about" />
            case 'organizer': return <OrganizerSection key="organizer" />
            case 'gallery': return <GallerySection key="gallery" />
            case 'tickets': return <TicketsSection key="tickets" />
            case 'location': return <LocationSection key="location" />
            default: return null
        }
    }

    // Separate special sections
    const mainContentOrder = layoutOrder.filter(id => id !== 'hero' && id !== 'tickets')
    const showHero = !hiddenSections.has('hero')
    const showTickets = !hiddenSections.has('tickets')

    return (
        <div className="min-h-screen bg-background font-sans pb-20" style={themeStyle}>
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 flex h-16 items-center justify-between">
                    {event.organizer ? (
                        <Link href={`/${event.organizer.slug}`} className="flex items-center gap-3 font-bold text-xl hover:opacity-80 transition-opacity">
                            {event.organizer.profile_photo_url ? (
                                <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border">
                                    <Image
                                        src={event.organizer.profile_photo_url}
                                        alt={event.organizer.business_name}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                                    {event.organizer.business_name.charAt(0)}
                                </div>
                            )}
                            <span className="truncate max-w-[200px]">{event.organizer.business_name}</span>
                        </Link>
                    ) : (
                        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                            <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-lg">
                                HANGHUT
                            </div>
                        </Link>
                    )}
                </div>
            </header>

            <main>
                {/* Hero is always full width if visible */}
                {showHero && <HeroSection />}

                <div className={cn(
                    "container mx-auto px-4 relative z-10",
                    showHero ? "-mt-8 md:-mt-32" : "mt-8"
                )}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                        {/* LEFT COLUMN: Main Content Stream */}
                        <div className="lg:col-span-2 space-y-8">
                            {mainContentOrder.map(sectionId => {
                                // Specific wrappers for sections could go here if needed
                                return (
                                    <div key={sectionId}>
                                        {renderSection(sectionId)}
                                    </div>
                                )
                            })}
                        </div>

                        {/* RIGHT COLUMN: Sticky Sidebar (Desktop) */}
                        {showTickets && (
                            <div className="lg:col-span-1 relative">
                                <div className="sticky top-24 space-y-6">
                                    <TicketsSection />

                                    <div className="flex justify-center">
                                        <ShareButton title={event.title} description={event.description} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Mobile Sticky Footer Action */}
            <MobileTicketButton showTickets={showTickets} isSoldOut={isSoldOut} />
        </div>
    )
}
