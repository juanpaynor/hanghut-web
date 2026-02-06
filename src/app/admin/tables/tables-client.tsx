'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { Search, Eye } from 'lucide-react'
import Link from 'next/link'

interface TableData {
    id: string
    title: string
    datetime: string
    location_name: string
    status: string
    current_capacity: number
    max_guests: number
    host_id: string
    host: { display_name: string } | null
}

interface TablesClientProps {
    tables: TableData[]
    currentPage: number
    totalCount: number
    searchQuery: string
}

const ITEMS_PER_PAGE = 20

export function TablesClient({ tables, currentPage, totalCount, searchQuery }: TablesClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState(searchQuery)

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

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-green-500/10 text-green-500'
            case 'full':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'completed':
                return 'bg-blue-500/10 text-blue-500'
            case 'cancelled':
                return 'bg-red-500/10 text-red-500'
            default:
                return 'bg-gray-500/10 text-gray-500'
        }
    }

    return (
        <div className="space-y-6">
            {/* Search */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by title or location..."
                            value={search}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="pl-10 bg-card border-border text-foreground"
                        />
                    </div>
                </div>
            </div>

            {/* Results count */}
            <div className="text-sm text-muted-foreground">
                Showing {tables.length} of {totalCount} tables
                {searchQuery && ` (filtered by "${searchQuery}")`}
            </div>

            {/* Tables Table */}
            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="text-muted-foreground">Title</TableHead>
                            <TableHead className="text-muted-foreground">Host</TableHead>
                            <TableHead className="text-muted-foreground">Date/Time</TableHead>
                            <TableHead className="text-muted-foreground">Location</TableHead>
                            <TableHead className="text-muted-foreground">Status</TableHead>
                            <TableHead className="text-muted-foreground">Capacity</TableHead>
                            <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tables.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                    {searchQuery ? 'No tables found matching your search' : 'No tables found'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            tables.map((table) => (
                                <TableRow key={table.id} className="border-border hover:bg-card/50">
                                    <TableCell className="text-slate-300 font-medium">
                                        {table.title || 'Untitled'}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {table.host?.display_name || 'Unknown'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(table.datetime), 'MMM d, yyyy h:mm a')}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {table.location_name}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                                table.status
                                            )}`}
                                        >
                                            {table.status.toUpperCase()}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {table.current_capacity} / {table.max_guests}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/tables/${table.id}`}>
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
