import { createPublicClient } from '@/lib/supabase/public'

/**
 * The "on sale now" rail in the landing hero, and the count beside the city.
 *
 * Filters mirror the /events listing exactly — status, the subscriber-only and
 * invite-only exclusions, and the still-running-counts-as-upcoming OR clause —
 * because a homepage that advertises a number the events page then contradicts
 * is worse than a homepage with no number on it. If one changes, change both.
 *
 * Two deliberate narrowings on top of that listing:
 *
 *  - `is_external` is excluded. Those redirect to someone else's checkout, so a
 *    price and a Get-tickets affordance next to them would be a lie. Most of the
 *    catalogue is external today, which is exactly why the count has to be of
 *    what you can actually buy here.
 *  - A cover image is required. The rail is five posters; a row with a grey box
 *    in it reads as broken rather than as an event without artwork.
 */

export type HeroEvent = {
    id: string
    title: string
    coverImageUrl: string
    startDatetime: string
    venueName: string | null
    city: string | null
    /** Lowest live tier, else the event's flat price. 0 means free. */
    price: number
    /** Formatted on the server, in Manila, so the client renders no date of its
     *  own — a hero that formats dates in the browser hydrates differently for
     *  a visitor in another timezone. */
    dateLabel: string
    priceLabel: string
}

const manilaDate = (iso: string): string => {
    try {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short',
        }).format(new Date(iso))
    } catch {
        return ''
    }
}

export type HeroData = {
    events: HeroEvent[]
    /** Everything matching the same filters, not just the five shown. */
    onSaleCount: number
}

const RAIL_SIZE = 5

export async function getHeroData(): Promise<HeroData> {
    const empty: HeroData = { events: [], onSaleCount: 0 }

    try {
        const supabase = createPublicClient()
        const nowIso = new Date().toISOString()

        const { data, error } = await supabase
            .from('events')
            .select(`
                id,
                title,
                cover_image_url,
                start_datetime,
                venue_name,
                city,
                ticket_price,
                ticket_tiers ( price, is_active )
            `)
            .eq('status', 'active')
            .neq('is_subscriber_only', true)
            .neq('invite_only', true)
            .neq('is_external', true)
            .not('cover_image_url', 'is', null)
            // Still-running counts as upcoming: filtering on start_datetime alone
            // dropped a multi-day event from discovery on its second morning.
            .or(`end_datetime.gte.${nowIso},and(end_datetime.is.null,start_datetime.gte.${nowIso})`)
            .order('start_datetime', { ascending: true })

        if (error) {
            console.error('getHeroData:', error)
            return empty
        }

        const rows = data ?? []

        const events: HeroEvent[] = rows.slice(0, RAIL_SIZE).map(row => {
            const tiers = (row.ticket_tiers ?? []) as { price: number; is_active: boolean }[]
            const live = tiers.filter(t => t.is_active)
            const price = live.length
                ? Math.min(...live.map(t => Number(t.price) || 0))
                : Number(row.ticket_price) || 0

            return {
                id: row.id,
                title: row.title,
                coverImageUrl: row.cover_image_url as string,
                startDatetime: row.start_datetime,
                venueName: row.venue_name,
                city: row.city,
                price,
                dateLabel: manilaDate(row.start_datetime),
                priceLabel: price > 0 ? `₱${price.toLocaleString('en-PH')}` : 'Free',
            }
        })

        return { events, onSaleCount: rows.length }
    } catch (err) {
        // The landing must render whatever happens to the database. An empty
        // rail collapses; a thrown error would take the whole homepage down.
        console.error('getHeroData threw:', err)
        return empty
    }
}
