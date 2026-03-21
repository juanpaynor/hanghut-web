import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, Calendar, Users, DollarSign } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

async function getOrganizerEvents(partnerId: string, page: number = 1) {
    const supabase = await createClient()
    const ITEMS_PER_PAGE = 20
    const from = (page - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    const { data: events, count } = await supabase
        .from('events')
        .select('id, title, capacity, tickets_sold, start_datetime, cover_image_url, status, ticket_price, event_type', { count: 'exact' })
        .eq('organizer_id', partnerId)
        .order('start_datetime', { ascending: false })
        .range(from, to)

    // Batch ticket counts (single RPC instead of N+1)
    const eventIds = events?.map(e => e.id) || []
    let ticketCountMap = new Map<string, number>()

    if (eventIds.length > 0) {
        const { data: counts } = await supabase.rpc('get_ticket_counts_by_events', {
            p_event_ids: eventIds
        })
        if (counts) {
            counts.forEach((c: any) => ticketCountMap.set(c.event_id, Number(c.sold_count)))
        }
    }

    const eventsWithCounts = (events || []).map(event => ({
        ...event,
        tickets_sold: ticketCountMap.get(event.id) || 0
    }))

    return { events: eventsWithCounts, total: count || 0 }
}

type Props = {
    searchParams: Promise<{ page?: string }>
}

export default async function OrganizerEventsPage(props: Props) {
    const searchParams = await props.searchParams
    const page = parseInt(searchParams.page || '1')

    // Cached — layout already resolved these
    const { user } = await getAuthUser()
    if (!user) return null

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return null

    const { events, total } = await getOrganizerEvents(partnerId, page)
    const totalPages = Math.ceil(total / 20)

    const getDisplayStatus = (event: any) => {
        if (event.status === 'active' && new Date(event.start_datetime) < new Date()) {
            return 'completed'
        }
        return event.status
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'bg-slate-500/10 text-slate-600'
            case 'active': return 'bg-green-500/10 text-green-600'
            case 'sold_out': return 'bg-yellow-500/10 text-yellow-600'
            case 'cancelled': return 'bg-red-500/10 text-red-600'
            case 'completed': return 'bg-blue-500/10 text-blue-600'
            default: return 'bg-slate-500/10 text-slate-600'
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold mb-2">My Events</h1>
                    <p className="text-muted-foreground">Manage your ticketed events</p>
                </div>
                <Link href="/organizer/events/create">
                    <Button size="lg" className="bg-primary">
                        <Plus className="h-5 w-5 mr-2" />
                        Create Event
                    </Button>
                </Link>
            </div>

            {events.length === 0 ? (
                <Card className="p-12">
                    <div className="text-center space-y-4">
                        <Calendar className="h-20 w-20 mx-auto text-muted-foreground" />
                        <div>
                            <h3 className="text-xl font-bold mb-2">No events yet</h3>
                            <p className="text-muted-foreground mb-6">
                                Start by creating your first ticketed event
                            </p>
                            <Link href="/organizer/events/create">
                                <Button size="lg">Create Your First Event</Button>
                            </Link>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map((event: any) => (
                        <Link key={event.id} href={`/organizer/events/${event.id}`}>
                            <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
                                <div className="relative h-48 bg-muted">
                                    {event.cover_image_url ? (
                                        <Image
                                            src={event.cover_image_url}
                                            alt={event.title}
                                            fill
                                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                            className="object-cover group-hover:scale-105 transition-transform"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Calendar className="h-16 w-16 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="absolute top-4 right-4">
                                        <Badge className={getStatusColor(getDisplayStatus(event))}>
                                            {getDisplayStatus(event).toUpperCase()}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <h3 className="font-bold text-lg mb-1 line-clamp-1">{event.title}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {format(new Date(event.start_datetime), 'MMM d, yyyy • h:mm a')}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Tickets Sold</p>
                                            <p className="text-lg font-bold flex items-center gap-1">
                                                <Users className="h-4 w-4" />
                                                {event.tickets_sold} / {event.capacity}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Price</p>
                                            <p className="text-lg font-bold flex items-center gap-1">
                                                <DollarSign className="h-4 w-4" />
                                                ₱{event.ticket_price}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                    <Link
                        href={`/organizer/events?page=${page - 1}`}
                        className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                    >
                        <Button variant="outline" size="sm" disabled={page === 1}>
                            Previous
                        </Button>
                    </Link>
                    <span className="text-sm text-muted-foreground px-4">
                        Page {page} of {totalPages}
                    </span>
                    <Link
                        href={`/organizer/events?page=${page + 1}`}
                        className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                    >
                        <Button variant="outline" size="sm" disabled={page === totalPages}>
                            Next
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    )
}
