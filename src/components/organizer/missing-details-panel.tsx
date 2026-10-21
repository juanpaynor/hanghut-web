'use client'
import { downloadBlob } from '@/lib/utils/download'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import {
    AlertTriangle, CheckCircle2, ClipboardList, Copy, Check, Download, Loader2,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Mail, Search,
} from 'lucide-react'
import {
    getEventMissingDetails, sendAttendeeDetailEmails,
    type MissingDetailsReport, type MissingDetailBuyer, type MissingDetailSlot,
    type SendDetailsResult, type SendSkipReason,
} from '@/lib/organizer/attendee-details-actions'
import { cn } from '@/lib/utils'

/**
 * "Attendees missing their details" — who they are, and how to reach them.
 *
 * An order used to collect ONE answer set however many tickets it bought, so a
 * group purchase left the organizer with one shirt size and one emergency
 * contact for several different people. This is the surface that makes that
 * visible and actionable without anyone having to query the database.
 *
 * Built for the big case, not the small one. On Back to the Garden this is 519
 * missing slots across 182 buyers, so the list PAGES (server-side — the whole
 * set is 100 kB of buyer emails and live editing tokens, which has no business
 * being shipped to a browser on every tab open) and the headline count stays
 * whole-event while you page and search. Sinadya's 3 buyers hid all of that,
 * which is why this got built the naive way first.
 */

/** Keep the list out of the way when it is long, but not when it is short:
 *  nobody should click twice to see three rows. */
const AUTO_OPEN_UP_TO = 10
/** Matches claim_attendee_detail_emails' default. Only used for the label. */
const COOLDOWN_HOURS = 24
/** Fallback only. The RPC owns the page size and echoes it back as `limit`,
 *  which is what the pager actually uses — this covers the first render. */
const PAGE_SIZE_FALLBACK = 25

/** What to tell the organizer about each slot, which is not always "missing". */
function slotNote(s: MissingDetailSlot): { tone: 'warn' | 'bad' | 'ok'; text: string } {
    if (s.complete) return { tone: 'ok', text: 'On file' }
    switch (s.answer_source) {
        case 'rewritten':
            return { tone: 'bad', text: 'Answers were overwritten by a later booking — may describe someone else' }
        case 'shared':
            return { tone: 'bad', text: 'One answer set covers several tickets — cannot tell whose' }
        default:
            return { tone: 'warn', text: `${s.missing_count} question${s.missing_count === 1 ? '' : 's'} not answered` }
    }
}

const SKIP_LABEL: Record<SendSkipReason, string> = {
    bounced: 'their email bounced before',
    cooldown: `already emailed in the last ${COOLDOWN_HOURS} hours`,
    no_link: 'sold at the door, so there is no link',
}

function agoLabel(iso: string): string {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
}

function withinCooldown(iso: string | null): boolean {
    if (!iso) return false
    return Date.now() - new Date(iso).getTime() < COOLDOWN_HOURS * 3600_000
}

export function MissingDetailsPanel({ eventId }: { eventId: string }) {
    const { toast } = useToast()
    const [report, setReport] = useState<MissingDetailsReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [paging, setPaging] = useState(false)
    const [listOpen, setListOpen] = useState(false)
    const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
    const [copied, setCopied] = useState<string | null>(null)
    const [offset, setOffset] = useState(0)
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [sendingAll, setSendingAll] = useState(false)
    const [sendingOne, setSendingOne] = useState<string | null>(null)
    const [preview, setPreview] = useState<SendDetailsResult | null>(null)
    const [previewing, setPreviewing] = useState(false)
    /** First load decides whether the list starts open; later loads must not
     *  slam it shut under the organizer as they page or search. */
    const decidedOpen = useRef(false)

    const load = useCallback(async (nextOffset: number, nextQuery: string, initial = false) => {
        if (initial) setLoading(true); else setPaging(true)
        const r = await getEventMissingDetails(eventId, {
            offset: nextOffset,
            search: nextQuery || null,
        })
        setReport(r)
        if (!decidedOpen.current && !r.error) {
            decidedOpen.current = true
            setListOpen((r.buyers_total ?? 0) <= AUTO_OPEN_UP_TO)
        }
        setLoading(false); setPaging(false)
    }, [eventId])

    useEffect(() => { void load(0, '', true) }, [load])

    // Debounce the search box so typing does not fire a scan per keystroke.
    useEffect(() => {
        const t = setTimeout(() => {
            if (search === query) return
            setQuery(search)
            setOffset(0)
            void load(0, search)
        }, 350)
        return () => clearTimeout(t)
    }, [search, query, load])

    const goto = (next: number) => { setOffset(next); void load(next, query) }

    const linkFor = (b: MissingDetailBuyer) =>
        b.token ? `${window.location.origin}/d/${b.token}` : null

    const copyLink = async (b: MissingDetailBuyer) => {
        const url = linkFor(b)
        if (!url) return
        try {
            await navigator.clipboard.writeText(url)
            setCopied(b.email)
            setTimeout(() => setCopied(null), 2500)
        } catch {
            // Clipboard is blocked outside a secure context and in some in-app
            // browsers. Show it so it can still be copied by hand.
            toast({ title: 'Copy this link', description: url })
        }
    }

    /** Turn a send result into one sentence the organizer can act on. */
    const reportSend = (res: SendDetailsResult, scope: string) => {
        if (res.error) {
            toast({ title: 'Could not send', description: res.error, variant: 'destructive' })
            return
        }
        const bits: string[] = []
        for (const reason of ['bounced', 'cooldown', 'no_link'] as SendSkipReason[]) {
            const n = (res.skipped ?? []).filter(s => s.reason === reason).length
            if (n) bits.push(`${n} skipped — ${SKIP_LABEL[reason]}`)
        }
        if (res.failed) bits.push(`${res.failed} failed to send — you can retry now`)
        toast({
            title: res.sent ? `Sent to ${res.sent} ${scope}` : 'Nothing sent',
            description: res.warning === 'ledger_not_updated'
                ? 'The emails went out, but we could not record them — do not resend.'
                : (bits.join(' · ') || undefined),
        })
        void load(offset, query)
    }

    const openSendAll = async () => {
        setPreviewing(true)
        const res = await sendAttendeeDetailEmails(eventId, undefined, true)
        setPreviewing(false)
        if (res.error) {
            toast({ title: 'Could not send', description: res.error, variant: 'destructive' })
            return
        }
        setPreview(res)
    }

    const confirmSendAll = async () => {
        setPreview(null)
        setSendingAll(true)
        const res = await sendAttendeeDetailEmails(eventId)
        setSendingAll(false)
        reportSend(res, 'buyers')
    }

    const sendOne = async (b: MissingDetailBuyer) => {
        setSendingOne(b.email)
        const res = await sendAttendeeDetailEmails(eventId, [b.email])
        setSendingOne(null)
        reportSend(res, b.email)
    }

    const downloadCsv = () => {
        if (!report?.buyers?.length) return
        const esc = (v: unknown) => {
            const s = String(v ?? '')
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }
        const rows = [['buyer_email', 'buyer_name', 'attendees_missing', 'attendees_total', 'last_emailed', 'link'].join(',')]
        for (const b of report.buyers) {
            rows.push([
                esc(b.email), esc(b.name), b.slots_missing, b.slots_total,
                esc(b.last_emailed_at ?? ''),
                esc(linkFor(b) ?? 'no link — box office or offline sale'),
            ].join(','))
        }
        downloadBlob(
            new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
            `missing-attendee-details-${eventId.slice(0, 8)}.csv`,
        )
    }

    if (loading) {
        return (
            <Card className="border-border/60">
                <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking attendee details…
                </CardContent>
            </Card>
        )
    }

    // Not an error worth shouting about: an event with no questions has nothing
    // to be missing, and a non-owner simply does not see this panel.
    if (!report || report.error) return null

    const missing = report.missing_total ?? 0

    if (missing === 0) {
        return (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
                <CardContent className="flex items-center gap-3 py-5 text-sm">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span>
                        Every attendee has their own details on file
                        {report.tickets_total ? ` — all ${report.tickets_total} tickets.` : '.'}
                    </span>
                </CardContent>
            </Card>
        )
    }

    const buyersTotal = report.buyers_total ?? 0
    const matched = report.buyers_matched ?? buyersTotal
    const pageSize = report.limit ?? PAGE_SIZE_FALLBACK
    const from = matched === 0 ? 0 : offset + 1
    const to = Math.min(offset + pageSize, matched)
    const showSearch = buyersTotal > pageSize
    const previewSkips = preview?.skipped ?? []

    return (
        <>
            <Card className="border-amber-200 dark:border-amber-900">
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                                {missing} attendee{missing === 1 ? '' : 's'} missing their details
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Across {buyersTotal} booking{buyersTotal === 1 ? '' : 's'}
                                {report.tickets_total ? ` of ${report.tickets_total} tickets` : ''}. Each
                                buyer gets one link that covers everyone they bought for.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={openSendAll} disabled={previewing || sendingAll}>
                                {previewing || sendingAll
                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    : <Mail className="mr-2 h-4 w-4" />}
                                {sendingAll ? 'Sending…' : 'Email everyone'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={downloadCsv}>
                                <Download className="mr-2 h-4 w-4" />
                                Export page
                            </Button>
                        </div>
                    </div>

                    {!!report.no_link_total && (
                        <p className="mt-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                            {report.no_link_total} of these were sold at the door or offline, so they have no
                            buyer link. Those details have to be collected in person.
                        </p>
                    )}
                </CardHeader>

                <CardContent className="space-y-3">
                    <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm font-medium hover:bg-muted/40"
                        onClick={() => setListOpen(o => !o)}
                        aria-expanded={listOpen}
                    >
                        <span>
                            {listOpen ? 'Hide' : 'Show'} the {buyersTotal} booking{buyersTotal === 1 ? '' : 's'}
                        </span>
                        {listOpen
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {listOpen && (
                        <>
                            {showSearch && (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="pl-9"
                                        placeholder="Search by name or email…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            )}

                            {paging && (
                                <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                                </div>
                            )}

                            {matched === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">
                                    No bookings match “{query}”.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {report.buyers?.map(b => {
                                        const isOpen = openRows[b.email]
                                        const url = linkFor(b)
                                        const cooling = withinCooldown(b.last_emailed_at)
                                        return (
                                            <div key={b.email} className="rounded-lg border">
                                                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                                                    <button
                                                        type="button"
                                                        className="flex min-w-0 items-center gap-2 text-left"
                                                        onClick={() => setOpenRows(p => ({ ...p, [b.email]: !p[b.email] }))}
                                                        aria-expanded={isOpen}
                                                    >
                                                        {isOpen
                                                            ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                            : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium">{b.email}</span>
                                                            <span className="block text-xs text-muted-foreground">
                                                                {b.name ? `${b.name} · ` : ''}
                                                                {b.slots_missing} of {b.slots_total} attendee
                                                                {b.slots_total === 1 ? '' : 's'} missing
                                                                {b.last_emailed_at && ` · emailed ${agoLabel(b.last_emailed_at)}`}
                                                            </span>
                                                        </span>
                                                    </button>

                                                    <div className="flex shrink-0 items-center gap-2">
                                                        {/* Suspect answers look complete and may name the
                                                            wrong person, so they are called out on the row
                                                            rather than only inside it. */}
                                                        {b.slots_suspect > 0 && (
                                                            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                                                                {b.slots_suspect} to check
                                                            </Badge>
                                                        )}
                                                        {url ? (
                                                            <>
                                                                <Button
                                                                    variant="outline" size="sm"
                                                                    onClick={() => sendOne(b)}
                                                                    disabled={sendingOne === b.email || cooling}
                                                                    title={cooling
                                                                        ? `Already emailed ${agoLabel(b.last_emailed_at!)} — you can send again after ${COOLDOWN_HOURS}h`
                                                                        : 'Email this buyer their link'}
                                                                >
                                                                    {sendingOne === b.email
                                                                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                        : <Mail className="mr-2 h-4 w-4" />}
                                                                    {cooling ? 'Sent' : 'Send'}
                                                                </Button>
                                                                <Button variant="outline" size="sm" onClick={() => copyLink(b)}>
                                                                    {copied === b.email
                                                                        ? <><Check className="mr-2 h-4 w-4" />Copied</>
                                                                        : <><Copy className="mr-2 h-4 w-4" />Copy</>}
                                                                </Button>
                                                                <Button variant="ghost" size="sm" asChild>
                                                                    <a href={url} target="_blank" rel="noopener noreferrer">
                                                                        <ExternalLink className="h-4 w-4" />
                                                                        <span className="sr-only">Open their form</span>
                                                                    </a>
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Badge variant="secondary">Sold offline — no link</Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                {isOpen && (
                                                    <div className="border-t bg-muted/20 p-3">
                                                        <ul className="space-y-2">
                                                            {b.tickets.map(s => {
                                                                const note = slotNote(s)
                                                                return (
                                                                    <li key={s.ticket_number} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                                                                        {s.complete
                                                                            ? <CheckCircle2 className="h-4 w-4 shrink-0 translate-y-0.5 text-emerald-600" />
                                                                            : <ClipboardList className="h-4 w-4 shrink-0 translate-y-0.5 text-amber-600" />}
                                                                        <span className="font-medium">{s.attendee_name || 'Unnamed attendee'}</span>
                                                                        <span className="text-xs text-muted-foreground">{s.ticket_number}</span>
                                                                        <span className={cn(
                                                                            'text-xs',
                                                                            note.tone === 'bad' && 'text-amber-800 dark:text-amber-300',
                                                                            note.tone === 'warn' && 'text-muted-foreground',
                                                                            note.tone === 'ok' && 'text-emerald-700 dark:text-emerald-400',
                                                                        )}>
                                                                            {note.text}
                                                                        </span>
                                                                    </li>
                                                                )
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {matched > pageSize && (
                                <div className="flex items-center justify-between gap-3 pt-1">
                                    <span className="text-xs text-muted-foreground">
                                        {from}–{to} of {matched}
                                        {query && ` matching “${query}”`}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => goto(Math.max(offset - pageSize, 0))}
                                            disabled={offset === 0 || paging}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            <span className="sr-only">Previous page</span>
                                        </Button>
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => goto(offset + pageSize)}
                                            disabled={to >= matched || paging}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                            <span className="sr-only">Next page</span>
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* The confirm exists for the SKIP LIST, not for the "are you sure".
                An organizer who sends and then hears nothing from four people
                needs to know those four were never reachable, or they will
                assume it landed. */}
            <AlertDialog open={!!preview} onOpenChange={o => { if (!o) setPreview(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {preview?.would_send
                                ? `Email ${preview.would_send} buyer${preview.would_send === 1 ? '' : 's'}?`
                                : 'Nobody to email'}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                {preview?.would_send ? (
                                    <p>
                                        They&apos;ll each get a private link to fill in details for
                                        everyone on their booking. It is sent in your name, and replies
                                        come to you.
                                    </p>
                                ) : (
                                    <p>Every buyer who owes details has either been emailed recently or cannot be reached.</p>
                                )}
                                {previewSkips.length > 0 && (
                                    <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
                                        {(['bounced', 'cooldown', 'no_link'] as SendSkipReason[]).map(reason => {
                                            const n = previewSkips.filter(s => s.reason === reason).length
                                            if (!n) return null
                                            return (
                                                <li key={reason}>
                                                    <span className="font-medium">{n} skipped</span> — {SKIP_LABEL[reason]}
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        {!!preview?.would_send && (
                            <AlertDialogAction onClick={confirmSendAll}>
                                Send {preview.would_send}
                            </AlertDialogAction>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
