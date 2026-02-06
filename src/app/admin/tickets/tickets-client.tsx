'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Search, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react'
import { TicketDetailModal } from '@/components/admin/ticket-detail-modal'

interface Ticket {
    id: string
    subject: string
    message: string
    status: string
    priority: string
    ticket_type: string
    user_display_name: string
    user_email: string
    user_id: string
    account_status: string
    account_status_reason: string
    admin_response: string | null
    created_at: string
    updated_at: string
    resolved_at: string | null
    admin: { display_name: string } | null
}

interface TicketsClientProps {
    tickets: Ticket[]
    currentPage: number
    totalCount: number
    statusFilter: string
    typeFilter: string
    searchQuery: string
}

const ITEMS_PER_PAGE = 20

export function TicketsClient({ tickets, currentPage, totalCount, statusFilter, typeFilter, searchQuery }: TicketsClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState(searchQuery)
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    const handleSearch = (value: string) => {
        setSearch(value)
        const params = new URLSearchParams(searchParams.toString())
        if (value) {
            params.set('search', value)
        } else {
            params.delete('search')
        }
        params.delete('page') // Reset to page 1 on search
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const handleStatusFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'all') {
            params.delete('status')
        } else {
            params.set('status', value)
        }
        params.delete('page') // Reset to page 1 on filter change
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
        params.delete('page') // Reset to page 1 on filter change
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

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'urgent':
                return 'bg-red-500/10 text-red-500 border-red-500/20'
            case 'high':
                return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
            case 'normal':
                return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
            case 'low':
                return 'bg-slate-500/10 text-muted-foreground border-slate-500/20'
            default:
                return 'bg-slate-500/10 text-muted-foreground border-slate-500/20'
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'open':
                return <AlertCircle className="h-4 w-4" />
            case 'in_progress':
                return <Clock className="h-4 w-4" />
            case 'resolved':
                return <CheckCircle className="h-4 w-4" />
            case 'closed':
                return <XCircle className="h-4 w-4" />
            default:
                return null
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'in_progress':
                return 'bg-blue-500/10 text-blue-500'
            case 'resolved':
                return 'bg-green-500/10 text-green-500'
            case 'closed':
                return 'bg-slate-500/10 text-muted-foreground'
            default:
                return 'bg-slate-500/10 text-muted-foreground'
        }
    }

    return (
        <>
            <div className="space-y-6">
                {/* Filters and Search */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by subject, user name, or email..."
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
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={typeFilter} onValueChange={handleTypeFilter}>
                        <SelectTrigger className="w-[200px] bg-card border-border text-foreground">
                            <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="account_appeal">Account Appeals</SelectItem>
                            <SelectItem value="bug_report">Bug Reports</SelectItem>
                            <SelectItem value="feature_request">Feature Requests</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Results count */}
                <div className="text-sm text-muted-foreground">
                    Showing {tickets.length} of {totalCount} tickets
                </div>

                {/* Tickets Table */}
                <div className="rounded-md border border-border">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-card/50">
                                <TableHead className="text-muted-foreground">Priority</TableHead>
                                <TableHead className="text-muted-foreground">Subject</TableHead>
                                <TableHead className="text-muted-foreground">User</TableHead>
                                <TableHead className="text-muted-foreground">Type</TableHead>
                                <TableHead className="text-muted-foreground">Status</TableHead>
                                <TableHead className="text-muted-foreground">Created</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tickets.length === 0 ? (
                                <TableRow className="border-border">
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        No tickets found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tickets.map((ticket) => (
                                    <TableRow
                                        key={ticket.id}
                                        className="border-border hover:bg-card/50 cursor-pointer"
                                        onClick={() => setSelectedTicket(ticket)}
                                    >
                                        <TableCell>
                                            <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                                                {ticket.priority.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-300 font-medium max-w-md truncate">
                                            {ticket.subject}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-slate-300 text-sm">{ticket.user_display_name}</p>
                                                <p className="text-muted-foreground text-xs">{ticket.user_email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-muted-foreground text-sm capitalize">
                                                {ticket.ticket_type.replace('_', ' ')}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={getStatusColor(ticket.status)}>
                                                <span className="flex items-center gap-1">
                                                    {getStatusIcon(ticket.status)}
                                                    {ticket.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}
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

            {/* Ticket Detail Modal */}
            {selectedTicket && (
                <TicketDetailModal
                    ticket={selectedTicket}
                    open={!!selectedTicket}
                    onOpenChange={(open: boolean) => !open && setSelectedTicket(null)}
                />
            )}
        </>
    )
}
