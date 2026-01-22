import Link from 'next/link'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Calendar, MapPin, Ticket, ArrowUpRight } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

interface PublicEventCardProps {
    event: {
        id: string
        title: string
        start_datetime: string
        venue_name: string
        cover_image_url: string | null
        ticket_price: number
        event_type?: string
    }
}

export function PublicEventCard({ event }: PublicEventCardProps) {
    return (
        <Link href={`/events/${event.id}`} className="group block h-full">
            <div className="h-full bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 flex flex-col">
                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden">
                    {event.cover_image_url ? (
                        <img
                            src={event.cover_image_url}
                            alt={event.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 will-change-transform"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Ticket className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                    )}

                    {/* Price Badge */}
                    <div className="absolute top-3 right-3">
                        <Badge variant={event.ticket_price === 0 ? "secondary" : "default"} className="font-semibold shadow-sm backdrop-blur-md bg-background/80 text-foreground hover:bg-background/90">
                            {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                        </Badge>
                    </div>

                    {/* Category Badge (if available) */}
                    {event.event_type && (
                        <div className="absolute top-3 left-3">
                            <Badge variant="outline" className="bg-black/20 text-white border-white/20 backdrop-blur-md font-medium uppercase tracking-wider text-[10px]">
                                {event.event_type}
                            </Badge>
                        </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="bg-white/90 text-black px-4 py-2 rounded-full font-semibold text-sm transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
                            View Details <ArrowUpRight className="h-4 w-4" />
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                    <div className="mb-4">
                        <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {event.title}
                        </h3>
                    </div>

                    <div className="mt-auto space-y-3">
                        <div className="flex items-start gap-3 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                            <div className="flex flex-col">
                                <span className="font-medium text-foreground">
                                    {format(new Date(event.start_datetime), 'EEEE, MMMM d')}
                                </span>
                                <span className="text-xs">
                                    {format(new Date(event.start_datetime), 'h:mm a')}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                            <span className="line-clamp-1">{event.venue_name}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    )
}
