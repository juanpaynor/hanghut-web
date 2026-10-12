/**
 * Shared constants and types for experience availability.
 *
 * Deliberately NOT in experience-availability-actions.ts: a `'use server'`
 * module may only export async functions, so a plain const array there is a
 * build error. Types are erased and would be fine, but they live here too so
 * client components can import them without pulling in a server module.
 */

/** EXTRACT(DOW) numbering, matching the SQL side exactly. 0 = Sunday. */
export const WEEKDAYS = [
    { value: 0, short: 'Sun', label: 'Sunday' },
    { value: 1, short: 'Mon', label: 'Monday' },
    { value: 2, short: 'Tue', label: 'Tuesday' },
    { value: 3, short: 'Wed', label: 'Wednesday' },
    { value: 4, short: 'Thu', label: 'Thursday' },
    { value: 5, short: 'Fri', label: 'Friday' },
    { value: 6, short: 'Sat', label: 'Saturday' },
] as const

export const DURATION_OPTIONS = [
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1½ hours' },
    { value: 120, label: '2 hours' },
    { value: 180, label: '3 hours' },
    { value: 240, label: '4 hours' },
    { value: 360, label: '6 hours' },
    { value: 480, label: '8 hours' },
] as const

export const CUTOFF_OPTIONS = [
    { value: 0,    label: 'Right up to the start' },
    { value: 60,   label: '1 hour before' },
    { value: 120,  label: '2 hours before' },
    { value: 360,  label: '6 hours before' },
    { value: 720,  label: '12 hours before' },
    { value: 1440, label: '1 day before' },
    { value: 2880, label: '2 days before' },
] as const

export interface AvailabilityRule {
    id: string
    table_id: string
    byweekday: number[]
    /** Manila wall-clock, "HH:MM". Not an instant — the host means "2pm". */
    start_time_local: string
    duration_minutes: number
    starts_on: string
    ends_on: string | null
    max_guests: number
    price_per_person: number | null
    /** Minutes before start when booking closes. 0 = until it starts. */
    booking_cutoff_minutes: number
    is_active: boolean
}

export interface RuleInput {
    byweekday: number[]
    start_time_local: string
    duration_minutes: number
    starts_on: string
    ends_on?: string | null
    max_guests: number
    price_per_person?: number | null
    booking_cutoff_minutes?: number
}

/** Today in Manila as YYYY-MM-DD — the earliest a rule can sensibly start. */
export function manilaToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
}

/** "Every Sat & Sun at 2:00 PM · 3 hours" — the rule read back as a sentence. */
export function describeRule(rule: Pick<RuleInput, 'byweekday' | 'start_time_local' | 'duration_minutes' | 'ends_on'>): string {
    const days = [...rule.byweekday].sort((a, b) => a - b)
    if (days.length === 0) return 'No days selected'

    const names = days.map(d => WEEKDAYS[d]?.short).filter(Boolean)
    const everyDay = days.length === 7
    const weekdaysOnly = days.length === 5 && days.every(d => d >= 1 && d <= 5)
    const weekendsOnly = days.length === 2 && days.includes(0) && days.includes(6)

    const when = everyDay ? 'Every day'
        : weekdaysOnly ? 'Weekdays'
        : weekendsOnly ? 'Weekends'
        : `Every ${names.join(', ')}`

    const [h, m] = rule.start_time_local.split(':').map(Number)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 === 0 ? 12 : h % 12
    const time = `${hour12}:${String(m).padStart(2, '0')} ${suffix}`

    const dur = DURATION_OPTIONS.find(d => d.value === rule.duration_minutes)?.label
        ?? `${rule.duration_minutes} min`

    const until = rule.ends_on ? ` · until ${rule.ends_on}` : ''
    return `${when} at ${time} · ${dur}${until}`
}

/**
 * How many dates a rule produces in the next `days` — shown live in the editor
 * so a host can see the consequence of "every Saturday" before saving, and so
 * a pattern that yields nothing is obvious rather than silent.
 *
 * Mirrors the generator's logic, NOT its implementation: it is an estimate for
 * the UI. The database remains the authority on what actually gets created.
 */
export function estimateSlotCount(rule: RuleInput, days = 90): number {
    if (!rule.byweekday?.length || !rule.starts_on) return 0

    const today = new Date(`${manilaToday()}T00:00:00`)
    const from = new Date(`${rule.starts_on}T00:00:00`)
    const start = from > today ? from : today
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + days)
    const end = rule.ends_on ? new Date(`${rule.ends_on}T00:00:00`) : horizon
    const last = end < horizon ? end : horizon

    let count = 0
    for (const cursor = new Date(start); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
        if (rule.byweekday.includes(cursor.getDay())) count++
    }
    return count
}

/** A fresh session, pre-filled with the shape most hosts want. */
export function blankRule(startTime = '14:00', maxGuests = 0): RuleInput {
    return {
        byweekday: [],
        start_time_local: startTime,
        duration_minutes: 120,
        starts_on: manilaToday(),
        ends_on: null,
        max_guests: maxGuests,
        price_per_person: null,
        booking_cutoff_minutes: 0,
    }
}

/**
 * Two sessions at the same time on an overlapping day collide on the slot's
 * natural key (table_id, start_time) and the generator's ON CONFLICT DO NOTHING
 * drops the second WITHOUT a word — the host would create a session and watch
 * it never appear. Caught here instead.
 *
 * Also warns on genuine overlap: a 1pm session lasting 3 hours alongside a 2pm
 * one puts the host in two rooms at once. Nothing in the database prevents that
 * (13:00 <> 14:00, so the key is distinct), and the host will not notice until
 * two groups turn up.
 */
export function sessionConflicts(rules: RuleInput[]): (string | null)[] {
    const toMin = (t: string) => {
        const [h, m] = (t || '0:0').split(':').map(Number)
        return h * 60 + m
    }
    return rules.map((rule, i) => {
        const start = toMin(rule.start_time_local)
        const end = start + rule.duration_minutes

        for (let j = 0; j < rules.length; j++) {
            if (j === i) continue
            const other = rules[j]
            const sharesDay = rule.byweekday.some(d => other.byweekday.includes(d))
            if (!sharesDay) continue

            const oStart = toMin(other.start_time_local)
            if (oStart === start) {
                return `Same start time as session ${j + 1} on a shared day — only one of them would be created.`
            }
            if (start < oStart + other.duration_minutes && oStart < end) {
                return `Overlaps session ${j + 1} on a shared day. You would be running both at once.`
            }
        }
        return null
    })
}
