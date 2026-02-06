'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { Search, Eye, MapPin, Calendar, Users, Star } from 'lucide-react'
import Link from 'next/link'

interface Event {
    id: string
    title: string
    description: string | null
    event_type: string
    latitude: number
    longitude: number
    address: string | null
    venue_name: string | null
    start_datetime: string
    end_datetime: string | null
    capacity: number
    tickets_sold: number
    ticket_price: number
    status: string
    is_featured: boolean
    cover_image_url: string | null
    created_at: string
    organizer: {
        id: string
        business_name: string
        verified: boolean
    } | null
}

interface EventsClientProps {
    events: Event[]
    currentPage: number
    totalCount: number
    statusFilter: string
    typeFilter: string
    searchQuery: string
}

const ITEMS_PER_PAGE = 20

export function EventsClient({ events, currentPage, totalCount, statusFilter, typeFilter, searchQuery }: EventsClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState(searchQuery)
    const debouncedSearch = useDebounce(search, 500)

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    // Sync input with prop if it changes externally
    // useEffect(() => setSearch(searchQuery), [searchQuery]) 

    // Update URL when debounced search changes
    useEffect(() => {
        // Only trigger if the debounced value is different from what's potentially in the URL (handled by parent prop, but good check)
        // Actually, we just push based on debounced value.
        // We need to avoid initial run if it matches searchQuery.
        if (debouncedSearch === searchQuery) return

        const params = new URLSearchParams(searchParams.toString())
        if (debouncedSearch) {
            params.set('search', debouncedSearch)
        } else {
            params.delete('search')
        }
        params.delete('page') // Reset to page 1
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }, [debouncedSearch, router, searchParams, searchQuery])

    const handleSearch = (value: string) => {
        setSearch(value)
    }

    const handleStatusFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'all') {
            params.delete('status')
        } else {
            params.set('status', value)
        }
        params.delete('page')
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const handleTypeFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'all') {
            params.delete('type')
        } else {
            params.set('type', value)
        }
        params.delete('page')
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft':
                return 'bg-slate-500/10 text-muted-foreground'
            case 'active':
                return 'bg-green-500/10 text-green-500'
            case 'sold_out':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'cancelled':
                return 'bg-red-500/10 text-red-500'
            case 'completed':
                return 'bg-blue-500/10 text-blue-500'
            default:
                return 'bg-slate-500/10 text-muted-foreground'
        }
    }

    const formatEventType = (type: string) => {
        return type.replace('_', ' ').split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
    }

    return (
        <div className="space-y-6">
            {/* Filters and Search */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by title or venue..."
                            value={search}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="pl-10 bg-card border-border text-foreground"
                        />
                    </div>
                </div>

                <Select value={statusFilter} onValueChange={handleStatusFilter}>
                    <SelectTrigger className="w-[200px] bg-card border-border text-foreground">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="sold_out">Sold Out</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={handleTypeFilter}>
                    <SelectTrigger className="w-[200px] bg-card border-border text-foreground">
                        <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="concert">Concert</SelectItem>
                        <SelectItem value="workshop">Workshop</SelectItem>
                        <SelectItem value="conference">Conference</SelectItem>
                        <SelectItem value="sports">Sports</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Results count */}
            <div className="text-sm text-muted-foreground">
                Showing {events.length} of {totalCount} events
            </div>

            {/* Events Table */}
            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="text-muted-foreground">Event</TableHead>
                            <TableHead className="text-muted-foreground">Organizer</TableHead>
                            <TableHead className="text-muted-foreground">Date</TableHead>
                            <TableHead className="text-muted-foreground">Type</TableHead>
                            <TableHead className="text-muted-foreground">Tickets</TableHead>
                            <TableHead className="text-muted-foreground">Status</TableHead>
                            <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                    No events found
                                </TableCell>
                            </TableRow>
                        ) : (
                            events.map((event) => (
                                <TableRow
                                    key={event.id}
                                    className="border-border hover:bg-card/50"
                                >
                                    <TableCell className="text-slate-300">
                                        <div className="flex items-start gap-3">
                                            {event.cover_image_url ? (
                                                <img
                                                    src={event.cover_image_url}
                                                    alt={event.title}
                                                    className="w-16 h-16 object-cover rounded"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                                                    <Calendar className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {event.title}
                                                    {event.is_featured && (
                                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                    )}
                                                </div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                                    <MapPin className="h-3 w-3" />
                                                    {event.venue_name || 'No venue'}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="text-slate-300 text-sm flex items-center gap-1">
                                                {event.organizer?.business_name || 'Unknown'}
                                                {event.organizer?.verified && (
                                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                                                        ✓
                                                    </Badge>
                                                )}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(event.start_datetime), 'MMM d, yyyy')}
                                        <br />
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(event.start_datetime), 'h:mm a')}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-muted-foreground text-sm">
                                            {formatEventType(event.event_type)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-slate-300">
                                                {event.tickets_sold} / {event.capacity}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            ₱{event.ticket_price.toLocaleString()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getStatusColor(event.status)}>
                                            {event.status.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/events/${event.id}`}>
                                            <Button size="sm" variant="ghost" className="hover:bg-muted">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1 || isPending}
                            className="border-border hover:bg-muted"
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || isPending}
                            className="border-border hover:bg-muted"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
