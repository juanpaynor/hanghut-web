'use client'

import { useState, useEffect } from 'react'
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
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChevronLeft, ChevronRight, User } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { UserStatusBadge } from '@/components/admin/user-status-badge'

interface User {
    id: string
    display_name: string | null
    trust_score: number
    created_at: string
    status?: string
    user_photos: { photo_url: string }[]
}

interface UsersClientProps {
    users: User[]
    totalCount: number
    currentPage: number
    totalPages: number
}

export function UsersClient({
    users,
    totalCount,
    currentPage,
    totalPages,
}: UsersClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [search, setSearch] = useState(searchParams.get('search') || '')
    const debouncedSearch = useDebounce(search, 300)

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())

        if (debouncedSearch) {
            params.set('search', debouncedSearch)
        } else {
            params.delete('search')
        }

        // Reset to page 1 when search changes
        if (debouncedSearch !== searchParams.get('search')) {
            params.delete('page')
        }

        router.push(`/admin/users?${params.toString()}`)
    }, [debouncedSearch, router, searchParams])

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`/admin/users?${params.toString()}`)
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 items-center">
                <Input
                    placeholder="Search by name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm bg-card border-border text-foreground"
                />
                <div className="ml-auto text-sm text-muted-foreground">
                    {totalCount} total users
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="text-muted-foreground">User</TableHead>
                            <TableHead className="text-muted-foreground">Status</TableHead>
                            <TableHead className="text-muted-foreground">Trust Score</TableHead>
                            <TableHead className="text-muted-foreground">Joined</TableHead>
                            <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                    No users found
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => (
                                <TableRow key={user.id} className="border-border hover:bg-card/50">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={user.user_photos?.[0]?.photo_url} />
                                                <AvatarFallback className="bg-muted text-slate-300">
                                                    {user.display_name?.slice(0, 2).toUpperCase() || '??'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="text-foreground font-medium">
                                                {user.display_name || 'Unknown User'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <UserStatusBadge status={user.status || 'active'} />
                                    </TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.trust_score >= 80 ? 'bg-green-500/10 text-green-500' :
                                            user.trust_score >= 50 ? 'bg-yellow-500/10 text-yellow-500' :
                                                'bg-red-500/10 text-red-500'
                                            }`}>
                                            {user.trust_score}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/users/${user.id}`}>
                                            <Button size="sm" variant="ghost" className="hover:bg-muted">
                                                <User className="h-4 w-4 mr-2" />
                                                Profile
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
                            disabled={currentPage === 1}
                            className="border-border hover:bg-muted disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="border-border hover:bg-muted disabled:opacity-50"
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
