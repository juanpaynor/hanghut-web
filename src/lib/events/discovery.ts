/**
 * Shared rules for the /events discovery page.
 *
 * These live here rather than inline in the grid so the spotlight rule and the
 * "can you actually buy this" test have exactly one definition. Both are used in
 * more than one place (spotlight + rails + card badges) and quietly disagreeing
 * copies would be the obvious failure mode.
 */

/**
 * How many items the hero carousel will ever show.
 *
 * Enforced in TWO places on purpose: here when rendering, and again server-side
 * when someone stars something. A cap that only exists in the renderer means an
 * admin can star twenty things, see no error, and have fifteen of them silently
 * do nothing.
 */
export const HERO_MAX = 7

export interface DiscoveryEvent {
    id: string
    title: string
    start_datetime: string
    /** Optional. Present so cards can show a multi-day run as a date range. */
    end_datetime?: string | null
    venue_name: string
    city?: string | null
    cover_image_url: string | null
    ticket_price: number
    event_type?: string
    category?: string | null
    capacity?: number
    tickets_sold?: number
    is_external?: boolean | null
    is_featured?: boolean | null
    organizer_id?: string
    organizer?: unknown
    /** Experiences live in `tables`, not `events`, and route differently. */
    kind?: 'event' | 'experience'
}

/** Where a hero slide or card links to. Experiences are not under /events. */
export function itemHref(e: DiscoveryEvent): string {
    return e.kind === 'experience' ? `/experiences/${e.id}` : `/events/${e.id}`
}

/**
 * External events REDIRECT to someone else's checkout. 45 of the 50 live events
 * are these — they are listings, not inventory, and must never be presented as
 * something the visitor can buy here.
 */
export function isExternal(e: DiscoveryEvent): boolean {
    return e.is_external === true
}

/** Buyable on HangHut = we own the checkout. The inverse of {@link isExternal}. */
export function isBuyable(e: DiscoveryEvent): boolean {
    return !isExternal(e)
}

/**
 * External listings carry a placeholder capacity of 999999, so any capacity math
 * has to exclude them or the UI prints nonsense ("4 of 999999 sold"). Returns
 * null whenever a real number can't be trusted.
 */
export function soldRatio(e: DiscoveryEvent): { sold: number; capacity: number; pct: number } | null {
    if (isExternal(e)) return null
    const { tickets_sold: sold, capacity } = e
    if (typeof sold !== 'number' || typeof capacity !== 'number') return null
    if (capacity <= 0 || capacity >= 100_000) return null
    return { sold, capacity, pct: Math.min(100, Math.round((sold / capacity) * 100)) }
}

export function isSoldOut(e: DiscoveryEvent): boolean {
    const r = soldRatio(e)
    return r ? r.sold >= r.capacity : false
}

/**
 * Which events fill the hero carousel, best first.
 *
 * Starring is EXCLUSIVE, not merely first: the moment anyone stars an event, the
 * carousel is exactly the starred set and the automatic ladder stops running.
 * That is the whole point of "hand-picked with auto fallback" — mixing a curated
 * pick with algorithmic filler means the curator can add to the marquee but never
 * remove from it.
 *
 * With nothing starred, the fallback is deliberately conservative: events that
 * are demonstrably selling, and failing that a single soonest buyable event. It
 * does NOT top up to `max` with whatever is left, because a carousel with slots
 * to fill will happily promote junk — the first render of this scraped the barrel
 * and put a ₱1 event literally titled "Test Event" on slide 2 of the marquee.
 *
 * External events are never eligible: the hero is the page's strongest promise
 * and must not resolve to a link that sends the visitor to another checkout.
 *
 * Returns [] when nothing qualifies and the caller renders no hero at all — an
 * empty hero frame looks worse than no hero.
 *
 * `events` is expected to be pre-filtered to upcoming + publicly visible.
 */
export function pickSpotlightSlides(events: DiscoveryEvent[], max = HERO_MAX): DiscoveryEvent[] {
    const bySoonest = (a: DiscoveryEvent, b: DiscoveryEvent) =>
        new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()

    const starred = events.filter(e => e.is_featured === true).sort(bySoonest)
    if (starred.length > 0) return starred.slice(0, max)

    const selling = events
        .filter(e => isBuyable(e) && (e.tickets_sold ?? 0) > 0)
        .sort(bySoonest)
    if (selling.length > 0) return selling.slice(0, max)

    const soonestBuyable = events.filter(isBuyable).sort(bySoonest)[0]
    return soonestBuyable ? [soonestBuyable] : []
}

/**
 * Upcoming Sat 00:00 → Mon 00:00. If it is already the weekend, returns the
 * CURRENT one starting from now, so a Saturday visitor sees today's events
 * rather than next week's. Mirrors the 'weekend' quick-filter in the grid.
 */
export function weekendWindow(now = new Date()): [Date, Date] {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = startOfToday.getDay() // 0 Sun … 6 Sat
    const satOffset = day === 0 ? -1 : 6 - day // Sunday rolls back to yesterday's Saturday
    const sat = new Date(startOfToday)
    sat.setDate(sat.getDate() + satOffset)
    const mon = new Date(sat)
    mon.setDate(mon.getDate() + 2)
    return [now > sat ? now : sat, mon]
}

export function inWindow(e: DiscoveryEvent, [start, end]: [Date, Date]): boolean {
    const t = new Date(e.start_datetime).getTime()
    return t >= start.getTime() && t < end.getTime()
}

/** Cities with at least one live event, most-events-first then alphabetical. */
export function cityFacets(events: DiscoveryEvent[]): { city: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const e of events) {
        const c = e.city?.trim()
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return Array.from(counts, ([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
}
