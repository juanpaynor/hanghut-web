'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Attendee, getEventAttendees, refundTicket, markIntentAsRefunded, getAttendeeStats, getEventPaymentMethods, getEventTiers, getRegistrationAnswers, type RegistrationAnswerView, type AttendeeFilters } from '@/lib/organizer/attendee-actions'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { MoreHorizontal, Search, RefreshCw, AlertCircle, Download, FileText, Sheet, Armchair, CheckCircle2, Loader2, ClipboardList, Users, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

/** Rows per page. Shared by the fetch and the pager so the two can't drift. */
const PAGE_SIZE = 20

/**
 * Rows per request when exporting. Exports page through the SAME filtered
 * query as the table rather than reading the page in state — reading state
 * capped every export at PAGE_SIZE rows.
 */
const EXPORT_PAGE_SIZE = 200

interface AttendeeManagerProps {
    eventId: string
    initialAttendees: Attendee[]
    /**
     * Unpaginated attendee count from the server.
     *
     * Must NOT be derived from initialAttendees.length — that's one PAGE (20). It
     * made totalPages compute to 1, which hid the pager entirely, and because the
     * fetch effect deliberately skips its first run the total was never corrected.
     * An event with 68 attendees showed 20 and offered no way to reach the rest.
     */
    initialTotal: number
    eventTitle: string
    eventDate: string
    eventVenue: string
}

export function AttendeeManager({ eventId, initialAttendees, initialTotal, eventTitle, eventDate, eventVenue }: AttendeeManagerProps) {
    const { toast } = useToast()
    const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees)
    const [total, setTotal] = useState(initialTotal)
    const [loading, setLoading] = useState(false)

    // Pagination & Search
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebounce(search, 500)
    const totalPages = Math.ceil(total / PAGE_SIZE)

    // ── Filters ──────────────────────────────────────────────────────────
    // Orthogonal axes: status (lifecycle) is separate from check-in state, so
    // e.g. "Active + Not checked in" = live door / no-show list.
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'refunded'>('all')
    const [checkinFilter, setCheckinFilter] = useState<'any' | 'in' | 'out'>('any')
    const [tierFilter, setTierFilter] = useState('all')
    // Payment-method filter (e.g. isolate QRPH attendees for manual refunds).
    const [paymentFilter, setPaymentFilter] = useState('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [sort, setSort] = useState<'newest' | 'oldest' | 'checkin'>('newest')
    // Options derived from the event's real data.
    const [paymentMethods, setPaymentMethods] = useState<string[]>([])
    const [tiers, setTiers] = useState<{ id: string; name: string }[]>([])

    // Single source of truth for the current query — used by the effect, the
    // Refresh button and the post-refund reload, so they can never drift apart.
    const filters = useMemo<AttendeeFilters>(() => ({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        status: statusFilter,
        payment: paymentFilter,
        tierId: tierFilter,
        checkin: checkinFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
    }), [page, debouncedSearch, statusFilter, paymentFilter, tierFilter, checkinFilter, dateFrom, dateTo, sort])

    // Reset every filter to its default (Clear all).
    const clearAllFilters = () => {
        setSearch(''); setStatusFilter('all'); setCheckinFilter('any')
        setTierFilter('all'); setPaymentFilter('all'); setDateFrom(''); setDateTo('')
        setSort('newest'); setPage(1)
    }
    // Count of filters set inside the Filters popover (drives the trigger badge).
    // Payment method lives on the main bar (refund workflow), so it's excluded.
    const popoverActiveCount =
        (tierFilter !== 'all' ? 1 : 0) +
        (checkinFilter !== 'any' ? 1 : 0) +
        (dateFrom || dateTo ? 1 : 0) +
        (sort !== 'newest' ? 1 : 0)

    // Top-of-page stats (filter-independent)
    const [stats, setStats] = useState<{ attendees: number; checkedIn: number; revenue: number } | null>(null)

    // Registration answers dialog
    const [answersOpen, setAnswersOpen] = useState(false)
    const [answersLoading, setAnswersLoading] = useState(false)
    const [answers, setAnswers] = useState<RegistrationAnswerView[]>([])
    const [answersName, setAnswersName] = useState('')

    // Re-fetch when page / search / status filter changes. (Previously there was
    // no effect at all — search & pagination only worked via the Refresh button.)
    const didMount = useRef(false)
    useEffect(() => {
        // Skip the first run: initialAttendees already cover page 1 / no filter.
        if (!didMount.current) { didMount.current = true; return }
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                const result = await getEventAttendees(eventId, filters)
                if (!cancelled) { setAttendees(result.attendees); setTotal(result.total) }
            } catch {
                if (!cancelled) toast({ title: 'Error', description: 'Failed to load attendees', variant: 'destructive' })
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [eventId, filters, toast])

    // Load stats + filter options once
    useEffect(() => {
        getAttendeeStats(eventId).then(setStats).catch(() => {})
        getEventPaymentMethods(eventId).then(setPaymentMethods).catch(() => {})
        getEventTiers(eventId).then(setTiers).catch(() => {})
    }, [eventId])

    async function openAnswers(attendee: Attendee, name: string) {
        if (!attendee.registration_id) return
        setAnswersName(name)
        setAnswers([])
        setAnswersOpen(true)
        setAnswersLoading(true)
        try {
            setAnswers(await getRegistrationAnswers(attendee.registration_id))
        } finally {
            setAnswersLoading(false)
        }
    }

    const seatLine = (s: Attendee['seat_info']): string | null => {
        if (!s) return null
        const parts: string[] = []
        if (s.section) parts.push(s.section)
        if (s.row) parts.push(`Row ${s.row}`)
        if (s.seat != null) parts.push(`Seat ${s.seat}`)
        if (parts.length === 0 && s.label) return s.label
        return parts.length ? parts.join(' · ') : null
    }

    // Refund State
    const [isRefunding, setIsRefunding] = useState(false)
    const [refundModalOpen, setRefundModalOpen] = useState(false)
    const [refundErrorModalOpen, setRefundErrorModalOpen] = useState(false)

    // Selection for Refund (Single or Bulk)
    const [ticketsToRefund, setTicketsToRefund] = useState<Attendee[]>([])
    const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(new Set())

    // Computed Refund Details. Refunding ANY ticket refunds the WHOLE order, so we
    // group the selected tickets by order and sum each order's total ONCE (net of
    // anything already refunded). order_total now comes from the intent, so this is
    // the real amount returned to customers — no more placeholder estimate.
    const refundDetails = (() => {
        const orders = new Map<string, { remaining: number; qrph: boolean }>()
        ticketsToRefund.forEach(t => {
            if (!t.purchase_intent_id || orders.has(t.purchase_intent_id)) return
            orders.set(t.purchase_intent_id, {
                remaining: Math.max(0, (t.order_total || 0) - (t.refunded_amount || 0)),
                qrph: (t.payment_method || '').toLowerCase() === 'qrph',
            })
        })
        // QRPH orders can't be auto-reversed here, so exclude them from the amount
        // that will actually be refunded by this action.
        let totalRefund = 0, qrphCount = 0, autoCount = 0
        orders.forEach(o => { if (o.qrph) qrphCount++; else { autoCount++; totalRefund += o.remaining } })
        return {
            orderCount: orders.size,
            ticketCount: ticketsToRefund.length,
            totalRefund,
            qrphCount,
            autoCount,
        }
    })()

    const initiateRefund = (attendeesToRefund: Attendee[]) => {
        setTicketsToRefund(attendeesToRefund)
        setRefundModalOpen(true)
    }

    const processRefunds = async () => {
        setIsRefunding(true)
        const supabase = createClient()

        // Unique orders, plus each order's payment method (QRPH can't be auto-reversed).
        const intentMethod = new Map<string, string>()
        ticketsToRefund.forEach(t => {
            if (t.purchase_intent_id) intentMethod.set(t.purchase_intent_id, (t.payment_method || '').toLowerCase())
        })
        const uniqueIntentIds = Array.from(intentMethod.keys())

        let successCount = 0
        let failCount = 0
        let qrphCount = 0
        let insufficientFunds = false

        for (const intentId of uniqueIntentIds) {
            // QRPH refunds cannot be reversed via Xendit — they must be sent as a
            // bank/e-wallet transfer (or recorded manually) from Payouts → the
            // transaction. Skip them here with a clear pointer instead of failing.
            if (intentMethod.get(intentId) === 'qrph') {
                qrphCount++
                continue
            }

            try {
                // Single path: markIntentAsRefunded calls request-refund (money) AND
                // voids the tickets + releases tier inventory. Calling request-refund
                // separately here caused a double call that blocked the ticket voiding.
                const res = await markIntentAsRefunded(intentId, eventId, 'Requested by Organizer via Dashboard')
                if (!res?.success) throw new Error('Refund failed')

                // Notify the customer (fire-and-forget — never block the success flow).
                try {
                    await supabase.functions.invoke('send-transaction-email', {
                        body: { type: 'refund_initiated', intent_id: intentId },
                    })
                } catch (emailErr) {
                    console.warn('Failed to send refund email', emailErr)
                }

                successCount++
            } catch (err: any) {
                console.error(`Refund failed for intent ${intentId}:`, err)
                if (/balance/i.test(String(err?.message || ''))) {
                    insufficientFunds = true
                    failCount++
                    break // Stop on a wallet-balance problem — the rest will fail too.
                }
                failCount++
            }
        }

        setIsRefunding(false)
        setRefundModalOpen(false)

        // Refresh Data (preserve active filters)
        const result = await getEventAttendees(eventId, filters)
        setAttendees(result.attendees)
        setTotal(result.total)

        // Show Results — honest about what actually happened.
        const qrphNote = qrphCount > 0
            ? ` ${qrphCount} QRPH order${qrphCount === 1 ? '' : 's'} skipped — refund ${qrphCount === 1 ? 'it' : 'them'} from Payouts (bank/e-wallet transfer).`
            : ''
        if (insufficientFunds) {
            setRefundErrorModalOpen(true)
        } else if (failCount > 0) {
            toast({
                title: 'Some refunds failed',
                description: `Refunded ${successCount}. Failed: ${failCount}.${qrphNote}`,
                variant: 'destructive',
            })
        } else if (successCount === 0 && qrphCount > 0) {
            toast({
                title: 'Use Payouts for QRPH refunds',
                description: `${qrphCount} QRPH order${qrphCount === 1 ? '' : 's'} can’t be refunded here. Open ${qrphCount === 1 ? 'it' : 'them'} in Payouts to send a GCash/bank transfer.`,
                variant: 'destructive',
            })
        } else {
            toast({
                title: 'Refund successful',
                description: `Refunded ${successCount} order${successCount === 1 ? '' : 's'}. Customers have been notified.${qrphNote}`,
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

    const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

    /**
     * Every attendee matching the CURRENT filters, not just the page on screen.
     * `attendees` holds a single page, so exporting from it silently truncated
     * the file — an event with 68 attendees exported 20 rows with no warning.
     */
    const fetchAllForExport = async (): Promise<Attendee[]> => {
        const first = await getEventAttendees(eventId, { ...filters, page: 1, limit: EXPORT_PAGE_SIZE })
        const all = [...first.attendees]
        const pages = Math.max(1, Math.ceil(first.total / EXPORT_PAGE_SIZE))
        for (let p = 2; p <= pages; p++) {
            const next = await getEventAttendees(eventId, { ...filters, page: p, limit: EXPORT_PAGE_SIZE })
            // A short or empty page means we've run out; don't spin.
            if (!next.attendees.length) break
            all.push(...next.attendees)
        }
        return all
    }

    /** RFC 4180: wrap in quotes, and double any quote inside the value. */
    const csvCell = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`

    const downloadCSV = async () => {
        if (exporting) return
        setExporting('csv')
        try {
            const rowsSource = await fetchAllForExport()

            const headers = ['Ticket #', 'Name', 'Email', 'Tier', 'Price', 'Seat', 'Status', 'Purchased', 'Check-in Time']
            const rows = rowsSource.map(a => [
                a.ticket_number || a.id,
                a.user?.display_name || a.guest_info?.name || 'Guest',
                a.user?.email || a.guest_info?.email || '-',
                a.tier?.name || 'General',
                a.amount_paid.toString(),
                seatLine(a.seat_info) || '-',
                a.status,
                a.created_at ? new Date(a.created_at).toLocaleString() : '-',
                a.checked_in_at ? new Date(a.checked_in_at).toLocaleString() : '-'
            ])

            const csvContent = [
                headers.map(csvCell).join(','),
                ...rows.map(row => row.map(csvCell).join(','))
            ].join('\n')

            // BOM so Excel reads it as UTF-8 (accented names arrive intact).
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${eventTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.csv`
            // Appended before clicking, and the URL revoked a tick later rather than
            // on the same one. Chrome resolves the blob during click(), but Safari
            // and Firefox can abort the download if the URL is revoked synchronously
            // The failure mode is a silently missing file, not an error.
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            setTimeout(() => URL.revokeObjectURL(url), 0)

            toast({ title: 'Export ready', description: `${rows.length} attendee${rows.length === 1 ? '' : 's'} exported.` })
        } catch {
            toast({ title: 'Export failed', description: 'Could not load all attendees.', variant: 'destructive' })
        } finally {
            setExporting(null)
        }
    }

    const downloadPDF = async () => {
        if (exporting) return
        setExporting('pdf')
        try {
            const rowsSource = await fetchAllForExport()

            const doc = new jsPDF()

            doc.setFontSize(18)
            doc.text(eventTitle, 14, 20)

            doc.setFontSize(10)
            doc.text(`Date: ${eventDate}`, 14, 30)
            doc.text(`Venue: ${eventVenue}`, 14, 35)
            // Count the rows actually in this file. Printing `total` here while
            // listing one page made the header contradict the table.
            doc.text(`Attendees in this export: ${rowsSource.length}`, 14, 40)

            const tableColumn = ["Ticket #", "Name", "Tier", "Status", "Email"]
            const tableRows = rowsSource.map(attendee => [
                attendee.ticket_number || attendee.id.slice(0, 8),
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
            toast({ title: 'Export ready', description: `${tableRows.length} attendee${tableRows.length === 1 ? '' : 's'} exported.` })
        } catch {
            toast({ title: 'Export failed', description: 'Could not load all attendees.', variant: 'destructive' })
        } finally {
            setExporting(null)
        }
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Attendees</p>
                    <p className="text-2xl font-bold mt-1">{stats?.attendees ?? '—'}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Checked in</p>
                    <p className="text-2xl font-bold mt-1">
                        {stats ? `${stats.checkedIn} / ${stats.attendees}` : '—'}
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground">Net sales <span className="opacity-60">(after refunds)</span></p>
                    <p className="text-2xl font-bold mt-1">{stats ? `₱${stats.revenue.toLocaleString()}` : '—'}</p>
                </div>
            </div>

            {/* ── Filter bar ── */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Status pills (lifecycle axis) */}
                    <div className="flex items-center gap-1.5">
                        {([
                            { key: 'all', label: 'All' },
                            { key: 'active', label: 'Active' },
                            { key: 'refunded', label: 'Refunded' },
                        ] as const).map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => { setStatusFilter(t.key); setPage(1) }}
                                className={cn(
                                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                                    statusFilter === t.key
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name, email, ticket #..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                            className="pl-8"
                        />
                    </div>

                    {/* Payment method — visible on the bar (drives the refund workflow:
                        isolate e.g. QRPH/GCash purchases, then bulk-refund the set). */}
                    <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1) }}>
                        <SelectTrigger className={cn('h-9 w-[150px]', paymentFilter !== 'all' && 'border-primary text-primary')}>
                            <SelectValue placeholder="All payments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All payments</SelectItem>
                            {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m === 'UNKNOWN' ? 'Unknown' : getPaymentMethodLabel(m)}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    {/* Filters popover (tier / check-in / date / sort) */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <SlidersHorizontal className="h-4 w-4" />
                                Filters
                                {popoverActiveCount > 0 && (
                                    <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1.5">{popoverActiveCount}</Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Ticket type</label>
                                <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1) }}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All ticket types</SelectItem>
                                        {tiers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Check-in</label>
                                <Select value={checkinFilter} onValueChange={(v) => { setCheckinFilter(v as 'any' | 'in' | 'out'); setPage(1) }}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="any">Any</SelectItem>
                                        <SelectItem value="in">Checked in</SelectItem>
                                        <SelectItem value="out">Not checked in</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Purchased between</label>
                                <div className="flex items-center gap-2">
                                    <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="h-9" />
                                    <span className="text-muted-foreground text-xs">to</span>
                                    <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="h-9" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Sort by</label>
                                <Select value={sort} onValueChange={(v) => { setSort(v as 'newest' | 'oldest' | 'checkin'); setPage(1) }}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="newest">Newest first</SelectItem>
                                        <SelectItem value="oldest">Oldest first</SelectItem>
                                        <SelectItem value="checkin">Recently checked in</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {popoverActiveCount > 0 && (
                                <Button variant="ghost" size="sm" className="w-full" onClick={clearAllFilters}>Clear all filters</Button>
                            )}
                        </PopoverContent>
                    </Popover>

                    {/* Right-side actions */}
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
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
                                    Refund ({selectedAttendees.size})
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
                                <DropdownMenuItem onClick={downloadCSV} disabled={exporting !== null}>
                                    {exporting === 'csv'
                                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        : <FileText className="w-4 h-4 mr-2" />}
                                    Export as CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={downloadPDF} disabled={exporting !== null}>
                                    {exporting === 'pdf'
                                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        : <Sheet className="w-4 h-4 mr-2" />}
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
                                        const result = await getEventAttendees(eventId, filters)
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
                        <div className="text-sm text-muted-foreground whitespace-nowrap">
                            Total: <span className="font-medium text-foreground">{total}</span>
                        </div>
                    </div>
                </div>

                {/* Active-filter chips */}
                {(statusFilter !== 'all' || checkinFilter !== 'any' || tierFilter !== 'all' || paymentFilter !== 'all' || dateFrom || dateTo || sort !== 'newest' || debouncedSearch) && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Filters:</span>
                        {debouncedSearch && <FilterChip label={`Search: "${debouncedSearch}"`} onClear={() => setSearch('')} />}
                        {statusFilter !== 'all' && <FilterChip label={statusFilter === 'active' ? 'Active' : 'Refunded'} onClear={() => setStatusFilter('all')} />}
                        {checkinFilter !== 'any' && <FilterChip label={checkinFilter === 'in' ? 'Checked in' : 'Not checked in'} onClear={() => setCheckinFilter('any')} />}
                        {tierFilter !== 'all' && <FilterChip label={tiers.find(t => t.id === tierFilter)?.name || 'Ticket type'} onClear={() => setTierFilter('all')} />}
                        {paymentFilter !== 'all' && <FilterChip label={paymentFilter === 'UNKNOWN' ? 'Unknown payment' : getPaymentMethodLabel(paymentFilter)} onClear={() => setPaymentFilter('all')} />}
                        {(dateFrom || dateTo) && <FilterChip label={`${dateFrom || '…'} → ${dateTo || '…'}`} onClear={() => { setDateFrom(''); setDateTo('') }} />}
                        {sort !== 'newest' && <FilterChip label={sort === 'oldest' ? 'Oldest first' : 'Recently checked in'} onClear={() => setSort('newest')} />}
                        <button type="button" onClick={clearAllFilters} className="text-xs font-medium text-primary hover:underline">Clear all</button>
                    </div>
                )}
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
                            <TableHead>Seat</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Check-in</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground animate-pulse">
                                    Loading attendees...
                                </TableCell>
                            </TableRow>
                        ) : attendees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center">
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
                                                {attendee.ticket_number && (
                                                    <span className="text-[10px] font-mono text-muted-foreground">{attendee.ticket_number}</span>
                                                )}
                                                {isGuest && <Badge variant="outline" className="w-fit mt-1 text-[10px]">Guest Checkout</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {format(new Date(attendee.created_at), 'MMM d, yyyy h:mm a')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{attendee.tier?.name || 'General Admission'}</Badge>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                ₱{attendee.amount_paid.toLocaleString()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {seatLine(attendee.seat_info)
                                                ? <span className="flex items-center gap-1"><Armchair className="h-3.5 w-3.5 text-muted-foreground" />{seatLine(attendee.seat_info)}</span>
                                                : <span className="text-muted-foreground">—</span>}
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
                                        <TableCell className="text-sm">
                                            {attendee.checked_in_at ? (
                                                <span className="flex items-center gap-1 text-green-600">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {format(new Date(attendee.checked_in_at), 'MMM d, h:mm a')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Not yet</span>
                                            )}
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
                                                    {attendee.registration_id && (
                                                        <DropdownMenuItem onClick={() => openAnswers(attendee, name)}>
                                                            <ClipboardList className="w-4 h-4 mr-2" />
                                                            View answers
                                                        </DropdownMenuItem>
                                                    )}
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
                                    <span>Refunded to Customers:</span>
                                    <span className="font-bold text-destructive">₱{refundDetails.totalRefund.toLocaleString()}</span>
                                </div>
                            </div>

                            {refundDetails.qrphCount > 0 && (
                                <div className="rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-900/20 p-3 text-sm text-orange-800 dark:text-orange-200">
                                    <span className="font-semibold">{refundDetails.qrphCount} QRPH order{refundDetails.qrphCount === 1 ? '' : 's'} will be skipped.</span> QRPH can’t be reversed automatically — refund {refundDetails.qrphCount === 1 ? 'it' : 'them'} from <span className="font-medium">Payouts</span> as a GCash/bank transfer.
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground mt-4">
                                The full order amount is returned to the customer and deducted from your
                                wallet balance. HangHut&apos;s service fee is non-refundable.
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
                            We could not process this refund because your wallet balance is too low to cover the refund amount.
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

            {/* Registration answers */}
            <Dialog open={answersOpen} onOpenChange={setAnswersOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Registration answers{answersName ? ` — ${answersName}` : ''}</DialogTitle>
                    </DialogHeader>
                    {answersLoading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : answers.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No answers recorded.</p>
                    ) : (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                            {answers.map((a, i) => (
                                <div key={i}>
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{a.label}</p>
                                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{a.answer}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
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

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1 py-0.5 text-xs font-medium text-primary">
            {label}
            <button
                type="button"
                onClick={onClear}
                className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                aria-label={`Remove ${label} filter`}
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    )
}

function getPaymentMethodLabel(method: string | null) {
    if (!method || method === 'UNKNOWN') return '-'
    const map: Record<string, string> = {
        'GCASH': 'GCash',
        'PAYMAYA': 'Maya',
        'GRABPAY': 'GrabPay',
        'QRPH': 'QRPH',
        'CARDS': 'Card',
        'CARD': 'Card',
        'CREDIT_CARD': 'Card',
        'VISA': 'Visa',
        'MASTERCARD': 'Mastercard',
        'BPI': 'BPI Direct',
        'BPI_DIRECT_DEBIT': 'BPI Direct Debit',
        'UBP_DIRECT_DEBIT': 'UnionBank Direct Debit',
        'RCBC_DIRECT_DEBIT': 'RCBC Direct Debit',
        'SHOPEEPAY': 'ShopeePay',
        'FREE': 'Free',
    }
    return map[method] || method
}
