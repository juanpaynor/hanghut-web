import { PublicEventCard } from '@/components/events/public-event-card'
import { Calendar, MapPin, Ticket, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'

interface EventsSectionProps {
    config: {
        variant?: 'grid' | 'list' | 'carousel'
        columns?: 2 | 3
        show_price?: boolean
        show_category?: boolean
    }
    events: any[]
    sortBy?: 'upcoming' | 'newest' | 'alpha'
}

export function EventsSection({ config, events, sortBy }: EventsSectionProps) {
    const variant = config.variant || 'grid'
    const columns = config.columns || 3

    // Sort events
    const sorted = [...events].sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sortBy === 'alpha') return a.title.localeCompare(b.title)
        return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    })

    return (
        <section id="events" className="py-16 md:py-20">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                        <Calendar className="h-6 w-6 text-primary" />
                        Upcoming Events
                    </h2>
                    {sortBy && sortBy !== 'upcoming' && (
                        <Badge variant="outline" className="text-muted-foreground">
                            Sorted by {sortBy === 'newest' ? 'Newest' : 'A-Z'}
                        </Badge>
                    )}
                </div>

                {sorted.length > 0 ? (
                    <>
                        {variant === 'list' ? (
                            <div className="space-y-4 max-w-4xl">
                                {sorted.map((event: any) => (
                                    <ListEventCard key={event.id} event={event} />
                                ))}
                            </div>
                        ) : (
                            <div className={cn(
                                'grid gap-6',
                                columns === 3
                                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                                    : 'grid-cols-1 md:grid-cols-2'
                            )}>
                                {sorted.map((event: any) => (
                                    <div key={event.id}>
                                        <PublicEventCard event={event} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-muted rounded-3xl bg-muted/10 text-center w-full">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                            <Calendar className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-1">No Upcoming Events</h3>
                        <p className="text-muted-foreground max-w-sm">
                            Check back soon for new events!
                        </p>
                    </div>
                )}
            </div>
        </section>
    )
}

/** Compact horizontal card for magazine/list layout */
function ListEventCard({ event }: { event: any }) {
    const isSoldOut = typeof event.capacity === 'number' && typeof event.tickets_sold === 'number'
        ? event.tickets_sold >= event.capacity
        : false

    return (
        <Link href={`/events/${event.id}`} className="group block">
            <div className="flex gap-4 bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                {/* Compact side thumbnail */}
                <div className="relative w-40 md:w-52 shrink-0 overflow-hidden">
                    {event.cover_image_url ? (
                        <Image
                            src={event.cover_image_url}
                            alt={event.title}
                            fill
                            sizes="200px"
                            className={cn(
                                "object-cover group-hover:scale-105 transition-transform duration-500",
                                isSoldOut && "grayscale"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted min-h-[120px]">
                            <Ticket className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                    )}
                    {event.event_type && (
                        <div className="absolute top-2 left-2">
                            <Badge variant="outline" className="bg-black/20 text-white border-white/20 backdrop-blur-md font-medium uppercase tracking-wider text-[10px]">
                                {event.event_type}
                            </Badge>
                        </div>
                    )}
                </div>

                {/* Content side */}
                <div className="flex-1 py-4 pr-4 flex flex-col justify-center gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base md:text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {event.title}
                        </h3>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            {isSoldOut && (
                                <Badge variant="destructive" className="font-bold uppercase tracking-widest text-[10px]">
                                    Sold Out
                                </Badge>
                            )}
                            <Badge variant={event.ticket_price === 0 ? "secondary" : "default"} className="font-semibold text-xs">
                                {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                            </Badge>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-primary/70" />
                            <span className="font-medium text-foreground">
                                {format(new Date(event.start_datetime), 'MMM d')}
                            </span>
                            <span className="text-xs">
                                {format(new Date(event.start_datetime), 'h:mm a')}
                            </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary/70" />
                            <span className="line-clamp-1">{event.venue_name}</span>
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    )
}
