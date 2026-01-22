import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus, Calendar, Users, DollarSign } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

async function getOrganizerEvents(partnerId: string) {
    const supabase = await createClient()

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', partnerId)
        .order('start_datetime', { ascending: false })

    return events || []
}

export default async function OrganizerEventsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (!partner) return null

    const events = await getOrganizerEvents(partner.id)

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
                                        <img
                                            src={event.cover_image_url}
                                            alt={event.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Calendar className="h-16 w-16 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="absolute top-4 right-4">
                                        <Badge className={getStatusColor(event.status)}>
                                            {event.status.toUpperCase()}
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
        </div>
    )
}
