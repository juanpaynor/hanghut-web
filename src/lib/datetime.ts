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
