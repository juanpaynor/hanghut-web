import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'

export function SkeletonTable({ rows = 10 }: { rows?: number }) {
    return (
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
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRow key={i} className="border-slate-700">
                            <TableCell>
                                <Skeleton className="h-4 w-20 bg-slate-700" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-4 w-32 bg-slate-700" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-4 w-32 bg-slate-700" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-4 w-24 bg-slate-700" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-6 w-20 bg-slate-700 rounded-full" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-4 w-24 bg-slate-700" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-8 w-16 bg-slate-700" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
