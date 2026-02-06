import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { format } from 'date-fns'
import {
    MapPin,
    Calendar,
    Users,
    DollarSign,
    Star,
    AlertTriangle,
    CheckCircle,
    Ban,
} from 'lucide-react'
import Link from 'next/link'

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
        user:users!partners_user_id_fkey(
          id,
          display_name,
          email
        )
      )
    `)
        .eq('id', eventId)
        .single()

    if (error || !event) {
        return null
    }

    return event
}

async function getEventTickets(eventId: string) {
    const supabase = await createClient()

    const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
      *,
      user:users(
        id,
        display_name,
        email
      )
    `)
        .eq('event_id', eventId)
        .neq('status', 'available') // Filter out unsold tickets
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        return []
    }

    return tickets || []
}

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const event = await getEvent(id)

    if (!event) {
        notFound()
    }

    return (
        <div className="p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <Link
                        href="/admin/events"
                        className="text-blue-500 hover:text-blue-400 text-sm mb-4 inline-block"
                    >
                        ← Back to Events
                    </Link>
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-4xl font-bold">{event.title}</h1>
                                {event.is_featured && (
                                    <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                                )}
                            </div>
                            <p className="text-muted-foreground">Event ID: {event.id}</p>
                        </div>
                        <Badge
                            variant="outline"
                            className={
                                event.status === 'active'
                                    ? 'bg-green-500/10 text-green-500'
                                    : event.status === 'sold_out'
                                        ? 'bg-yellow-500/10 text-yellow-500'
                                        : event.status === 'cancelled'
                                            ? 'bg-red-500/10 text-red-500'
                                            : 'bg-slate-500/10 text-muted-foreground'
                            }
                        >
                            {event.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                    </div>
                </div>

                <Suspense fallback={<div>Loading...</div>}>
                    <EventDetailsContent event={event} />
                </Suspense>
            </div>
        </div>
    )
}

async function EventDetailsContent({ event }: { event: any }) {
    const tickets = await getEventTickets(event.id)

    const ticketsUsed = tickets.filter((t) => t.status === 'used').length
    const ticketsValid = tickets.filter((t) => t.status === 'valid').length
    const ticketsCancelled = tickets.filter((t) => t.status === 'cancelled').length

    return (
        <div className="space-y-6">
            {/* Cover Image */}
            {event.cover_image_url && (
                <div className="w-full h-64 rounded-lg overflow-hidden">
                    <img
                        src={event.cover_image_url}
                        alt={event.title}
                        className="w-full h-full object-cover"
                    />
                </div>
            )}

            {/* Key Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-6 bg-card border-border">
                    <div className="flex items-center gap-3">
                        <Users className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-muted-foreground text-sm">Tickets Sold</p>
                            <p className="text-2xl font-bold">
                                {event.tickets_sold} / {event.capacity}
                            </p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-card border-border">
                    <div className="flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-green-500" />
                        <div>
                            <p className="text-muted-foreground text-sm">Ticket Price</p>
                            <p className="text-2xl font-bold">₱{event.ticket_price.toLocaleString()}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-card border-border">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="h-8 w-8 text-purple-500" />
                        <div>
                            <p className="text-muted-foreground text-sm">Checked In</p>
                            <p className="text-2xl font-bold">{ticketsUsed}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-card border-border">
                    <div className="flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-yellow-500" />
                        <div>
                            <p className="text-muted-foreground text-sm">Gross Revenue</p>
                            <p className="text-2xl font-bold">
                                ₱{(event.tickets_sold * event.ticket_price).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Event Details */}
            <Card className="p-6 bg-card border-border">
                <h2 className="text-xl font-bold mb-4">Event Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-muted-foreground text-sm mb-1">Date & Time</p>
                        <p className="text-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(event.start_datetime), 'MMMM d, yyyy')} at{' '}
                            {format(new Date(event.start_datetime), 'h:mm a')}
                        </p>
                    </div>

                    <div>
                        <p className="text-muted-foreground text-sm mb-1">Venue</p>
                        <p className="text-foreground flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {event.venue_name || 'No venue specified'}
                        </p>
                    </div>

                    <div>
                        <p className="text-muted-foreground text-sm mb-1">Event Type</p>
                        <p className="text-foreground capitalize">{event.event_type.replace('_', ' ')}</p>
                    </div>

                    <div>
                        <p className="text-muted-foreground text-sm mb-1">Organizer</p>
                        <div>
                            <p className="text-foreground flex items-center gap-2">
                                {event.organizer?.business_name}
                                {event.organizer?.verified && (
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                        ✓ Verified
                                    </Badge>
                                )}
                            </p>
                            <p className="text-muted-foreground text-sm">{event.organizer?.user?.email}</p>
                        </div>
                    </div>

                    {event.address && (
                        <div className="md:col-span-2">
                            <p className="text-muted-foreground text-sm mb-1">Address</p>
                            <p className="text-foreground">{event.address}</p>
                        </div>
                    )}

                    {event.description && (
                        <div className="md:col-span-2">
                            <p className="text-muted-foreground text-sm mb-1">Description</p>
                            <p className="text-foreground">{event.description}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Recent Tickets */}
            <Card className="p-6 bg-card border-border">
                <h2 className="text-xl font-bold mb-4">Recent Tickets ({tickets.length})</h2>
                {tickets.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No tickets sold yet</p>
                ) : (
                    <div className="space-y-2">
                        {tickets.slice(0, 10).map((ticket: any) => (
                            <div
                                key={ticket.id}
                                className="flex items-center justify-between p-3 bg-card rounded-lg"
                            >
                                <div>
                                    <p className="text-foreground text-sm">{ticket.user?.display_name}</p>
                                    <p className="text-muted-foreground text-xs">{ticket.ticket_number}</p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className={
                                        ticket.status === 'used'
                                            ? 'bg-green-500/10 text-green-500'
                                            : ticket.status === 'valid'
                                                ? 'bg-blue-500/10 text-blue-500'
                                                : 'bg-red-500/10 text-red-500'
                                    }
                                >
                                    {ticket.status.toUpperCase()}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Admin Actions */}
            <Card className="p-6 bg-card border-border">
                <h2 className="text-xl font-bold mb-4">Admin Actions</h2>
                <div className="flex gap-3">
                    <Button variant="outline" className="border-border hover:bg-muted">
                        <Star className="h-4 w-4 mr-2" />
                        {event.is_featured ? 'Remove from Featured' : 'Feature Event'}
                    </Button>
                    <Button variant="destructive">
                        <Ban className="h-4 w-4 mr-2" />
                        Cancel Event
                    </Button>
                </div>
            </Card>
        </div>
    )
}
