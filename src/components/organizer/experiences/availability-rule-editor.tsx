'use client'

import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarCheck, CalendarX, Info, AlertTriangle } from 'lucide-react'
import {
    WEEKDAYS,
    DURATION_OPTIONS,
    CUTOFF_OPTIONS,
    describeRule,
    estimateSlotCount,
    manilaToday,
    type RuleInput,
} from '@/lib/organizer/experience-availability'

/**
 * The recurring-availability editor.
 *
 * A host declares a pattern once instead of hand-entering dates. That is the
 * whole fix: on prod, seven experiences had produced six slot rows between
 * them in four months, three had never had a single date, and /experiences
 * rendered empty. Nobody was being lazy — dates lived on another screen, and
 * a weekly class meant typing fifty-two rows a year.
 *
 * Controlled, with no save of its own, so the same component serves the
 * create wizard (where the rule is saved with everything else) and the edit
 * page (where it saves on its own).
 */
export function AvailabilityRuleEditor({
    value,
    onChange,
    defaultMaxGuests,
    conflict,
}: {
    value: RuleInput
    onChange: (next: RuleInput) => void
    defaultMaxGuests?: number
    /** Set when this session clashes with another on the same listing. */
    conflict?: string | null
}) {
    const set = <K extends keyof RuleInput>(key: K, v: RuleInput[K]) =>
        onChange({ ...value, [key]: v })

    const toggleDay = (day: number) => {
        const has = value.byweekday.includes(day)
        set('byweekday', has
            ? value.byweekday.filter(d => d !== day)
            : [...value.byweekday, day].sort((a, b) => a - b))
    }

    const estimate = useMemo(() => estimateSlotCount(value), [value])
    const today = manilaToday()

    return (
        <div className="space-y-6">
            {/* ── Days ─────────────────────────────────────────────────── */}
            <div className="space-y-2.5">
                <Label>Which days does this run? <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(d => {
                        const on = value.byweekday.includes(d.value)
                        return (
                            <button
                                key={d.value}
                                type="button"
                                onClick={() => toggleDay(d.value)}
                                aria-pressed={on}
                                className={`h-10 min-w-[62px] rounded-lg border px-3 text-sm font-medium transition-colors ${
                                    on
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-input bg-background hover:bg-muted'
                                }`}
                            >
                                {d.short}
                            </button>
                        )
                    })}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                    <button type="button" className="text-primary hover:underline"
                        onClick={() => set('byweekday', [1, 2, 3, 4, 5])}>Weekdays</button>
                    <button type="button" className="text-primary hover:underline"
                        onClick={() => set('byweekday', [0, 6])}>Weekends</button>
                    <button type="button" className="text-primary hover:underline"
                        onClick={() => set('byweekday', [0, 1, 2, 3, 4, 5, 6])}>Every day</button>
                    {value.byweekday.length > 0 && (
                        <button type="button" className="text-muted-foreground hover:underline"
                            onClick={() => set('byweekday', [])}>Clear</button>
                    )}
                </div>
            </div>

            {/* ── Time + duration ──────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="rule-time">Start time <span className="text-destructive">*</span></Label>
                    <Input
                        id="rule-time"
                        type="time"
                        value={value.start_time_local}
                        onChange={e => set('start_time_local', e.target.value)}
                    />
                    {/* Stored as Manila wall-clock, not an instant — a host
                        means "2pm", and 2pm must stay 2pm. */}
                    <p className="text-xs text-muted-foreground">Philippine time</p>
                </div>
                <div className="space-y-2">
                    <Label>How long does it run? <span className="text-destructive">*</span></Label>
                    <Select
                        value={String(value.duration_minutes)}
                        onValueChange={v => set('duration_minutes', Number(v))}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {DURATION_OPTIONS.map(d => (
                                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Window ───────────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="rule-from">First date <span className="text-destructive">*</span></Label>
                    <Input
                        id="rule-from"
                        type="date"
                        min={today}
                        value={value.starts_on}
                        onChange={e => set('starts_on', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rule-to">Last date</Label>
                    <Input
                        id="rule-to"
                        type="date"
                        min={value.starts_on || today}
                        value={value.ends_on ?? ''}
                        onChange={e => set('ends_on', e.target.value || null)}
                    />
                    {/* The default. An open-ended rule is a listing that never
                        lapses, which is the failure this whole feature exists
                        to prevent. */}
                    <p className="text-xs text-muted-foreground">
                        Leave empty to keep running indefinitely
                    </p>
                </div>
            </div>

            {/* ── Capacity + price override ────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="rule-guests">Guests per session <span className="text-destructive">*</span></Label>
                    <Input
                        id="rule-guests"
                        type="number"
                        min={1}
                        value={value.max_guests || ''}
                        placeholder={defaultMaxGuests ? String(defaultMaxGuests) : '8'}
                        onChange={e => set('max_guests', Number(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rule-price">Price per person for these dates</Label>
                    <Input
                        id="rule-price"
                        type="number"
                        min={0}
                        value={value.price_per_person ?? ''}
                        onChange={e => set('price_per_person', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="Same as the listing"
                    />
                    <p className="text-xs text-muted-foreground">
                        Optional — only if these dates cost something different
                    </p>
                </div>
            </div>

            {/* Booking cutoff. Without it a guest can book at 1:59 for a 2pm
                class and the host has no time to set a station. Enforced in
                reserve_experience too, not just hidden here — a client-side
                cutoff is advisory. */}
            <div className="space-y-2">
                <Label>Stop taking bookings</Label>
                <Select
                    value={String(value.booking_cutoff_minutes ?? 0)}
                    onValueChange={v => set('booking_cutoff_minutes', Number(v))}
                >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {CUTOFF_OPTIONS.map(c => (
                            <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {conflict && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/40">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{conflict}</p>
                </div>
            )}

            {/* ── Live consequence ─────────────────────────────────────────
                A host should see what the pattern produces BEFORE saving. The
                count is an estimate for the UI; the generator in the database
                remains the authority on what actually gets created. */}
            <div
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                    estimate > 0
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                }`}
            >
                {estimate > 0
                    ? <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    : <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />}
                <div className="min-w-0 text-sm">
                    {estimate > 0 ? (
                        <>
                            <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                                {estimate} bookable {estimate === 1 ? 'date' : 'dates'} in the next 90 days
                            </p>
                            <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-300/90">
                                {describeRule(value)}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="font-semibold text-amber-900 dark:text-amber-200">
                                This pattern produces no dates
                            </p>
                            <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                                {value.byweekday.length === 0
                                    ? 'Pick at least one day of the week.'
                                    : 'Check the first and last dates — the window may already be over.'}
                            </p>
                        </>
                    )}
                </div>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Dates are created automatically and kept 90 days ahead, so your
                listing never quietly runs out. You can cancel or add individual
                dates any time from the calendar.
            </p>
        </div>
    )
}
