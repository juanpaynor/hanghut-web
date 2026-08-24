/**
 * Event date/time handling, pinned to Philippine time.
 *
 * The bug this exists to prevent: `<input type="datetime-local">` yields a NAIVE
 * wall-clock string ("2026-08-28T19:00") with no zone. Writing that straight into
 * a timestamptz column made Postgres (session TZ = UTC) read it as 19:00 UTC —
 * i.e. 3am the NEXT DAY in Manila. It round-tripped cleanly through the edit form,
 * so it stayed invisible until a client-rendered surface (My Tickets) displayed the
 * real instant and showed a different date than the server-rendered event page.
 *
 * Rules:
 *  - Organizers enter local Philippine time. Convert on the way IN (`manilaLocalToISO`).
 *  - Storage is a real instant (timestamptz).
 *  - Every surface formats with `timeZone: 'Asia/Manila'` so server-rendered and
 *    client-rendered output can never disagree.
 *
 * PH has no DST and has been UTC+8 since 1844, so a fixed offset is safe here;
 * the formatters still go through the IANA zone rather than hardcoding +08:00.
 */

export const PH_TIME_ZONE = 'Asia/Manila'
const PH_OFFSET_MINUTES = 8 * 60

/**
 * "2026-08-28T19:00" (as typed by an organizer, meaning Manila) -> ISO instant.
 * Returns '' for empty input so callers can pass form values straight through.
 */
export function manilaLocalToISO(local: string): string {
    if (!local) return ''
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local.trim())
    // Already zoned (ends in Z or ±HH:MM), or unparseable — leave it alone.
    if (!m) return local
    if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(local.trim())) return local

    const [, y, mo, d, h, mi] = m
    const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi)
    return new Date(asUTC - PH_OFFSET_MINUTES * 60_000).toISOString()
}

/**
 * Instant -> "2026-08-28T19:00" in Manila, for prefilling a datetime-local input.
 * The old code used .toISOString().slice(0,16), which showed UTC and so silently
 * agreed with the broken write path.
 */
export function isoToManilaLocal(iso: string | null | undefined): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const shifted = new Date(date.getTime() + PH_OFFSET_MINUTES * 60_000)
    return shifted.toISOString().slice(0, 16)
}

/** Date+time in Manila, e.g. "Friday, August 28 · 7:00 PM". */
export function formatEventDateTime(iso: string | null | undefined): string {
    return formatInManila(iso, {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    })
}

/** Date only in Manila, e.g. "Friday, August 28". */
export function formatEventDate(iso: string | null | undefined): string {
    return formatInManila(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Time only in Manila, e.g. "7:00 PM". */
export function formatEventTime(iso: string | null | undefined): string {
    return formatInManila(iso, { hour: 'numeric', minute: '2-digit' })
}

/** Short form for lists/tickets, e.g. "Aug 28, 2026 · 7:00 PM". */
export function formatEventShort(iso: string | null | undefined): string {
    return formatInManila(iso, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    })
}

export function formatInManila(
    iso: string | null | undefined,
    options: Intl.DateTimeFormatOptions
): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('en-PH', { ...options, timeZone: PH_TIME_ZONE })
}

/* ------------------------------------------------------------------ *
 * Multi-day events
 * ------------------------------------------------------------------ */

/**
 * An event that is still running at this Manila hour has genuinely reached a
 * SECOND DAY. Below it, the event merely ran late.
 *
 * This distinction is the whole problem. 73 of 227 events end on a later
 * calendar date than they start, but most are one night out that crossed
 * midnight — "Artsy for Paws" (22:00 -> 00:00), "Manila Natural Wine Fiesta"
 * (23:00 -> 04:00). Rendering those as "Jul 18 – 19" would invent a second day
 * nobody is invited to. Meanwhile "Fuego Identity" (Aug 29 11:00 -> Aug 30
 * 20:00) really is a two-day market and has been showing as a single date.
 *
 * 6am splits the real cases cleanly: nothing legitimately opens before it, and
 * every genuine day-two we have runs well past it.
 */
const NEXT_DAY_CUTOFF_HOUR = 6

interface ManilaParts { year: number; month: number; day: number; hour: number; minute: number }

const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    // h23 explicitly: `hour12: false` reports midnight as "24" in some ICU builds.
    hourCycle: 'h23',
})

function manilaParts(iso: string | null | undefined): ManilaParts | null {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null

    const parts: Record<string, string> = {}
    for (const { type, value } of PARTS_FORMAT.formatToParts(date)) parts[type] = value

    return {
        year: +parts.year, month: +parts.month, day: +parts.day,
        hour: +parts.hour, minute: +parts.minute,
    }
}

/** Calendar day as a single integer, so day comparison never touches a timezone. */
const dayNumber = (p: ManilaParts) => Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)

/**
 * The last day the event is meaningfully ON. An end before the cutoff belongs to
 * the night before it, so a Fri->Sun 03:00 run is "Friday – Saturday", not
 * "Friday – Sunday".
 */
function effectiveEndParts(end: ManilaParts): ManilaParts {
    if (end.hour >= NEXT_DAY_CUTOFF_HOUR) return end
    const shifted = new Date(Date.UTC(end.year, end.month - 1, end.day) - 86_400_000)
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: end.hour, minute: end.minute,
    }
}

/** True when the event spans more than one calendar day in Manila. */
export function isMultiDayEvent(start: string | null | undefined, end: string | null | undefined): boolean {
    const s = manilaParts(start)
    const e = manilaParts(end)
    if (!s || !e) return false
    return dayNumber(effectiveEndParts(e)) > dayNumber(s)
}

/** How many days the event runs. 1 for anything that isn't multi-day. */
export function eventDayCount(start: string | null | undefined, end: string | null | undefined): number {
    const s = manilaParts(start)
    const e = manilaParts(end)
    if (!s || !e) return 1
    return Math.max(1, dayNumber(effectiveEndParts(e)) - dayNumber(s) + 1)
}

/**
 * Above this many days a run is a SEASON, not a festival, and a day tally stops
 * being useful — a theatre run showing "114 days" reads as a bug, and one of our
 * events genuinely spans that long. The date range still shows; only the chip
 * is suppressed, because "August 22 – December 13" already says everything a
 * count would.
 */
const DAY_COUNT_CHIP_MAX = 7

/** Whether a "N days" chip earns its space for this event. */
export function showsDayCount(start: string | null | undefined, end: string | null | undefined): boolean {
    if (!isMultiDayEvent(start, end)) return false
    return eventDayCount(start, end) <= DAY_COUNT_CHIP_MAX
}

/** Month name from a number, pinned to UTC so the lookup date can't shift a day. */
const monthName = (month: number, style: 'long' | 'short') =>
    new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-PH', { month: style, timeZone: 'UTC' })

/**
 * The date a multi-day event runs, collapsing whatever the two ends share:
 *   "August 29 – 30"  ·  "August 30 – September 1"  ·  "December 30, 2026 – January 2, 2027"
 *
 * Single-day events fall through to the plain date, so callers can use this
 * unconditionally without checking first.
 */
export function formatEventDayRange(
    start: string | null | undefined,
    end: string | null | undefined,
    style: 'long' | 'short' = 'long',
    options: { year?: boolean } = {}
): string {
    const s = manilaParts(start)
    if (!s) return ''

    const withYear = options.year ?? false
    const single = () => formatInManila(start, {
        month: style, day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
    })

    if (!isMultiDayEvent(start, end)) return single()

    const e = effectiveEndParts(manilaParts(end)!)
    const startMonth = monthName(s.month, style)
    const endMonth = monthName(e.month, style)

    // Different years: neither end can borrow context from the other.
    if (s.year !== e.year) {
        return `${startMonth} ${s.day}, ${s.year} – ${endMonth} ${e.day}, ${e.year}`
    }

    const yearSuffix = withYear ? `, ${s.year}` : ''
    return s.month === e.month
        ? `${startMonth} ${s.day} – ${e.day}${yearSuffix}`
        : `${startMonth} ${s.day} – ${endMonth} ${e.day}${yearSuffix}`
}

/**
 * Range-aware sibling of {@link formatEventDate}.
 * Single day keeps the weekday ("Friday, August 28"); a range drops it, since
 * two weekdays plus two dates is more furniture than information.
 */
export function formatEventDateWithEnd(
    start: string | null | undefined,
    end: string | null | undefined
): string {
    if (!isMultiDayEvent(start, end)) return formatEventDate(start)
    return formatEventDayRange(start, end, 'long')
}

/**
 * Range-aware sibling of {@link formatEventDateTime}.
 * A multi-day event has no single start time worth printing as fact, so the
 * time is qualified: doors on day one, not a promise about every day.
 */
export function formatEventDateTimeWithEnd(
    start: string | null | undefined,
    end: string | null | undefined
): string {
    if (!isMultiDayEvent(start, end)) return formatEventDateTime(start)
    return `${formatEventDayRange(start, end, 'long')} · from ${formatEventTime(start)}`
}

/** Range-aware sibling of {@link formatEventShort}, for lists and tickets. */
export function formatEventShortWithEnd(
    start: string | null | undefined,
    end: string | null | undefined
): string {
    if (!isMultiDayEvent(start, end)) return formatEventShort(start)
    return formatEventDayRange(start, end, 'short', { year: true })
}
