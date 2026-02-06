'use client'

import { useState, useEffect } from 'react'
import { Attendee, getEventAttendees, refundTicket } from '@/lib/organizer/attendee-actions'
import { useDebounce } from '@/hooks/use-debounce'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Search, RefreshCw, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TicketPrintModal } from './ticket-print-modal'

interface AttendeeManagerProps {
    eventId: string
    initialAttendees: Attendee[]
    eventTitle: string
    eventDate: string
    eventVenue: string
}

export function AttendeeManager({ eventId, initialAttendees, eventTitle, eventDate, eventVenue }: AttendeeManagerProps) {
    const { toast } = useToast()
    const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees)
    const [total, setTotal] = useState(initialAttendees.length)
    const [loading, setLoading] = useState(false)

    // Pagination & Search
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebounce(search, 500)

    const [isRefunding, setIsRefunding] = useState(false)
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

    // Batch selection for printing
    const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(new Set())

    // Fetch Data Effect
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const result = await getEventAttendees(eventId, page, 20, debouncedSearch)
                setAttendees(result.attendees)
                setTotal(result.total)
            } catch (error) {
                console.error("Failed to fetch attendees", error)
                toast({ title: "Error", description: "Failed to load attendees", variant: "destructive" })
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [eventId, page, debouncedSearch, toast])

    // Reset page on search change
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch])

    const handleRefund = async () => {
        if (!selectedTicketId) return
        setIsRefunding(true)
        try {
            await refundTicket(selectedTicketId, eventId)
            // Refresh data
            const result = await getEventAttendees(eventId, page, 20, debouncedSearch)
            setAttendees(result.attendees)
            toast({ title: 'Refund Processed', description: 'The ticket has been marked as refunded.' })
        } catch (error: any) {
            toast({ title: 'Refund Failed', description: error.message, variant: 'destructive' })
        } finally {
            setIsRefunding(false)
            setSelectedTicketId(null)
        }
    }

    const totalPages = Math.ceil(total / 20)

    const toggleSelectAll = () => {
        if (selectedAttendees.size === attendees.length) {
            setSelectedAttendees(new Set())
        } else {
            setSelectedAttendees(new Set(attendees.map(a => a.id)))
        }
    }

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedAttendees)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedAttendees(newSelected)
    }

    const selectedAttendeesData = attendees.filter(a => selectedAttendees.has(a.id))

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search ticket #, guest name/email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <div className="flex items-center gap-3">
                    {selectedAttendees.size > 0 && (
                        <TicketPrintModal
                            attendees={selectedAttendeesData}
                            eventTitle={eventTitle}
                            eventDate={eventDate}
                            eventVenue={eventVenue}
                        />
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const fetchData = async () => {
                                setLoading(true)
                                try {
                                    const result = await getEventAttendees(eventId, page, 20, debouncedSearch)
                                    setAttendees(result.attendees)
                                    setTotal(result.total)
                                    toast({ title: "Refreshed", description: "Attendee list updated" })
                                } catch (error) {
                                    console.error("Failed to fetch attendees", error)
                                    toast({ title: "Error", description: "Failed to refresh", variant: "destructive" })
                                } finally {
                                    setLoading(false)
                                }
                            }
                            fetchData()
                        }}
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <div className="text-sm text-muted-foreground">
                        Total: <span className="font-medium text-foreground">{total}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <Checkbox
                                    checked={selectedAttendees.size === attendees.length && attendees.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead>Attendee</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead>Ticket Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground animate-pulse">
                                    Loading attendees...
                                </TableCell>
                            </TableRow>
                        ) : attendees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No attendees found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            attendees.map((attendee) => {
                                const name = attendee.user?.display_name || attendee.guest_info?.name || 'Guest'
                                const email = attendee.user?.email || attendee.guest_info?.email || 'No email'
                                const isGuest = !attendee.user

                                return (
                                    <TableRow key={attendee.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedAttendees.has(attendee.id)}
                                                onCheckedChange={() => toggleSelect(attendee.id)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{name}</span>
                                                <span className="text-xs text-muted-foreground">{email}</span>
                                                {isGuest && <Badge variant="outline" className="w-fit mt-1 text-[10px]">Guest Checkout</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {format(new Date(attendee.created_at), 'MMM d, yyyy h:mm a')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{attendee.tier?.name || 'General Admission'}</Badge>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                ₱{attendee.tier?.price?.toLocaleString() ?? '0'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={attendee.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(attendee.id)
                                                            toast({ title: 'Ticket ID Copied' })
                                                        }}
                                                    >
                                                        Copy Ticket ID
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {attendee.status === 'valid' || attendee.status === 'paid' ? (
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => setSelectedTicketId(attendee.id)}
                                                        >
                                                            Refund Ticket
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between py-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || loading}
                    >
                        Next
                    </Button>
                </div>
            )}

            <AlertDialog open={!!selectedTicketId} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will mark the ticket as refunded and invalidate the QR code.
                            <br /><br />
                            <span className="font-medium text-destructive flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                This action cannot be undone.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRefunding}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleRefund(); }}
                            disabled={isRefunding}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRefunding ? 'Processing...' : 'Confirm Refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, string> = {
        valid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        refunded: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        used: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
        cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    }

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${variants[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    )
}
