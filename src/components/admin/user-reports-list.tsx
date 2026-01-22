import { createClient } from '@/lib/supabase/server'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/admin/status-badge'
import { format } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { getUserReports } from '@/lib/supabase/queries'

async function UserReportsList({ userId }: { userId: string }) {
    const supabase = await createClient()
    const reports = await getUserReports(supabase, userId)

    if (!reports || reports.length === 0) {
        return (
            <div className="text-center py-8 text-slate-400">
                No reports found against this user.
            </div>
        )
    }

    return (
        <div className="rounded-md border border-slate-700">
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-800/50">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Reason</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-slate-400">Reporter</TableHead>
                        <TableHead className="text-slate-400">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {reports.map((report) => (
                        <TableRow key={report.id} className="border-slate-700 hover:bg-slate-800/50">
                            <TableCell className="text-slate-400 text-sm">
                                {format(new Date(report.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-slate-300 capitalize">
                                {report.reason_category}
                            </TableCell>
                            <TableCell>
                                <StatusBadge status={report.status} />
                            </TableCell>
                            <TableCell className="text-slate-300">
                                {report.reporter?.display_name || 'Unknown'}
                            </TableCell>
                            <TableCell>
                                <Link href={`/admin/reports/${report.id}`}>
                                    <Button size="sm" variant="ghost" className="hover:bg-slate-700">
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export { UserReportsList }
