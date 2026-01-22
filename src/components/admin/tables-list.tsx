'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { MapPin, Eye } from 'lucide-react'
import { TableDetailsModal } from './table-details-modal'

interface TablesListClientProps {
    hostId: string
    tables: any[]
}

export function TablesListClient({ hostId, tables }: TablesListClientProps) {
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null)

    return (
        <>
            <div className="rounded-md border border-slate-700">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-slate-800/50">
                            <TableHead className="text-slate-400">Date/Time</TableHead>
                            <TableHead className="text-slate-400">Location</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-slate-400">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tables.map((table) => (
                            <TableRow key={table.id} className="border-slate-700 hover:bg-slate-800/50">
                                <TableCell className="text-slate-300">
                                    {format(new Date(table.datetime), 'MMM d, yyyy h:mm a')}
                                </TableCell>
                                <TableCell className="text-slate-300">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-slate-500" />
                                        {table.location_name}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${table.status === 'open' ? 'bg-green-500/10 text-green-500' :
                                            table.status === 'full' ? 'bg-yellow-500/10 text-yellow-500' :
                                                'bg-gray-500/10 text-gray-500'
                                        }`}>
                                        {table.status.toUpperCase()}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="hover:bg-slate-700"
                                        onClick={() => setSelectedTableId(table.id)}
                                    >
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {selectedTableId && (
                <TableDetailsModal
                    tableId={selectedTableId}
                    open={!!selectedTableId}
                    onOpenChange={(open) => !open && setSelectedTableId(null)}
                />
            )}
        </>
    )
}
