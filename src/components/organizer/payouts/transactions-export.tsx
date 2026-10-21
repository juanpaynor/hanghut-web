'use client'

import { useState } from 'react'
import { DateRange } from 'react-day-picker'
import {
    endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { downloadBlob, filenameFromDisposition } from '@/lib/utils/download'
import { cn } from '@/lib/utils'
import {
    Check, Download, FileSpreadsheet, FileText, Loader2, Table2,
} from 'lucide-react'

type Format = 'csv' | 'xlsx' | 'pdf'

/**
 * Period presets.
 *
 * `table` means "whatever the page filter is set to", which is what the export
 * silently did before — and the reason an organizer who wanted last month had
 * to go and set a table filter correctly first. The periods are here now, next
 * to the formats, because that is where someone about to download a file is
 * looking.
 */
type Preset = 'table' | 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'all' | 'custom'

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

interface Props {
    /** The table's current filter, from the URL. Either may be absent. */
    tableFrom?: string
    tableTo?: string
    /** The table's current search term, carried so the file matches the table
     *  when the export is set to follow it. */
    search?: string
    /** Rows in the current filter — the Export button is pointless at zero. */
    count: number
}

export function TransactionsExport({ tableFrom, tableTo, search, count }: Props) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState<Format | null>(null)

    const hasTableFilter = !!(tableFrom || tableTo)
    const [preset, setPreset] = useState<Preset>(hasTableFilter ? 'table' : 'all')
    const [custom, setCustom] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: new Date(),
    })

    /**
     * The period actually being asked for.
     *
     * `to` falls back to `from` for the same reason the statements panel does
     * it: react-day-picker's range mode sets `{ from, to: undefined }` on the
     * first click of a new range, and treating that as "no end date" would
     * quietly export from that day to today. A lone date means that one day.
     */
    const resolvePeriod = (): { from?: string; to?: string } => {
        const now = new Date()
        switch (preset) {
            case 'table':
                return { from: tableFrom, to: tableTo }
            case 'this-month':
                return { from: ymd(startOfMonth(now)), to: ymd(now) }
            case 'last-month': {
                const m = subMonths(now, 1)
                return { from: ymd(startOfMonth(m)), to: ymd(endOfMonth(m)) }
            }
            case 'last-3':
                return { from: ymd(startOfMonth(subMonths(now, 2))), to: ymd(now) }
            case 'this-year':
                return { from: ymd(startOfYear(now)), to: ymd(endOfYear(now) < now ? endOfYear(now) : now) }
            case 'custom':
                return custom?.from
                    ? { from: ymd(custom.from), to: ymd(custom.to ?? custom.from) }
                    : {}
            case 'all':
            default:
                return {}
        }
    }

    const periodSummary = (): string => {
        const p = resolvePeriod()
        if (!p.from && !p.to) return 'All time'
        if (p.from && p.to) return p.from === p.to ? p.from : `${p.from} → ${p.to}`
        return p.from ? `${p.from} onwards` : `up to ${p.to}`
    }

    /**
     * Download one format.
     *
     * The spinner is tied to a fetch with an AbortController on a timer, not to
     * an open-ended promise. That matters: the previous export could leave its
     * button reading "Preparing…" with nothing to clear it, and a stuck spinner
     * on a financial export is indistinguishable from a lost one. Here the
     * timeout always fires, so the control always comes back.
     */
    const run = async (fmt: Format) => {
        const period = resolvePeriod()
        if (preset === 'custom' && !period.from) {
            toast({ title: 'Pick a date range first', variant: 'destructive' })
            return
        }

        setBusy(fmt)
        const abort = new AbortController()
        // Matches the route's maxDuration. Past this the server has given up
        // anyway, so waiting longer only hides that from the organizer.
        const timer = setTimeout(() => abort.abort(), 125_000)

        try {
            const qs = new URLSearchParams({ format: fmt })
            if (period.from) qs.set('from', period.from)
            if (period.to) qs.set('to', period.to)
            // The search only travels when the export is following the table.
            // Applied to a different period it would silently narrow a file the
            // organizer asked to cover everything.
            if (preset === 'table' && search) qs.set('q', search)

            const res = await fetch(`/api/organizer/transactions/export?${qs}`, {
                signal: abort.signal,
                cache: 'no-store',
            })

            if (!res.ok) {
                const msg = await res.json().then(j => j?.error).catch(() => null)
                toast({
                    title: 'Export failed',
                    description: msg || `The server returned ${res.status}.`,
                    variant: 'destructive',
                })
                return
            }

            const blob = await res.blob()
            // Keep the server's filename: it already carries the date range, so
            // two exports for different periods don't land in Downloads as
            // "(1)" and "(2)".
            const name = filenameFromDisposition(res.headers.get('Content-Disposition'))
            downloadBlob(blob, name || `transactions.${fmt}`)

            const rows = Number(res.headers.get('X-Export-Rows')) || 0
            const truncated = res.headers.get('X-Export-Truncated') === '1'
            toast({
                title: truncated ? 'Export truncated' : 'Export ready',
                description: truncated
                    ? `Only the first ${rows.toLocaleString()} transactions were included. Narrow the date range to get the rest.`
                    : `${rows.toLocaleString()} transaction${rows === 1 ? '' : 's'} · ${periodSummary()}`,
                variant: truncated ? 'destructive' : undefined,
            })
            setOpen(false)
        } catch (e) {
            const aborted = (e as Error)?.name === 'AbortError'
            console.error('Transaction export failed:', e)
            toast({
                title: aborted ? 'Export timed out' : 'Export failed',
                description: aborted
                    ? 'That period is too large to build in one go. Try a shorter date range.'
                    : 'Something went wrong building the file.',
                variant: 'destructive',
            })
        } finally {
            clearTimeout(timer)
            setBusy(null)
        }
    }

    const presets: { id: Preset; label: string }[] = [
        ...(hasTableFilter ? [{ id: 'table' as Preset, label: 'Match the table' }] : []),
        { id: 'this-month', label: 'This month' },
        { id: 'last-month', label: 'Last month' },
        { id: 'last-3', label: 'Last 3 months' },
        { id: 'this-year', label: 'This year' },
        { id: 'all', label: 'All time' },
        { id: 'custom', label: 'Custom range' },
    ]

    const formats: { id: Format; label: string; hint: string; icon: typeof FileText }[] = [
        { id: 'csv', label: 'CSV', hint: 'Every row, for a spreadsheet or your accountant', icon: Table2 },
        { id: 'xlsx', label: 'Excel', hint: 'Workbook with a summary sheet and real numbers', icon: FileSpreadsheet },
        { id: 'pdf', label: 'PDF', hint: 'Printable report with totals and a per-event breakdown', icon: FileText },
    ]

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    size="sm"
                    disabled={count === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-[340px] p-0">
                <div className="p-4 space-y-3">
                    <div>
                        <p className="text-sm font-semibold">Period</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{periodSummary()}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {presets.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setPreset(p.id)}
                                className={cn(
                                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                                    preset === p.id
                                        ? 'bg-foreground text-background border-foreground'
                                        : 'border-border hover:bg-muted',
                                )}
                            >
                                {preset === p.id && <Check className="w-3 h-3 mr-1 inline-block -mt-0.5" />}
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {preset === 'custom' && (
                        <DatePickerWithRange
                            date={custom}
                            setDate={setCustom}
                            className="[&_button]:w-full"
                        />
                    )}

                    {preset === 'table' && search && (
                        <p className="text-xs text-muted-foreground">
                            Also filtered by “{search}”, matching the table.
                        </p>
                    )}
                </div>

                <Separator />

                <div className="p-2">
                    {formats.map(f => {
                        const Icon = f.icon
                        const isBusy = busy === f.id
                        return (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => run(f.id)}
                                disabled={busy !== null}
                                className="w-full text-left flex items-start gap-3 p-2.5 rounded-md hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent transition-colors"
                            >
                                <span className="mt-0.5 shrink-0">
                                    {isBusy
                                        ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                        : <Icon className="w-4 h-4 text-muted-foreground" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">
                                        {isBusy ? `Building ${f.label}…` : f.label}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">{f.hint}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </PopoverContent>
        </Popover>
    )
}
