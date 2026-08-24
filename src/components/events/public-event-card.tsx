import { eventHref } from '@/lib/events/urls'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Calendar, MapPin, Ticket, ArrowUpRight, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatEventTime, formatEventDateWithEnd, isMultiDayEvent, eventDayCount, showsDayCount } from '@/lib/datetime'
import { isExternal, isSoldOut as computeSoldOut, type DiscoveryEvent } from '@/lib/events/discovery'

interface PublicEventCardProps {
    event: DiscoveryEvent
    // From the category layer (event_categories). Falls back to event_type when absent.
    categoryLabel?: string
    categoryEmoji?: string
}

export function PublicEventCard({ event, categoryLabel, categoryEmoji }: PublicEventCardProps) {
    const badgeLabel = categoryLabel ?? event.event_type
    // Sold-out goes through lib/events/discovery so external listings
    // (placeholder capacity 999999) can never be reported as sold out.
    const isSoldOut = computeSoldOut(event)
    const external = isExternal(event)
    // A run across several days has to read as a range here — the card is where
    // most people decide, and "Aug 29" for an Aug 29–30 market loses day two.
    const multiDay = isMultiDayEvent(event.start_datetime, event.end_datetime)

    return (
        <Link href={eventHref(event)} className="group block h-full">
            <div data-hh-card className="h-full bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 flex flex-col">
                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden">
                    {event.cover_image_url ? (
                        <Image
                            src={event.cover_image_url}
                            alt={event.title}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className={cn(
                                "object-cover group-hover:scale-105 transition-transform duration-500 will-change-transform",
                                isSoldOut && "grayscale"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Ticket className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                    )}

                    {/* Price Badge */}
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                        {/* Where the buy button actually leads. 45 of 50 live events redirect
                            off-site, and without this they are indistinguishable from the ones
                            we own the checkout for — which is the whole point of the badge. */}
                        {external ? (
                            <Badge
                                variant="outline"
                                className="bg-background/80 text-muted-foreground border-border/60 backdrop-blur-md font-medium text-[10px] gap-1"
                            >
                                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                                Off-site
                            </Badge>
                        ) : (
                            <Badge className="bg-primary/90 text-primary-foreground hover:bg-primary backdrop-blur-md font-semibold text-[10px] shadow-sm">
                                On HangHut
                            </Badge>
                        )}
                        {isSoldOut && (
                            <Badge variant="destructive" className="font-bold uppercase tracking-widest text-[10px] shadow-sm">
                                Sold Out
                            </Badge>
                        )}
                        <Badge variant={event.ticket_price === 0 ? "secondary" : "default"} className="font-semibold shadow-sm backdrop-blur-md bg-background/80 text-foreground hover:bg-background/90">
                            {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                        </Badge>
                    </div>

                    {/* Category Badge (from the category layer, falls back to event_type) */}
                    {badgeLabel && (
                        <div className="absolute top-3 left-3">
                            <Badge variant="outline" className="bg-black/20 text-white border-white/20 backdrop-blur-md font-medium tracking-wide text-[10px] flex items-center gap-1">
                                {categoryEmoji && <span aria-hidden>{categoryEmoji}</span>}
                                {badgeLabel}
                            </Badge>
                        </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="bg-white/90 text-black px-4 py-2 rounded-full font-semibold text-sm transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
                            {isSoldOut ? 'View Waitlist' : 'View Details'} <ArrowUpRight className="h-4 w-4" />
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
                                    {formatEventDateWithEnd(event.start_datetime, event.end_datetime)}
                                </span>
                                <span className="text-xs">
                                    {!multiDay
                                        ? formatEventTime(event.start_datetime)
                                        : showsDayCount(event.start_datetime, event.end_datetime)
                                            ? `${eventDayCount(event.start_datetime, event.end_datetime)} days · from ${formatEventTime(event.start_datetime)}`
                                            : `from ${formatEventTime(event.start_datetime)}`}
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
