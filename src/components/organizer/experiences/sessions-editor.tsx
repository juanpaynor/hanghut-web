'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AvailabilityRuleEditor } from '@/components/organizer/experiences/availability-rule-editor'
import {
    blankRule,
    describeRule,
    estimateSlotCount,
    sessionConflicts,
    type RuleInput,
} from '@/lib/organizer/experience-availability'
import { CalendarCheck, CalendarX, ChevronDown, Plus, Trash2, AlertTriangle } from 'lucide-react'

/**
 * One experience, many sessions.
 *
 * The shape a host actually asks for: "1pm for ₱500 and 2pm for ₱1,000". That
 * is two availability RULES, not two price tiers — each generates its own slots
 * carrying its own time, price, capacity and cutoff, and reserve_experience
 * already charges COALESCE(slot.price_per_person, listing price). So the money
 * path needs nothing; this is the authoring surface it never had.
 *
 * Controlled and save-less, like the single editor it wraps, so the create
 * wizard can save these alongside the listing while the edit page saves them
 * on their own.
 */
export function SessionsEditor({
    value,
    onChange,
    defaultMaxGuests,
}: {
    value: RuleInput[]
    onChange: (next: RuleInput[]) => void
    defaultMaxGuests?: number
}) {
    // Collapsed by default past the first, so five sessions do not become a
    // five-screen form. The summary line is the readable version of the rule.
    const [openIdx, setOpenIdx] = useState<number>(0)

    const conflicts = useMemo(() => sessionConflicts(value), [value])
    const totals = useMemo(() => value.map(r => estimateSlotCount(r)), [value])
    const grandTotal = totals.reduce((a, b) => a + b, 0)
    const hasConflict = conflicts.some(Boolean)

    const update = (i: number, next: RuleInput) =>
        onChange(value.map((r, j) => (j === i ? next : r)))

    const add = () => {
        // Offset the new session an hour past the last one's END, which is the
        // common case (back-to-back sittings) and avoids opening on a conflict.
        const last = value[value.length - 1]
        let start = '14:00'
        if (last) {
            const [h, m] = last.start_time_local.split(':').map(Number)
            const mins = h * 60 + m + last.duration_minutes
            start = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
        }
        const next = [...value, { ...blankRule(start, defaultMaxGuests ?? 0), byweekday: last?.byweekday ?? [] }]
        onChange(next)
        setOpenIdx(next.length - 1)
    }

    const remove = (i: number) => {
        onChange(value.filter((_, j) => j !== i))
        setOpenIdx(o => (o >= i ? Math.max(0, o - 1) : o))
    }

    return (
        <div className="space-y-4">
            {value.map((rule, i) => {
                const open = openIdx === i
                const conflict = conflicts[i]
                return (
                    <div
                        key={i}
                        className={`rounded-xl border ${conflict ? 'border-amber-300 dark:border-amber-900' : ''}`}
                    >
                        <div className="flex items-start gap-3 p-4">
                            <button
                                type="button"
                                onClick={() => setOpenIdx(open ? -1 : i)}
                                aria-expanded={open}
                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            >
                                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold">
                                        {rule.byweekday.length ? describeRule(rule) : 'New session — pick its days'}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {rule.price_per_person != null
                                            ? `₱${Number(rule.price_per_person).toLocaleString()}`
                                            : 'Listing price'}
                                        {rule.max_guests > 0 && ` · ${rule.max_guests} guests`}
                                        {totals[i] > 0 && ` · ${totals[i]} dates`}
                                        {conflict && (
                                            <span className="ml-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                                <AlertTriangle className="h-3 w-3" /> needs attention
                                            </span>
                                        )}
                                    </span>
                                </span>
                                <ChevronDown
                                    className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {value.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => remove(i)}
                                    aria-label={`Remove session ${i + 1}`}
                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        {open && (
                            <div className="border-t p-4">
                                <AvailabilityRuleEditor
                                    value={rule}
                                    onChange={next => update(i, next)}
                                    defaultMaxGuests={defaultMaxGuests}
                                    conflict={conflict}
                                />
                            </div>
                        )}
                    </div>
                )
            })}

            <Button type="button" variant="outline" onClick={add} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Add another session
            </Button>

            {/* The total across every session — what the listing will actually
                offer. Per-session counts are useful; this is the number that
                decides whether the listing is visible at all. */}
            {value.length > 1 && (
                <div
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                        grandTotal > 0 && !hasConflict
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                            : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                    }`}
                >
                    {grandTotal > 0 && !hasConflict
                        ? <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        : <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />}
                    <div className="text-sm">
                        <p className={`font-semibold ${grandTotal > 0 && !hasConflict
                            ? 'text-emerald-900 dark:text-emerald-200'
                            : 'text-amber-900 dark:text-amber-200'}`}>
                            {grandTotal} bookable {grandTotal === 1 ? 'date' : 'dates'} across {value.length} sessions
                        </p>
                        <p className={`mt-0.5 ${grandTotal > 0 && !hasConflict
                            ? 'text-emerald-800/90 dark:text-emerald-300/90'
                            : 'text-amber-800/90 dark:text-amber-300/90'}`}>
                            {hasConflict
                                ? 'Fix the flagged sessions — overlapping ones can be lost silently.'
                                : totals.map((t, i) => `#${i + 1}: ${t}`).join(' · ')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
