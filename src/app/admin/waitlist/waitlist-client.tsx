'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Mail, ChevronLeft, ChevronRight, Smartphone } from 'lucide-react'
import { getWaitlistEntries } from '@/lib/waitlist-actions'

interface WaitlistEntry {
    id: string
    full_name: string
    email: string
    source: string
    phone_type: string | null
    created_at: string
}

interface WaitlistClientProps {
    initialEntries: WaitlistEntry[]
    initialTotal: number
}

export function WaitlistClient({ initialEntries, initialTotal }: WaitlistClientProps) {
    const [entries, setEntries] = useState<WaitlistEntry[]>(initialEntries)
    const [total, setTotal] = useState(initialTotal)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const pageSize = 50
    const totalPages = Math.ceil(total / pageSize)

    const goToPage = async (newPage: number) => {
        setLoading(true)
        const { entries: newEntries, total: newTotal } = await getWaitlistEntries(newPage, pageSize)
        setEntries(newEntries)
        setTotal(newTotal)
        setPage(newPage)
        setLoading(false)
    }

    const handleExportCSV = () => {
        const csv = [
            'Name,Email,Source,Phone,Signed Up',
            ...entries.map(e =>
                `"${e.full_name}","${e.email}","${e.source}","${e.phone_type || ''}","${new Date(e.created_at).toLocaleDateString()}"`
            )
        ].join('\n')

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `hanghut-waitlist-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    Showing {entries.length} of {total} entries
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCSV}
                    className="gap-2"
                >
                    <Download className="h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">#</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Name</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Email</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Source</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Phone</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Signed Up</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {entries.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-slate-400">
                                    <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No signups yet</p>
                                    <p className="text-sm">Waitlist entries will appear here.</p>
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry, i) => (
                                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-sm text-slate-400 font-mono">
                                        {(page - 1) * pageSize + i + 1}
                                    </td>
                                    <td className="py-3 px-4 text-sm font-medium text-slate-900">
                                        {entry.full_name}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-indigo-600">
                                        <a href={`mailto:${entry.email}`} className="hover:underline">
                                            {entry.email}
                                        </a>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">
                                            {entry.source}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        {entry.phone_type ? (
                                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-50 text-slate-700">
                                                {entry.phone_type === 'android' ? '🤖' : '🍎'}
                                                {entry.phone_type === 'android' ? 'Android' : 'iPhone'}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-500">
                                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-sm text-slate-500">
                        Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1 || loading}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages || loading}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
