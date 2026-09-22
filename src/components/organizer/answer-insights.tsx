'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
 */

const KIND_LABEL: Record<AnswerFieldKind, string> = {
    choice: 'Choice',
    contact: 'Contact data',
    freetext: 'Short answers',
    longform: 'Written answers',
    file: 'File uploads',
}

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

function QuestionBlock({
    q,
    eventId,
    onChanged,
}: {
    q: AnswerQuestionStats
    eventId: string
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

    // Shares are of PEOPLE for single-answer questions and of SELECTIONS for
    // multi-select — otherwise a question where people tick two boxes shows
    // percentages that add up to more than 100 with no explanation.
    const isMulti = q.selections > q.answered
    const shareBase = isMulti ? q.selections : q.answered

    return (
        <div className="py-5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <p className="font-medium text-sm leading-snug">{q.label}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-normal">
                            {KIND_LABEL[q.kind]}
                        </Badge>
                        {q.kind_source === 'override' && (
                            <span className="text-[10px] text-muted-foreground">set by you</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {q.answered.toLocaleString()} answered
                            {isMulti && ` · ${q.selections.toLocaleString()} selections`}
                        </span>
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2" disabled={isPending}>
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
            </div>

            {q.kind === 'file' ? (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                    <Paperclip className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong>{q.answered.toLocaleString()}</strong>{' '}
                        {q.answered === 1 ? 'file' : 'files'} uploaded. Open them from each
                        response, or download them with the export.
                    </p>
                </div>
            ) : q.kind === 'contact' ? (
                /* Contact values never leave the database for this panel. A list
                   of 472 phone numbers is not an insight, and charting it would
                   put every attendee's number on screen at once. */
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Contact details — <strong>{q.distinct_values.toLocaleString()}</strong> unique
                        values collected. Not summarised here; read them on each response, or in the CSV export.
                    </p>
                </div>
            ) : q.distribution.length === 0 ? (
                <p className="text-xs text-muted-foreground">No answers yet.</p>
            ) : (
                <>
                    <div className="space-y-2.5">
                        {q.distribution.map(d => (
                            <Bar key={d.value} value={d.value} n={d.n} total={shareBase} />
                        ))}
                    </div>
                    {q.tail_values > 0 && (
                        <p className="text-xs text-muted-foreground mt-3">
                            + {q.tail_values.toLocaleString()} more {q.tail_values === 1 ? 'value' : 'values'}
                            {' '}({q.tail_answers.toLocaleString()} {q.tail_answers === 1 ? 'answer' : 'answers'}).
                            {q.kind === 'freetext' && q.distinct_values > q.distribution.length * 3 && (
                                <> Many are likely spellings of the same things.</>
                            )}
                        </p>
                    )}
                </>
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

    if (!stats || stats.questions.length === 0) return null

    const withAnswers = stats.questions.filter(q => q.answered > 0)
    if (withAnswers.length === 0) return null

    return (
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
                <div className="px-5 pb-5 divide-y">
                    {withAnswers.map(q => (
                        <QuestionBlock key={q.question_id} q={q} eventId={eventId} onChanged={onRefresh} />
                    ))}
                    <p className="pt-4 text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                        Totals count people; multi-select questions also show how many options were
                        picked. Individual answers stay on each response and in the export.
                    </p>
                </div>
            )}
        </Card>
    )
}
