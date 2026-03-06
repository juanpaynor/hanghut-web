'use client'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'

export interface PartnerRevenueStat {
    partner_id: string
    business_name: string
    total_gmv: number
    total_platform_fees: number
    total_payouts: number
    pending_balance: number
    last_payout_at: string | null
}

interface PartnerRevenueTableProps {
    data: PartnerRevenueStat[]
}

export function PartnerRevenueTable({ data }: PartnerRevenueTableProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortConfig, setSortConfig] = useState<{
        key: keyof PartnerRevenueStat
        direction: 'asc' | 'desc'
    }>({ key: 'total_gmv', direction: 'desc' })

    // Filter data
    const filteredData = data.filter((item) =>
        item.business_name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Sort data
    const sortedData = [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]

        if (aValue === null) return 1
        if (bValue === null) return -1
        if (aValue === bValue) return 0

        const comparison = aValue > bValue ? 1 : -1
        return sortConfig.direction === 'asc' ? comparison : -comparison
    })

    const requestSort = (key: keyof PartnerRevenueStat) => {
        let direction: 'asc' | 'desc' = 'desc'
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc'
        }
        setSortConfig({ key, direction })
    }

    const SortIcon = ({ columnKey }: { columnKey: keyof PartnerRevenueStat }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground opacity-50" />
        return <ArrowUpDown className={`ml-2 h-4 w-4 text-primary ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="relative max-w-sm w-full">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search partners..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <div className="text-sm text-muted-foreground">
                    Note: "Pending Balance" is estimated from completed transactions without a payout.
                </div>
            </div>

            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-card/50">
                            <TableHead className="w-[250px]">
                                <Button variant="ghost" onClick={() => requestSort('business_name')} className="pl-0 hover:bg-transparent">
                                    Partner
                                    <SortIcon columnKey="business_name" />
                                </Button>
                            </TableHead>
                            <TableHead className="text-right">
                                <Button variant="ghost" onClick={() => requestSort('total_gmv')} className="hover:bg-transparent w-full flex justify-end">
                                    Total Sales (GMV)
                                    <SortIcon columnKey="total_gmv" />
                                </Button>
                            </TableHead>
                            <TableHead className="text-right">
                                <Button variant="ghost" onClick={() => requestSort('total_platform_fees')} className="hover:bg-transparent w-full flex justify-end">
                                    Platform Revenue
                                    <SortIcon columnKey="total_platform_fees" />
                                </Button>
                            </TableHead>
                            <TableHead className="text-right">
                                <Button variant="ghost" onClick={() => requestSort('total_payouts')} className="hover:bg-transparent w-full flex justify-end">
                                    Total Paid Out
                                    <SortIcon columnKey="total_payouts" />
                                </Button>
                            </TableHead>
                            <TableHead className="text-right">
                                <Button variant="ghost" onClick={() => requestSort('pending_balance')} className="hover:bg-transparent w-full flex justify-end">
                                    Pending Balance
                                    <SortIcon columnKey="pending_balance" />
                                </Button>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No partners found
                                </TableCell>
                            </TableRow>
                        ) : (
                            sortedData.map((row) => (
                                <TableRow key={row.partner_id} className="border-border hover:bg-card/50">
                                    <TableCell className="font-medium">
                                        {row.business_name}
                                        {row.last_payout_at && (
                                            <div className="text-xs text-muted-foreground mt-1">
                                                Last payout: {new Date(row.last_payout_at).toLocaleDateString()}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        ₱{row.total_gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-blue-500">
                                        ₱{row.total_platform_fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-green-500">
                                        ₱{row.total_payouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-yellow-500 font-bold">
                                        ₱{row.pending_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
