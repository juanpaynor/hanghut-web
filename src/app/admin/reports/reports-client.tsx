'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/status-badge'
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useEffect } from 'react'
import { ReportWithDetails } from '@/lib/supabase/queries'

interface ReportsClientProps {
    reports: ReportWithDetails[]
    totalCount: number
    currentPage: number
    totalPages: number
}

export function ReportsClient({
    reports,
    totalCount,
    currentPage,
    totalPages,
}: ReportsClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [status, setStatus] = useState(searchParams.get('status') || 'all')
    const debouncedSearch = useDebounce(search, 300)

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())

        if (debouncedSearch) {
            params.set('search', debouncedSearch)
        } else {
            params.delete('search')
        }

        if (status !== 'all') {
            params.set('status', status)
        } else {
            params.delete('status')
        }

        // Reset to page 1 when filters change
        params.delete('page')

        router.push(`/admin/reports?${params.toString()}`)
    }, [debouncedSearch, status, router, searchParams])

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`/admin/reports?${params.toString()}`)
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 items-center">
                <Input
                    placeholder="Search by user..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm bg-slate-800 border-slate-700 text-white"
                />
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="investigating">Investigating</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto text-sm text-slate-400">
                    {totalCount} total reports
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border border-slate-700">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-slate-800/50">
                            <TableHead className="text-slate-400">ID</TableHead>
                            <TableHead className="text-slate-400">Reporter</TableHead>
                            <TableHead className="text-slate-400">Reported User</TableHead>
                            <TableHead className="text-slate-400">Reason</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-slate-400">Date</TableHead>
                            <TableHead className="text-slate-400">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reports.length === 0 ? (
                            <TableRow className="border-slate-700">
                                <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                                    No reports found
                                </TableCell>
                            </TableRow>
                        ) : (
                            reports.map((report) => (
                                <TableRow key={report.id} className="border-slate-700 hover:bg-slate-800/50">
                                    <TableCell className="font-mono text-sm text-slate-300">
                                        {report.id.slice(0, 8)}...
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {report.reporter?.display_name || 'Unknown'}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {report.reported?.display_name || (
                                            report.target_type === 'user' ? 'Unknown' :
                                                report.target_type === 'table' ? '[Table]' :
                                                    `[${report.target_type}]`
                                        )}
                                    </TableCell>
                                    <TableCell className="text-slate-300 capitalize">
                                        {report.reason_category}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={report.status} />
                                    </TableCell>
                                    <TableCell className="text-slate-400 text-sm">
                                        {format(new Date(report.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/reports/${report.id}`}>
                                            <Button size="sm" variant="ghost" className="hover:bg-slate-700">
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
                    <div className="text-sm text-slate-400">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="border-slate-700 hover:bg-slate-700 disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="border-slate-700 hover:bg-slate-700 disabled:opacity-50"
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
