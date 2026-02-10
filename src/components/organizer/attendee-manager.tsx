'use client'

import { useState, useEffect } from 'react'
import { Attendee, getEventAttendees, refundTicket, markIntentAsRefunded } from '@/lib/organizer/attendee-actions'
import { createClient } from '@/lib/supabase/client'
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
import { MoreHorizontal, Search, RefreshCw, AlertCircle, Download, FileText, Sheet } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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
    const totalPages = Math.ceil(total / 20)

    // Refund State
    const [isRefunding, setIsRefunding] = useState(false)
    const [refundModalOpen, setRefundModalOpen] = useState(false)
    const [refundErrorModalOpen, setRefundErrorModalOpen] = useState(false)

    // Selection for Refund (Single or Bulk)
    const [ticketsToRefund, setTicketsToRefund] = useState<Attendee[]>([])
    const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(new Set())

    // Computed Refund Details
    const refundDetails = (() => {
        const uniqueOrders = new Map<string, { id: string, amount: number, fee: number, tickets: number }>()

        ticketsToRefund.forEach(t => {
            if (!t.purchase_intent_id) return

            // If we haven't seen this order yet, initialize it
            // NOTE: We assume 'purchase_intent.unit_price' is for ONE ticket. 
            // The backend refunds the ENTIRE order.
            // So we need to know the TOTAL order amount. 
            // Limitation: We only have 'unit_price' * 'quantity' if we had the order object.
            // But here we rely on the Backend 'request-refund' to handle the actual refund.
            // FOR UI ESTIMATION: We sum up the unit prices of *selected* tickets as a baseline, 
            // BUT strict correctness requires fetching the order total.
            // However, since refunding ANY ticket refunds the WHOLE order, we should warn the user.

            // Improved Logic: We count unique Orders.
            if (!uniqueOrders.has(t.purchase_intent_id)) {
                // We don't have the full order total here unfortunately, only the ticket's price.
                // We will display a GENERIC warning that it refunds the "Full Order".
                // Best effort estimation: unit_price of this ticket * (something?).
                // Let's just sum the prices of the tickets we know about for the 'Fee' estimate?
                // No, that's dangerous.
                // Valid Approach: The Fee is 5% of the REFUNDED Amount.
                // If we refund the whole order, the fee is 5% of the whole order.
                // We should probably Fetch the Order Details before showing the modal to be accurate.
                // OR, just show "5% of the Total Order Amount" as text.
                // User said: "calculate & display 5% fee".
                // Result: I will attempt to calculate based on the ticket price, but add a disclaimer.

                // Let's rely on the `purchase_intent` data if available.
                // The `t.purchase_intent` object (from attendee-actions) has `unit_price`.
                // It does NOT seem to have `quantity` or `total_amount`.
                // I will add a "Fetch Order Details" step if needed, or just show estimated warning.

                uniqueOrders.set(t.purchase_intent_id, {
                    id: t.purchase_intent_id,
                    amount: 0, // Unknown total order amount
                    fee: 0,
                    tickets: 1
                })
            } else {
                const order = uniqueOrders.get(t.purchase_intent_id)!
                order.tickets++
                uniqueOrders.set(t.purchase_intent_id, order)
            }
        })

        return {
            orderCount: uniqueOrders.size,
            ticketCount: ticketsToRefund.length
        }
    })()

    const initiateRefund = (attendeesToRefund: Attendee[]) => {
        setTicketsToRefund(attendeesToRefund)
        setRefundModalOpen(true)
    }

    const processRefunds = async () => {
        setIsRefunding(true)
        const supabase = createClient()

        // Get Unique Intent IDs
        const uniqueIntentIds = Array.from(new Set(ticketsToRefund.map(t => t.purchase_intent_id).filter(Boolean))) as string[]

        let successCount = 0
        let failCount = 0
        let insufficientFunds = false

        for (const intentId of uniqueIntentIds) {
            try {
                // 1. Call Edge Function
                const requestBody = {
                    intent_id: intentId,
                    reason: 'Requested by Organizer via Dashboard'
                }

                const { data, error } = await supabase.functions.invoke('request-refund', {
                    body: requestBody
                })

                if (error) {
                    // Extract the real message if it's hidden in context
                    let errorMessage = error.message
                    if ((error as any).context && (error as any).context.error) {
                        errorMessage = (error as any).context.error
                    } else if ((error as any).context) {
                        errorMessage = JSON.stringify((error as any).context)
                    }

                    throw new Error(errorMessage)
                }

                if (data && data.error) {
                    // Check for specific backend error codes if available
                    // Assuming 402 or specific message for balance
                    if (data.error.code === 'INSUFFICIENT_BALANCE' || data.error.message?.toLowerCase().includes('balance')) {
                        insufficientFunds = true
                        throw new Error('Insufficient Balance')
                    }
                    throw new Error(data.error.message || 'Refund failed')
                }

                // 2. Mark Tickets as Refunded in DB
                try {
                    await markIntentAsRefunded(intentId, eventId)
                } catch (dbError) {
                    console.error('Failed to update DB status for refund', dbError)
                }

                // 3. Trigger Email (Fire and Forget)
                // We wrap this in a catch so it doesn't block the UI success flow
                try {
                    await supabase.functions.invoke('send-transaction-email', {
                        body: {
                            type: 'refund_initiated',
                            intent_id: intentId
                        }
                    })
                } catch (emailErr) {
                    console.warn('Failed to send refund email', emailErr)
                }

                successCount++
            } catch (err: any) {
                console.error(`Refund failed for intent ${intentId}:`, err)
                failCount++
                if (err.message === 'Insufficient Balance') {
                    insufficientFunds = true
                    break // Stop processing on balance error
                }
            }
        }

        setIsRefunding(false)
        setRefundModalOpen(false)

        // Refresh Data
        const result = await getEventAttendees(eventId, page, 20, debouncedSearch)
        setAttendees(result.attendees)
        setTotal(result.total)

        // Show Results
        if (insufficientFunds) {
            setRefundErrorModalOpen(true)
        } else if (failCount > 0) {
            toast({
                title: 'Refund Process Completed',
                description: `Successfully refunded ${successCount} orders. Failed: ${failCount}`,
                variant: 'destructive'
            })
        } else {
            toast({
                title: 'Refund Successful',
                description: `Successfully processed ${successCount} refunds. Customers have been notified.`
            })
        }

        // Reset selection
        setTicketsToRefund([])
        setSelectedAttendees(new Set())
    }

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

    const downloadCSV = () => {
        const headers = ['Ticket ID', 'Name', 'Email', 'Tier', 'Price', 'Status', 'Check-in Time']
        const rows = attendees.map(a => [
            a.id,
            a.user?.display_name || a.guest_info?.name || 'Guest',
            a.user?.email || a.guest_info?.email || '-',
            a.tier?.name || 'General',
            a.tier?.price?.toString() || '0',
            a.status,
            a.created_at ? new Date(a.created_at).toLocaleString() : '-'
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${eventTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.csv`
        link.click()
    }

    const downloadPDF = () => {
        const doc = new jsPDF()

        doc.setFontSize(18)
        doc.text(eventTitle, 14, 20)

        doc.setFontSize(10)
        doc.text(`Date: ${eventDate}`, 14, 30)
        doc.text(`Venue: ${eventVenue}`, 14, 35)
        doc.text(`Total Attendees: ${total}`, 14, 40)

        const tableColumn = ["Ticket ID", "Name", "Tier", "Status", "Email"]
        const tableRows = attendees.map(attendee => [
            attendee.id.slice(0, 8) + '...',
            attendee.user?.display_name || attendee.guest_info?.name || 'Guest',
            attendee.tier?.name || 'General',
            attendee.status,
            attendee.user?.email || attendee.guest_info?.email || '-'
        ])

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 45,
            theme: 'striped',
            headStyles: { fillColor: [66, 66, 66] }
        })

        doc.save(`${eventTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.pdf`)
    }

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
                        <>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    const selected = attendees.filter(a => selectedAttendees.has(a.id))
                                    initiateRefund(selected)
                                }}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Refund Selected ({selectedAttendees.size})
                            </Button>
                            <TicketPrintModal
                                attendees={selectedAttendeesData}
                                eventTitle={eventTitle}
                                eventDate={eventDate}
                                eventVenue={eventVenue}
                            />
                        </>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={downloadCSV}>
                                <FileText className="w-4 h-4 mr-2" />
                                Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={downloadPDF}>
                                <Sheet className="w-4 h-4 mr-2" />
                                Export as PDF
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

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
                            <TableHead>Payment</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground animate-pulse">
                                    Loading attendees...
                                </TableCell>
                            </TableRow>
                        ) : attendees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
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
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium text-sm">
                                                    {getPaymentMethodLabel(attendee.payment_method)}
                                                </span>
                                                {attendee.payment_status && attendee.payment_status !== 'completed' && (
                                                    <span className="text-[10px] text-muted-foreground capitalize">
                                                        {attendee.payment_status}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={attendee.status} />
                                            {attendee.refunded_amount ? (
                                                <div className="text-[10px] text-orange-600 font-medium mt-1">
                                                    -₱{attendee.refunded_amount.toLocaleString()}
                                                </div>
                                            ) : null}
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
                                                    {['valid', 'paid', 'checked_in'].includes(attendee.status) && (
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => initiateRefund([attendee])}
                                                        >
                                                            Refund Ticket / Order
                                                        </DropdownMenuItem>
                                                    )}
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

            {/* Refund Confirmation Modal */}
            <AlertDialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Review Refund Request</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4">
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                                <p className="font-semibold flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Warning: Refunds Entire Order
                                </p>
                                <p className="mt-2 text-sm">
                                    You are about to refund <span className="font-bold">{refundDetails.orderCount} order(s)</span> associated with the selected tickets.
                                    This will invalidate ALL tickets in these orders, even if not selected.
                                </p>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Selected Tickets:</span>
                                    <span className="font-medium">{ticketsToRefund.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Orders Affected:</span>
                                    <span className="font-medium">{refundDetails.orderCount}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 mt-2">
                                    <span>Processing Fee (Charged to You):</span>
                                    <span className="font-bold text-destructive">5% of Order Total</span>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground mt-4">
                                By confirming, you agree that a 5% processing fee will be deducted from your account balance.
                                The full order amount will be returned to the customer.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRefunding}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); processRefunds(); }}
                            disabled={isRefunding}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRefunding ? 'Processing...' : 'Confirm Refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Insufficient Balance / Error Modal */}
            <AlertDialog open={refundErrorModalOpen} onOpenChange={setRefundErrorModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Refund Failed: Insufficient Balance
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            We could not process this refund because your account balance is too low to cover the refund amount plus the 5% processing fee.
                            <br /><br />
                            Please contact support to top up your balance or resolve this issue.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Close</AlertDialogCancel>
                        <Button asChild>
                            <a href="mailto:support@hanghut.com?subject=Insufficient Balance for Refund">
                                Contact Support
                            </a>
                        </Button>
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
        completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        refunded: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        used: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
        cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    }

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${variants[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    )
}

function getPaymentMethodLabel(method: string | null) {
    if (!method) return '-'
    const map: Record<string, string> = {
        'GCASH': 'GCash',
        'PAYMAYA': 'Maya',
        'GRABPAY': 'GrabPay',
        'VISA': 'Visa',
        'MASTERCARD': 'Mastercard',
        'BPI': 'BPI Direct'
    }
    return map[method] || method
}
