'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DateRange } from 'react-day-picker'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle, Download, FileText, Loader2, Receipt } from 'lucide-react'
import { getPayoutStatement, getPayoutAdvice, type StatementBundle } from '@/lib/organizer/payout-statement-actions'

/**
 * The statement surface: pick a period, see what it says, then download it.
 *
 * It is deliberately NOT the Transactions tab's export. That export is a row
 * dump bound to whatever filter happens to be on the table, which is the wrong
 * shape for reconciling a month — an organizer should not have to set a table
 * filter correctly in order for a financial document to cover the right dates.
 *
 * The figures are shown on screen before the download, from the same bundle the
 * PDF is built from. So the page and the document cannot disagree, and nobody
 * downloads a file to find out it was empty.
 */

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const peso = (n: number) =>
    `₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The last six whole months, newest first — the usual reconciliation units. */
function recentMonths(count = 6) {
    const now = new Date()
    return Array.from({ length: count }, (_, i) => {
        const d = subMonths(now, i + 1)
        return { label: format(d, 'MMM yyyy'), from: startOfMonth(d), to: endOfMonth(d) }
    })
}

export function StatementsPanel() {
    const { toast } = useToast()
    const months = recentMonths()

    const [range, setRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: new Date(),
    })
    const [bundle, setBundle] = useState<StatementBundle | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [adviceFor, setAdviceFor] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    /** The period already fetched, so re-picking the same dates is not a refetch. */
    const loadedKey = useRef<string | null>(null)

    /**
     * The period actually being asked for.
     *
     * `to` falls back to `from` because react-day-picker's range mode sets
     * `{ from, to: undefined }` on the first click of a new range. Gating the
     * button on `range.to` meant one click in the calendar left it disabled
     * with nothing on screen to say why — press it and nothing happened.
     * A lone date now means that single day.
     */
    const periodFrom = range?.from ? ymd(range.from) : null
    const periodTo = range?.to ? ymd(range.to) : periodFrom

    const load = useCallback(async (from: string, to: string) => {
        const key = `${from}:${to}`
        loadedKey.current = key
        setLoading(true)
        setError(null)
        try {
            const res = await getPayoutStatement({ from, to })

            // Drop a response that is no longer the period on screen. Switching
            // months quickly starts two fetches, and the slower one landing last
            // would leave the picker showing one period and the figures — and
            // then the downloaded PDF — holding another.
            if (loadedKey.current !== key) return

            if (res.error || !res.bundle) {
                setBundle(null)
                setError(res.error || 'Could not build the statement.')
                return
            }
            setBundle(res.bundle)
        } catch (e) {
            console.error('Statement preview failed:', e)
            if (loadedKey.current !== key) return
            setBundle(null)
            setError('Something went wrong loading this period.')
        } finally {
            if (loadedKey.current === key) setLoading(false)
        }
    }, [])

    /**
     * Load whenever the chosen period changes, including on mount — so picking
     * dates is the whole interaction and the button is only ever a re-fetch.
     * Guarded on a COMPLETE range so a half-picked one does not briefly load a
     * single-day statement between the two calendar clicks.
     */
    useEffect(() => {
        if (!periodFrom || !periodTo || !range?.to) return
        if (loadedKey.current === `${periodFrom}:${periodTo}`) return
        void load(periodFrom, periodTo)
    }, [periodFrom, periodTo, range?.to, load])

    const pickMonth = (from: Date, to: Date) => setRange({ from, to })

    const handleDownload = async () => {
        if (!bundle) return
        setSaving(true)
        try {
            // ~300KB of jsPDF, fetched on use so it stays out of the page load.
            const { buildStatementPdf, statementFilename } = await import('./statement-pdf')
            buildStatementPdf(bundle).save(statementFilename(bundle))
        } catch (e) {
            console.error('Statement download failed:', e)
            toast({ title: 'Download failed', description: 'Could not build the document.', variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    const handleAdvice = async (payoutId: string) => {
        setAdviceFor(payoutId)
        try {
            const res = await getPayoutAdvice(payoutId)
            if (res.error || !res.bundle) {
                toast({ title: 'Could not build the advice', description: res.error || 'Please try again.', variant: 'destructive' })
                return
            }
            const { buildAdvicePdf, adviceFilename } = await import('./statement-pdf')
            buildAdvicePdf(res.bundle).save(adviceFilename(res.bundle))
        } catch (e) {
            console.error('Advice download failed:', e)
            toast({ title: 'Download failed', description: 'Could not build the document.', variant: 'destructive' })
        } finally {
            setAdviceFor(null)
        }
    }

    const c = bundle?.combined

    return (
        <div className="space-y-6">
            {/* ── Period ─────────────────────────────────────────────── */}
            <Card className="border-border/50">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold">Statement period</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Pick a month, or set your own dates. Figures update below before you download.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline" size="sm"
                            onClick={() => pickMonth(startOfMonth(new Date()), new Date())}
                        >
                            This month
                        </Button>
                        {months.map(m => (
                            <Button key={m.label} variant="outline" size="sm" onClick={() => pickMonth(m.from, m.to)}>
                                {m.label}
                            </Button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <DatePickerWithRange date={range} setDate={setRange} />
                        <Button
                            variant="secondary"
                            disabled={!periodFrom || loading}
                            onClick={() => periodFrom && periodTo && load(periodFrom, periodTo)}
                        >
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            {loading ? 'Loading…' : 'Show period'}
                        </Button>
                        {periodFrom && !range?.to && (
                            <span className="text-xs text-muted-foreground">
                                Pick an end date, or show just {format(range!.from!, 'd MMM')}.
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {error && (
                <Card className="border-destructive/40">
                    <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {loading && (
                <Card className="border-border/50">
                    <CardContent className="p-5 flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading {periodFrom}{periodTo && periodTo !== periodFrom ? ` to ${periodTo}` : ''}…
                    </CardContent>
                </Card>
            )}

            {/* ── What the statement will say ────────────────────────── */}
            {bundle && c && !loading && (
                <Card className="border-border/50">
                    <CardContent className="p-5 space-y-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold">
                                    {format(new Date(`${bundle.period.from}T12:00:00`), 'd MMM yyyy')}
                                    {' – '}
                                    {format(new Date(`${bundle.period.to}T12:00:00`), 'd MMM yyyy')}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {c.count === 0
                                        ? 'No sales in this period.'
                                        : `${c.count.toLocaleString()} transaction${c.count === 1 ? '' : 's'} across ${bundle.byEvent.length} event${bundle.byEvent.length === 1 ? '' : 's'}.`}
                                    {bundle.rows.length > 0 && ' The PDF lists every one.'}
                                    {bundle.detailOmitted && ' Too many to list line by line — use the CSV on the Transactions tab for the full ledger.'}
                                </p>
                            </div>
                            <Button onClick={handleDownload} disabled={saving || c.count === 0} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                Download statement
                            </Button>
                        </div>

                        {c.count > 0 && (
                            <>
                                {/* The same waterfall the PDF prints. Indented lines are
                                    components of the line above, never additions. */}
                                <dl className="text-sm divide-y divide-border/60">
                                    <Line label="Sales at list price" value={peso(c.listPrice)} bold />
                                    <Line label="Less discounts you granted" value={`(${peso(c.discount)})`} indent />
                                    <Line label="Net sales" value={peso(c.revenue)} bold />
                                    <Line label="HangHut platform fee" value={`(${peso(c.platformFee)})`} indent />
                                    <Line label="Payment processing (Xendit)" value={`(${peso(c.processingFee)})`} indent />
                                    <Line label="Processing tax" value={`(${peso(c.processingTax)})`} indent />
                                    <Line label="Total fees" value={`(${peso(c.totalFees)})`} bold />
                                    {Math.abs(c.residual) >= 0.01 && (
                                        <Line
                                            label={c.unreconciled > 0 ? 'Unexplained difference' : 'Rounding'}
                                            value={`(${peso(c.residual)})`}
                                            indent
                                        />
                                    )}
                                    <Line label="Net earned in period" value={peso(c.netPayout)} strong />
                                </dl>

                                <div className="space-y-1.5 text-xs text-muted-foreground">
                                    {bundle.buyerPaidFees > 0 && (
                                        <p>Your buyers covered {peso(bundle.buyerPaidFees)} of HangHut fees on your behalf — not a cost to you, and not in the fees above.</p>
                                    )}
                                    {bundle.refunds.count > 0 && (
                                        <p>{bundle.refunds.count} refund{bundle.refunds.count === 1 ? '' : 's'} totalling {peso(bundle.refunds.amount)} are already netted into these figures.</p>
                                    )}
                                    {bundle.doorCollected > 0 && (
                                        <p>Door sales of {peso(bundle.doorCollected)} are excluded: you collected that cash yourself and HangHut charges nothing on it.</p>
                                    )}
                                </div>

                                {bundle.unreconciled > 0 && (
                                    <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            {bundle.unreconciled} of {c.count} transactions don&apos;t reconcile against this
                                            breakdown and are included at their recorded payout value. The PDF says so too.
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Payouts in the period, each with its own advice ─────── */}
            {bundle && bundle.payouts.length > 0 && !loading && (
                <Card className="border-border/50">
                    <CardContent className="p-5 space-y-3">
                        <div>
                            <h3 className="text-sm font-semibold">Payouts in this period</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                A payout is a withdrawal against your running balance, so these won&apos;t add up to the
                                net earned above — one may release earnings from an earlier month.
                            </p>
                        </div>

                        <ul className="divide-y divide-border/60">
                            {bundle.payouts.map(p => (
                                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">{peso(p.amount)}</span>
                                            <Badge variant="secondary" className="text-[10px] capitalize">
                                                {p.status.replace(/_/g, ' ')}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                            {p.completedAt
                                                ? `Settled ${format(new Date(p.completedAt), 'd MMM yyyy')}`
                                                : p.requestedAt
                                                    ? `Requested ${format(new Date(p.requestedAt), 'd MMM yyyy')}`
                                                    : '—'}
                                            {p.bankName ? ` · ${p.bankName} ${p.maskedAccount ?? ''}` : ''}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline" size="sm"
                                        disabled={adviceFor === p.id}
                                        onClick={() => handleAdvice(p.id)}
                                    >
                                        {adviceFor === p.id
                                            ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                            : <Receipt className="w-3.5 h-3.5 mr-2" />}
                                        Advice
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {bundle && bundle.payouts.length === 0 && c && c.count > 0 && !loading && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    No payouts were requested in this period.
                </p>
            )}
        </div>
    )
}

function Line({ label, value, bold, strong, indent }: {
    label: string; value: string; bold?: boolean; strong?: boolean; indent?: boolean
}) {
    return (
        <div className={`flex items-baseline justify-between gap-4 py-2 ${indent ? 'pl-4' : ''}`}>
            <dt className={strong ? 'font-semibold text-base' : bold ? 'font-semibold' : 'text-muted-foreground'}>
                {label}
            </dt>
            <dd className={`tabular-nums ${strong ? 'font-bold text-base' : bold ? 'font-semibold' : ''}`}>
                {value}
            </dd>
        </div>
    )
}
