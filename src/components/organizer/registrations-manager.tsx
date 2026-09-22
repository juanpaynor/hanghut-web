'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Check, X, Clock, Users, ChevronDown, ChevronUp, Loader2, RefreshCw, Download, Search, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { formatInManila } from '@/lib/datetime'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    approveRegistration,
    rejectRegistration,
    getEventRegistrations,
    exportEventRegistrationsCsv,
    getEventResponsesExport,
    getEventAnswerStats,
    EventRegistration,
    RegistrationsPage,
    RegistrationQuestion,
    RegistrationStatusGroup,
    AnswerStats,
} from '@/lib/organizer/registration-management-actions'
import { AnswerInsights } from '@/components/organizer/answer-insights'
import { RegistrationFileLink, collectFilePaths, parseFileAnswerClient } from '@/components/organizer/registration-file-link'
import { getRegistrationFileUrls } from '@/lib/events/registration-upload-actions'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface Props {
    eventId: string
    eventTitle?: string
    initialPage: RegistrationsPage
    initialStats?: AnswerStats | null
    /** Approval-gated event: show the pending/approved/rejected queue. Off = a
     *  flat list of responses (auto-approve has nothing to review). */
    approvalMode?: boolean
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    auto_approved: { label: 'Auto-approved', variant: 'outline' },
    cancelled: { label: 'Cancelled', variant: 'outline' },
}

function RegistrationCard({
    reg,
    eventId,
    labelFor,
    fileUrls,
    onUpdate,
}: {
    reg: EventRegistration
    eventId: string
    /** Answers arrive keyed by question id; the label lives in one shared list. */
    labelFor: (questionId: string) => string
    /** Signed URLs for this page's uploads, keyed by storage path. */
    fileUrls: Record<string, string>
    onUpdate: (id: string, newStatus: string) => void
}) {
    const { toast } = useToast()
    const [expanded, setExpanded] = useState(false)
    const [showReject, setShowReject] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [isPending, startTransition] = useTransition()

    const name = reg.user?.full_name || reg.guest_name || 'Unknown'
    const email = reg.user?.email || reg.guest_email || '—'
    const badge = STATUS_BADGE[reg.status] || { label: reg.status, variant: 'outline' as const }

    const handleApprove = () => {
        startTransition(async () => {
            const result = await approveRegistration(reg.id, eventId)
            if (result.success) {
                toast({ title: 'Approved', description: `${name}'s registration has been approved.` })
                onUpdate(reg.id, 'approved')
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const handleReject = () => {
        startTransition(async () => {
            const result = await rejectRegistration(reg.id, eventId, rejectReason)
            if (result.success) {
                toast({ title: 'Rejected', description: `${name}'s registration has been rejected.` })
                onUpdate(reg.id, 'rejected')
                setShowReject(false)
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    return (
        <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{name}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {reg.tier && (
                            <Badge variant="outline" className="text-xs">{reg.tier.name}</Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted {new Date(reg.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit'
                        })}
                    </p>
                </div>

                {reg.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500 text-green-600 hover:bg-green-50"
                            onClick={handleApprove}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span className="ml-1">Approve</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-red-400 text-red-500 hover:bg-red-50"
                            onClick={() => setShowReject(v => !v)}
                            disabled={isPending}
                        >
                            <X className="h-3.5 w-3.5" />
                            <span className="ml-1">Reject</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Reject form */}
            {showReject && reg.status === 'pending' && (
                <div className="space-y-2 border-t pt-3">
                    <Textarea
                        placeholder="Reason for rejection (optional — will be shown to the user)"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        rows={2}
                        className="text-sm"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={handleReject} disabled={isPending}>
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Confirm Rejection
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Rejection reason display */}
            {reg.status === 'rejected' && reg.rejection_reason && (
                <p className="text-xs text-red-500 border-t pt-2">Reason: {reg.rejection_reason}</p>
            )}

            {/* Answers */}
            {reg.answers.length > 0 && (
                <div className="border-t pt-2">
                    <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setExpanded(v => !v)}
                    >
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {expanded ? 'Hide' : 'Show'} {reg.answers.length} answer{reg.answers.length !== 1 ? 's' : ''}
                    </button>

                    {expanded && (
                        <div className="mt-2 space-y-2">
                            {reg.answers.map((a, i) => {
                                // A file answer is a JSON record of an upload, not text —
                                // printing it raw would show a storage path.
                                const isFile = typeof a.answer === 'string'
                                    && a.answer.trim().startsWith('{')
                                    && a.answer.includes('"path"')
                                const filePath = isFile ? parseFileAnswerClient(a.answer)?.path : undefined
                                return (
                                    <div key={i} className="bg-muted/50 rounded p-2">
                                        <p className="text-xs font-medium text-muted-foreground">{labelFor(a.question_id)}</p>
                                        {isFile ? (
                                            <RegistrationFileLink
                                                eventId={reg.event_id}
                                                raw={a.answer}
                                                url={filePath ? fileUrls[filePath] : undefined}
                                            />
                                        ) : (
                                            <p className="text-sm mt-0.5">
                                                {Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer ?? '—')}
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
}

export function RegistrationsManager({ eventId, eventTitle, initialPage, initialStats = null, approvalMode = true }: Props) {
    const { toast } = useToast()
    const [data, setData] = useState<RegistrationsPage>(initialPage)
    const [statusGroup, setStatusGroup] = useState<RegistrationStatusGroup | undefined>(
        approvalMode ? 'pending' : undefined
    )
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
    const [stats, setStats] = useState<AnswerStats | null>(initialStats)
    // Signed URLs for the uploads on the CURRENT page only. They expire, so
    // they are fetched per page rather than held for the whole event.
    const [fileUrls, setFileUrls] = useState<Record<string, string>>({})

    useEffect(() => {
        const paths = collectFilePaths(data.registrations)
        if (!paths.length) { setFileUrls({}); return }
        let cancelled = false
        getRegistrationFileUrls(eventId, paths).then(urls => {
            if (!cancelled) setFileUrls(urls)
        })
        return () => { cancelled = true }
    }, [data.registrations, eventId])

    // Stats are whole-event totals, so they do NOT move when the reader pages
    // or searches — only when the underlying answers change.
    const refreshStats = useCallback(async () => {
        setStats(await getEventAnswerStats(eventId))
    }, [eventId])

    // Labels travel once per response, not once per answer, so the card looks
    // them up here instead of carrying a copy on every row.
    const labelFor = useCallback(
        (questionId: string) =>
            data.questions.find(q => q.id === questionId)?.label ?? 'Unknown question',
        [data.questions]
    )

    const load = useCallback(
        async (opts: { page?: number; statusGroup?: RegistrationStatusGroup; search?: string }) => {
            setLoading(true)
            try {
                const next = await getEventRegistrations(eventId, {
                    page: opts.page ?? page,
                    statusGroup: opts.statusGroup !== undefined ? opts.statusGroup : statusGroup,
                    search: opts.search !== undefined ? opts.search : search,
                })
                setData(next)
            } finally {
                setLoading(false)
            }
        },
        [eventId, page, statusGroup, search]
    )

    // Debounced server-side search. Filtering in the browser would mean fetching
    // every registration first, which is the thing this page stopped doing.
    useEffect(() => {
        if (search === '' && page === 1 && data === initialPage) return
        const t = setTimeout(() => {
            setPage(1)
            void load({ page: 1, search })
        }, 250)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    const goToPage = (p: number) => {
        setPage(p)
        void load({ page: p })
    }

    const switchTab = (group: RegistrationStatusGroup) => {
        setStatusGroup(group)
        setPage(1)
        void load({ page: 1, statusGroup: group })
    }

    const handleRefresh = () => void load({})

    // An approve/reject changes which tab a row belongs to, so refetch rather
    // than patching it in place and leaving the counts stale.
    const handleUpdate = (_id: string, _newStatus: string) => {
        void load({})
        void refreshStats()
    }

    const exportCsv = async () => {
        setExporting('csv')
        try {
            const res = await exportEventRegistrationsCsv(eventId)
            if (res.error || !res.csv) {
                toast({ title: 'Export failed', description: res.error, variant: 'destructive' })
                return
            }
            const blob = new Blob(['\uFEFF' + res.csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = res.filename || `${(eventTitle || 'event')}-registrations.csv`
            a.click()
            URL.revokeObjectURL(url)
        } finally {
            setExporting(null)
        }
    }

    /**
     * Responses as a printable PDF.
     *
     * Landscape, because a registration form with six questions has no chance
     * of fitting portrait — and autoTable wraps rather than truncates, so a long
     * answer costs height instead of being silently cut off. That matters when
     * the sheet is being carried to a start line to hand out shirts.
     */
    const exportPdf = async () => {
        setExporting('pdf')
        try {
            const res = await getEventResponsesExport(eventId)
            if (res.error || !res.bundle) {
                toast({ title: 'Export failed', description: res.error, variant: 'destructive' })
                return
            }
            const b = res.bundle

            const doc = new jsPDF({ orientation: 'landscape' })
            const pageWidth = doc.internal.pageSize.getWidth()

            doc.setFontSize(16)
            doc.text(b.title, 14, 16)

            doc.setFontSize(9)
            doc.setTextColor(110)
            const meta = [
                b.startsAt ? formatInManila(b.startsAt, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                }) : null,
                b.venue,
                `${b.rows.length} response${b.rows.length === 1 ? '' : 's'}`,
            ].filter(Boolean).join('  ·  ')
            doc.text(meta, 14, 22)
            doc.setTextColor(0)

            autoTable(doc, {
                head: [['Name', 'Email', 'Ticket', 'Status', ...b.questions.map(q => q.label)]],
                body: b.rows.map(r => [r.name, r.email, r.ticket, r.status, ...r.answers]),
                startY: 27,
                theme: 'striped',
                headStyles: { fillColor: [66, 66, 66] },
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                // Identity columns stay narrow so the answers get the room.
                columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 44 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 } },
                // A roster gets carried around and pages get separated.
                didDrawPage: (d) => {
                    const page = doc.getNumberOfPages()
                    doc.setFontSize(8)
                    doc.setTextColor(130)
                    doc.text(
                        `${b.title} — page ${page}`,
                        pageWidth - 14,
                        doc.internal.pageSize.getHeight() - 8,
                        { align: 'right' }
                    )
                    doc.setTextColor(0)
                    void d
                },
            })

            doc.save(`${(eventTitle || 'event').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-responses.pdf`)
            toast({
                title: 'PDF ready',
                description: `${b.rows.length} response${b.rows.length === 1 ? '' : 's'} exported.`,
            })
        } catch {
            toast({ title: 'Export failed', description: 'Could not build the PDF.', variant: 'destructive' })
        } finally {
            setExporting(null)
        }
    }

    const { counts, questions, registrations } = data

    const exportButton = (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!!exporting} className="gap-1.5">
                {exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!!exporting} className="gap-1.5">
                {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                PDF
            </Button>
        </div>
    )

    const refreshButton = (
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
        </Button>
    )

    // Local state, not URL params: the shared SearchInput/PaginationControls
    // push to the router, and this manager sits inside a <Tabs> on the event
    // page where a URL change would snap the user back to the first tab.
    const searchBox = (
        <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="pl-8 h-9 text-sm"
            />
        </div>
    )

    const list = (
        <>
            {registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                    {search ? `No responses match “${search}”.` : 'Nothing here yet.'}
                </p>
            ) : (
                <div className="space-y-3">
                    {registrations.map(reg => (
                        <RegistrationCard
                            key={reg.id}
                            reg={reg}
                            eventId={eventId}
                            labelFor={labelFor}
                            fileUrls={fileUrls}
                            onUpdate={handleUpdate}
                        />
                    ))}
                </div>
            )}
            {data.total_pages > 1 && (
                <div className="flex items-center justify-between gap-3 pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                        Page {data.page} of {data.total_pages}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={data.page <= 1 || loading}
                            onClick={() => goToPage(data.page - 1)}
                        >
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={data.page >= data.total_pages || loading}
                            onClick={() => goToPage(data.page + 1)}
                        >
                            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </>
    )

    if (counts.total === 0 && !search) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Users className="h-10 w-10 mb-3 opacity-40" />
                <p className="font-semibold text-foreground">No registrations yet</p>
                <p className="text-sm mt-1 max-w-xs">
                    {approvalMode
                        ? "Once people submit registration requests for this event, they'll appear here."
                        : "Once people register for this event, their answers will appear here."}
                </p>
            </div>
        )
    }

    // Auto-approve: nothing to review, so no queue — one list, newest first,
    // with the answers expandable on each card.
    if (!approvalMode) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted border rounded-lg text-sm">
                        <Users className="h-4 w-4" />
                        <span><strong>{counts.total}</strong> {counts.total === 1 ? 'response' : 'responses'}</span>
                    </div>
                    {searchBox}
                    <div className="ml-auto flex items-center gap-2">
                        {exportButton}
                        {refreshButton}
                    </div>
                </div>
                <AnswerInsights eventId={eventId} stats={stats} onRefresh={refreshStats} />
                {list}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <Clock className="h-4 w-4" />
                    <span><strong>{counts.pending}</strong> pending</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    <span><strong>{counts.approved}</strong> approved</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    <X className="h-4 w-4" />
                    <span><strong>{counts.rejected}</strong> rejected</span>
                </div>
                {searchBox}
                <div className="ml-auto flex items-center gap-2">
                    {exportButton}
                    {refreshButton}
                </div>
            </div>

            <AnswerInsights eventId={eventId} stats={stats} onRefresh={refreshStats} />

            <Tabs value={statusGroup} onValueChange={v => switchTab(v as RegistrationStatusGroup)}>
                <TabsList>
                    <TabsTrigger value="pending">
                        Pending {counts.pending > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{counts.pending}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="approved">Approved</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>

                <TabsContent value={statusGroup ?? 'pending'} className="mt-4 space-y-3">
                    {list}
                </TabsContent>
            </Tabs>
        </div>
    )
}
