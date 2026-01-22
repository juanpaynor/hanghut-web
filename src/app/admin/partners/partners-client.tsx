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
import { Search, CheckCircle, Clock, XCircle, Ban } from 'lucide-react'
import { PartnerDetailModal } from '@/components/admin/partner-detail-modal'

interface Partner {
    id: string
    user_id: string
    business_name: string
    business_type: string | null
    status: string
    verified: boolean
    pricing_model: string
    custom_percentage: number | null
    created_at: string
    approved_at: string | null
    user: {
        id: string
        display_name: string
        email: string
    } | null
}

interface PartnersClientProps {
    partners: Partner[]
    currentPage: number
    totalCount: number
    statusFilter: string
    searchQuery: string
}

const ITEMS_PER_PAGE = 20

export function PartnersClient({ partners, currentPage, totalCount, statusFilter, searchQuery }: PartnersClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState(searchQuery)
    const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)

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

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        startTransition(() => {
            router.push(`?${params.toString()}`)
        })
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending':
                return <Clock className="h-4 w-4" />
            case 'approved':
                return <CheckCircle className="h-4 w-4" />
            case 'rejected':
                return <XCircle className="h-4 w-4" />
            case 'suspended':
                return <Ban className="h-4 w-4" />
            default:
                return null
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending':
                return 'bg-yellow-500/10 text-yellow-500'
            case 'approved':
                return 'bg-green-500/10 text-green-500'
            case 'rejected':
                return 'bg-red-500/10 text-red-500'
            case 'suspended':
                return 'bg-slate-500/10 text-slate-500'
            default:
                return 'bg-slate-500/10 text-slate-500'
        }
    }

    return (
        <>
            <div className="space-y-6">
                {/* Filters and Search */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by business name..."
                                value={search}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="pl-10 bg-slate-800 border-slate-700 text-white"
                            />
                        </div>
                    </div>

                    <Select value={statusFilter} onValueChange={handleStatusFilter}>
                        <SelectTrigger className="w-[200px] bg-slate-800 border-slate-700 text-white">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Results count */}
                <div className="text-sm text-slate-400">
                    Showing {partners.length} of {totalCount} partners
                </div>

                {/* Partners Table */}
                <div className="rounded-md border border-slate-700">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-700 hover:bg-slate-800/50">
                                <TableHead className="text-slate-400">Business Name</TableHead>
                                <TableHead className="text-slate-400">Owner</TableHead>
                                <TableHead className="text-slate-400">Type</TableHead>
                                <TableHead className="text-slate-400">Status</TableHead>
                                <TableHead className="text-slate-400">Pricing</TableHead>
                                <TableHead className="text-slate-400">Joined</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {partners.length === 0 ? (
                                <TableRow className="border-slate-700">
                                    <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                                        No partners found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                partners.map((partner) => (
                                    <TableRow
                                        key={partner.id}
                                        className="border-slate-700 hover:bg-slate-800/50 cursor-pointer"
                                        onClick={() => setSelectedPartner(partner)}
                                    >
                                        <TableCell className="text-slate-300 font-medium">
                                            <div className="flex items-center gap-2">
                                                {partner.business_name}
                                                {partner.verified && (
                                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                                        ✓ Verified
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-slate-300 text-sm">{partner.user?.display_name || 'Unknown'}</p>
                                                <p className="text-slate-500 text-xs">{partner.user?.email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-slate-400 text-sm capitalize">
                                                {partner.business_type?.replace('_', ' ') || 'N/A'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={getStatusColor(partner.status)}>
                                                <span className="flex items-center gap-1">
                                                    {getStatusIcon(partner.status)}
                                                    {partner.status.toUpperCase()}
                                                </span>
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-slate-400 text-sm">
                                                {partner.pricing_model === 'custom'
                                                    ? `${partner.custom_percentage}%`
                                                    : '10% (Standard)'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-slate-400 text-sm">
                                            {format(new Date(partner.created_at), 'MMM d, yyyy')}
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
                                disabled={currentPage === 1 || isPending}
                                className="border-slate-700 hover:bg-slate-700"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages || isPending}
                                className="border-slate-700 hover:bg-slate-700"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Partner Detail Modal */}
            {selectedPartner && (
                <PartnerDetailModal
                    partner={selectedPartner}
                    open={!!selectedPartner}
                    onOpenChange={(open) => !open && setSelectedPartner(null)}
                />
            )}
        </>
    )
}
