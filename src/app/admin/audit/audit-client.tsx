'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface AdminAction {
    id: string
    action_type: string
    reason: string
    created_at: string
    admin: {
        id: string
        display_name: string
    } | null
    target_user: {
        id: string
        display_name: string
    } | null
}

interface AuditClientProps {
    actions: AdminAction[]
    totalCount: number
    currentPage: number
    totalPages: number
}

export function AuditClient({
    actions,
    totalCount,
    currentPage,
    totalPages,
}: AuditClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [actionType, setActionType] = useState(searchParams.get('action_type') || 'all')

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())

        if (actionType !== 'all') {
            params.set('action_type', actionType)
        } else {
            params.delete('action_type')
        }

        // Reset to page 1 when filters change
        params.delete('page')

        router.push(`/admin/audit?${params.toString()}`)
    }, [actionType, router, searchParams])

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`/admin/audit?${params.toString()}`)
    }

    const getActionTypeBadge = (type: string) => {
        const styles = {
            ban: 'bg-red-500/10 text-red-500',
            suspend: 'bg-yellow-500/10 text-yellow-500',
            activate: 'bg-green-500/10 text-green-500',
            reset_password: 'bg-blue-500/10 text-blue-500',
            delete: 'bg-gray-500/10 text-gray-500',
        }

        const style = styles[type as keyof typeof styles] || styles.ban

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${style}`}>
                {type.replace('_', ' ')}
            </span>
        )
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 items-center">
                <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="w-48 bg-card border-border text-foreground">
                        <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        <SelectItem value="ban">Ban</SelectItem>
                        <SelectItem value="suspend">Suspend</SelectItem>
                        <SelectItem value="activate">Activate</SelectItem>
                        <SelectItem value="reset_password">Reset Password</SelectItem>
                        <SelectItem value="delete">Delete Account</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto text-sm text-muted-foreground">
                    {totalCount} total actions
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="text-muted-foreground">Date</TableHead>
                            <TableHead className="text-muted-foreground">Admin</TableHead>
                            <TableHead className="text-muted-foreground">Action</TableHead>
                            <TableHead className="text-muted-foreground">Target User</TableHead>
                            <TableHead className="text-muted-foreground">Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {actions.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                    No audit actions found
                                </TableCell>
                            </TableRow>
                        ) : (
                            actions.map((action) => (
                                <TableRow key={action.id} className="border-border hover:bg-card/50">
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(action.created_at), 'MMM d, yyyy h:mm a')}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {action.admin?.display_name || 'Unknown Admin'}
                                    </TableCell>
                                    <TableCell>
                                        {getActionTypeBadge(action.action_type)}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {action.target_user?.display_name || 'Unknown User'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm max-w-md truncate">
                                        {action.reason}
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
