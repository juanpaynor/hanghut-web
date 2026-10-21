'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BarChart3, Lock, SlidersHorizontal, Loader2, FileText, Paperclip } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    setQuestionAnalyticsKind,
    type AnswerStats,
    type AnswerQuestionStats,
    type AnswerFieldKind,
} from '@/lib/organizer/registration-management-actions'

/**
 * Per-question answer analytics.
 *
 * Every number here is computed in Postgres and arrives pre-aggregated — this
 * component does no counting, because counting in the browser means shipping
 * the rows to count, which is what the Responses tab stopped doing.
 *
 * It is also deliberately AGGREGATE ONLY. It never names a person. Questions
 * like "what church do you come from" are religious affiliation, and while an
 * organizer is entitled to collect and export that, a dashboard that profiles
 * it is a different proposition. Per-person answers stay on the response card
 * and in the CSV, both of which the organizer already controls.
 *
 * ── Why this is a grid of summaries rather than a stack of full breakdowns ──
 *
 * The RPC returns the top 20 values per question. Rendering all of them for
 * every question meant Sinadya Run — 22 answered questions, 14 of which have
 * more than 8 distinct values and one with 143 — produced something like
 * 16,000px of page: roughly eighteen screens of bar chart. Nobody scrolls that,
 * so in practice the panel showed nothing at all.
 *
 * Now each question is a tile that answers "what is the shape of this?" at a
 * glance, and the full ranking is one click away. A donut is used only where
 * it is honest: six or fewer slices, with the capped remainder shown as its own
 * segment so the ring always represents the whole. Anything wider gets its top
 * three as bars, because a 143-slice pie is decoration, not information.
 */

const KIND_LABEL: Record<AnswerFieldKind, string> = {
    choice: 'Choice',
    contact: 'Contact data',
    freetext: 'Short answers',
    longform: 'Written answers',
    file: 'File uploads',
}

/** A monochrome ramp off the theme's primary: safe in both themes, and with a
 *  legend beside it, readable without relying on hue discrimination. */
const SLICE_COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--primary) / 0.74)',
    'hsl(var(--primary) / 0.55)',
    'hsl(var(--primary) / 0.40)',
    'hsl(var(--primary) / 0.28)',
    'hsl(var(--primary) / 0.18)',
]
const OTHER_COLOR = 'hsl(var(--muted-foreground) / 0.30)'

/** How many values a donut can show before it stops meaning anything. */
const DONUT_MAX = 6
/** Bars shown on a tile for a question too wide to chart. */
const TILE_BARS = 3

function Bar({ value, n, total }: { value: string; n: number; total: number }) {
    const pct = total > 0 ? (n / total) * 100 : 0
    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" title={value}>{value}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                    {n.toLocaleString()}
                    <span className="ml-1.5 text-xs">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(pct, 1.5)}%` }}
                />
            </div>
        </div>
    )
}

/**
 * Donut drawn with dash offsets on stacked circles — no chart library.
 *
 * recharts is already a dependency but lives in the analytics chunk; a tile
 * grid can render a dozen of these at once, and a dozen recharts instances on
 * the Responses route would cost far more than the thirty lines below.
 */
function Donut({
    slices,
    size = 76,
    stroke = 13,
}: {
    slices: { label: string; n: number; pct: number; color: string }[]
    size?: number
    stroke?: number
}) {
    const r = (size - stroke) / 2
    const circumference = 2 * Math.PI * r
    let acc = 0

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="shrink-0 -rotate-90"
            role="img"
            aria-label={slices.map(s => `${s.label} ${Math.round(s.pct * 100)}%`).join(', ')}
        >
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke}
            />
            {slices.map((s, i) => {
                const len = s.pct * circumference
                const el = (
                    <circle
                        key={`${s.label}-${i}`}
                        cx={size / 2} cy={size / 2} r={r}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={stroke}
                        strokeDasharray={`${len} ${circumference - len}`}
                        strokeDashoffset={-acc * circumference}
                    />
                )
                acc += s.pct
                return el
            })}
        </svg>
    )
}

/** Shares are of PEOPLE for single-answer questions and of SELECTIONS for
 *  multi-select — otherwise a question where people tick two boxes shows
 *  percentages adding past 100 with no explanation. */
function shareBaseOf(q: AnswerQuestionStats) {
    return q.selections > q.answered ? q.selections : q.answered
}

function KindMenu({
    eventId,
    q,
    onChanged,
}: {
    eventId: string
    q: AnswerQuestionStats
    onChanged: () => void
}) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const setKind = (kind: AnswerFieldKind | null) => {
        startTransition(async () => {
            const res = await setQuestionAnalyticsKind(eventId, q.question_id, kind)
            if (!res.success) {
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
                return
            }
            onChanged()
        })
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 w-7 p-0 text-muted-foreground"
                    disabled={isPending}
                    aria-label="Change how this question is analysed"
                >
                    {isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <SlidersHorizontal className="h-3.5 w-3.5" />}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {(Object.keys(KIND_LABEL) as AnswerFieldKind[]).map(k => (
                    <DropdownMenuItem key={k} onClick={() => setKind(k)}>
                        Treat as {KIND_LABEL[k].toLowerCase()}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setKind(null)}>
                    Detect automatically
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function QuestionTile({
    q,
    eventId,
    onChanged,
    onExpand,
}: {
    q: AnswerQuestionStats
    eventId: string
    onChanged: () => void
    onExpand: () => void
}) {
    const shareBase = shareBaseOf(q)
    const isMulti = q.selections > q.answered
    const chartable = q.kind !== 'contact' && q.kind !== 'file' && q.distribution.length > 0

    // A donut is honest only when the whole ring is accounted for, so the
    // capped remainder becomes its own segment rather than being dropped.
    const useDonut = chartable && q.distribution.length <= DONUT_MAX
    const slices = useDonut
        ? [
            ...q.distribution.map((d, i) => ({
                label: d.value,
                n: d.n,
                pct: shareBase > 0 ? d.n / shareBase : 0,
                color: SLICE_COLORS[i % SLICE_COLORS.length],
            })),
            ...(q.tail_answers > 0
                ? [{
                    label: `${q.tail_values.toLocaleString()} other values`,
                    n: q.tail_answers,
                    pct: shareBase > 0 ? q.tail_answers / shareBase : 0,
                    color: OTHER_COLOR,
                }]
                : []),
        ]
        : []

    const hiddenValues = q.distribution.length - TILE_BARS + q.tail_values
    const canExpand = chartable && !useDonut && (q.distribution.length > TILE_BARS || q.tail_values > 0)

    return (
        <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-medium text-sm leading-snug line-clamp-2" title={q.label}>
                        {q.label}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-normal">
                            {KIND_LABEL[q.kind]}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                            {q.answered.toLocaleString()} answered
                            {isMulti && ` · ${q.selections.toLocaleString()} picks`}
                        </span>
                    </div>
                </div>
                <KindMenu eventId={eventId} q={q} onChanged={onChanged} />
            </div>

            {q.kind === 'file' ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                    <Paperclip className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        <strong>{q.answered.toLocaleString()}</strong>{' '}
                        {q.answered === 1 ? 'file' : 'files'} uploaded. Open them from each
                        response, or download them with the export.
                    </span>
                </p>
            ) : q.kind === 'contact' ? (
                /* Contact values never leave the database for this panel. A list
                   of 472 phone numbers is not an insight, and charting it would
                   put every attendee's number on screen at once. */
                <p className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        <strong>{q.distinct_values.toLocaleString()}</strong> unique values.
                        Not summarised here — read them on each response, or in the export.
                    </span>
                </p>
            ) : q.distribution.length === 0 ? (
                <p className="text-xs text-muted-foreground">No answers yet.</p>
            ) : useDonut ? (
                <div className="flex items-center gap-3">
                    <Donut slices={slices} />
                    <ul className="min-w-0 flex-1 space-y-1">
                        {slices.map(s => (
                            <li key={s.label} className="flex items-center gap-2 text-xs">
                                <span
                                    aria-hidden
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: s.color }}
                                />
                                <span className="truncate" title={s.label}>{s.label}</span>
                                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                                    {Math.round(s.pct * 100)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="space-y-2">
                    {q.distribution.slice(0, TILE_BARS).map(d => (
                        <Bar key={d.value} value={d.value} n={d.n} total={shareBase} />
                    ))}
                </div>
            )}

            {canExpand && (
                <button
                    type="button"
                    onClick={onExpand}
                    className="mt-auto self-start text-xs font-medium text-primary hover:underline"
                >
                    View all {hiddenValues > 0 ? `${(q.distribution.length + q.tail_values).toLocaleString()} values` : 'values'}
                </button>
            )}
        </div>
    )
}

export function AnswerInsights({
    eventId,
    stats,
    onRefresh,
}: {
    eventId: string
    stats: AnswerStats | null
    onRefresh: () => void
}) {
    const [open, setOpen] = useState(true)
    const [expanded, setExpanded] = useState<AnswerQuestionStats | null>(null)

    if (!stats || stats.questions.length === 0) return null

    const withAnswers = stats.questions.filter(q => q.answered > 0)
    if (withAnswers.length === 0) return null

    const expandedBase = expanded ? shareBaseOf(expanded) : 0

    return (
        <>
            <Card className="overflow-hidden">
                <button
                    onClick={() => setOpen(v => !v)}
                    className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
                >
                    <BarChart3 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm">Answer insights</span>
                    <span className="text-xs text-muted-foreground">
                        {withAnswers.length} {withAnswers.length === 1 ? 'question' : 'questions'} ·
                        {' '}{stats.registrations.toLocaleString()} registrations
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
                </button>

                {open && (
                    <div className="px-5 pb-5 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {withAnswers.map(q => (
                                <QuestionTile
                                    key={q.question_id}
                                    q={q}
                                    eventId={eventId}
                                    onChanged={onRefresh}
                                    onExpand={() => setExpanded(q)}
                                />
                            ))}
                        </div>
                        <p className="pt-1 text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                            Totals count people; multi-select questions also show how many options were
                            picked. Individual answers stay on each response and in the export.
                        </p>
                    </div>
                )}
            </Card>

            {/* Full ranking, on request. Capped at the 20 values the RPC returns,
                which is also why the tail is reported as a count rather than
                pretending the list is complete. */}
            <Dialog open={!!expanded} onOpenChange={o => !o && setExpanded(null)}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base leading-snug pr-6">
                            {expanded?.label}
                        </DialogTitle>
                    </DialogHeader>
                    {expanded && (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                {expanded.answered.toLocaleString()} answered
                                {expanded.selections > expanded.answered &&
                                    ` · ${expanded.selections.toLocaleString()} selections`}
                                {' · '}{expanded.distinct_values.toLocaleString()} distinct values
                            </p>
                            <div className="space-y-2.5">
                                {expanded.distribution.map(d => (
                                    <Bar key={d.value} value={d.value} n={d.n} total={expandedBase} />
                                ))}
                            </div>
                            {expanded.tail_values > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    + {expanded.tail_values.toLocaleString()} more{' '}
                                    {expanded.tail_values === 1 ? 'value' : 'values'}
                                    {' '}({expanded.tail_answers.toLocaleString()}{' '}
                                    {expanded.tail_answers === 1 ? 'answer' : 'answers'}) not shown.
                                    {expanded.kind === 'freetext'
                                        && expanded.distinct_values > expanded.distribution.length * 3 && (
                                        <> Many are likely spellings of the same things.</>
                                    )}
                                    {' '}The export has every answer.
                                </p>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
