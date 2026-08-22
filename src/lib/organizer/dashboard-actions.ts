'use server'

import { createClient } from '@/lib/supabase/server'
import { subDays, format } from 'date-fns'

export async function getDashboardStats(partnerId: string) {
    const supabase = await createClient()

    // Auth is already verified by the layout — partnerId comes from a trusted source

    // ─── PARALLEL BATCH 1: Fetch all independent data at once ─────────

    const [
        { data: transactions },
        { data: rawEvents },
        { data: pastEvents },
        { data: recentActivity }
    ] = await Promise.all([
        // 1. All completed transactions
        supabase
            .from('transactions')
            .select('gross_amount, status, created_at, purchase_intent_id, platform_fee, payment_processing_fee, event_id')
            .eq('partner_id', partnerId)
            .eq('status', 'completed'),

        // 2. All active events with tiers
        supabase
            .from('events')
            .select('id, title, capacity, tickets_sold, start_datetime, ticket_tiers(name, quantity_sold, quantity_total)')
            .eq('organizer_id', partnerId)
            .eq('status', 'active')
            .order('start_datetime', { ascending: true }),

        // 3. Best past event (benchmark)
        supabase
            .from('events')
            .select('id, title, start_datetime, tickets_sold')
            .eq('organizer_id', partnerId)
            .lt('start_datetime', new Date().toISOString())
            .order('tickets_sold', { ascending: false })
            .limit(1)
            .single(),

        // 4. Recent activity
        supabase
            .from('transactions')
            .select(`
                id,
                gross_amount,
                created_at,
                purchase_intents (
                    guest_name,
                    guest_email,
                    quantity,
                    tier:ticket_tiers(name)
                ),
                events(title)
            `)
            .eq('partner_id', partnerId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(10)
    ])

    // ─── BATCH TICKET COUNTS (single RPC instead of N+1) ─────────────

    const eventIds = rawEvents?.map(e => e.id) || []
    let ticketCountMap = new Map<string, number>()

    if (eventIds.length > 0) {
        const { data: counts } = await supabase.rpc('get_ticket_counts_by_events', {
            p_event_ids: eventIds
        })
        if (counts) {
            counts.forEach((c: any) => ticketCountMap.set(c.event_id, Number(c.sold_count)))
        }
    }

    // Also get per-tier sold counts (tickets grouped by tier_id)
    let tierCountMap = new Map<string, number>()
    if (eventIds.length > 0) {
        const { data: tierTickets } = await supabase
            .from('tickets')
            .select('tier_id')
            .in('event_id', eventIds)
            .not('status', 'in', '("available","refunded")')

        if (tierTickets) {
            tierTickets.forEach((t: any) => {
                if (t.tier_id) {
                    tierCountMap.set(t.tier_id, (tierCountMap.get(t.tier_id) || 0) + 1)
                }
            })
        }
    }

    // "Active" is a publication status, not a tense: on prod one partner has 175
    // rows with status='active' of which only 7 have not already happened. Counting
    // finished shows as live made every derived figure below — the headline count,
    // total capacity, sell-through — meaningless. Scope to what is still ahead.
    const nowIso = new Date().toISOString()
    const events = (rawEvents || []).filter(e => e.start_datetime >= nowIso).map(event => ({
        ...event,
        tickets_sold: ticketCountMap.get(event.id) || 0,
        // Update each tier's quantity_sold with real count
        ticket_tiers: (event.ticket_tiers || []).map((tier: any) => ({
            ...tier,
            quantity_sold: tierCountMap.get(tier.id) ?? tier.quantity_sold ?? 0
        }))
    }))

    // ─── COMPUTE METRICS ─────────────────────────────────────────────

    const totalRevenue = transactions?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0
    const totalPlatformFees = transactions?.reduce((sum, t) => sum + (t.platform_fee || 0), 0) || 0
    // Sum the actual per-transaction Xendit processing fee the webhook recorded
    // (organizer-absorbed), instead of a blanket 4% estimate.
    const totalPaymentFees = transactions?.reduce((sum, t) => sum + (t.payment_processing_fee || 0), 0) || 0
    const netRevenue = totalRevenue - totalPlatformFees - totalPaymentFees

    const uniqueOrders = new Set(transactions?.map(t => t.purchase_intent_id)).size
    const avgOrderValue = uniqueOrders > 0 ? totalRevenue / uniqueOrders : 0
    const totalTicketsSold = events.reduce((sum, e) => sum + (e.tickets_sold || 0), 0)
    const totalCapacity = events.reduce((sum, e) => sum + (e.capacity || 0), 0)

    // ─── SALES VELOCITY (Last 30 Days) ───────────────────────────────

    const last30Days = Array.from({ length: 30 }).map((_, i) => {
        const date = subDays(new Date(), 29 - i)
        return format(date, 'MMM dd')
    })

    const velocityData = last30Days.map(dateStr => {
        const dayTransactions = transactions?.filter(t =>
            format(new Date(t.created_at), 'MMM dd') === dateStr
        )
        return {
            date: dateStr,
            revenue: dayTransactions?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0,
            tickets: dayTransactions?.length || 0
        }
    })

    // ─── SALES PACE (Current vs Benchmark) ───────────────────────────

    const benchmarkEvent = pastEvents
    const currentEvent = events[0]

    let paceData: { daysOut: number; currentRevenue: number; benchmarkRevenue: number }[] = []
    if (currentEvent) {
        // Filter transactions in-memory (already fetched above) instead of extra queries
        const currentSales = (transactions || [])
            .filter(t => t.event_id === currentEvent.id)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        let benchmarkSales: typeof currentSales = []
        if (benchmarkEvent) {
            // Only fetch benchmark sales if we have a different event
            if (benchmarkEvent.id !== currentEvent.id) {
                const { data: bSales } = await supabase
                    .from('transactions')
                    .select('created_at, gross_amount')
                    .eq('event_id', benchmarkEvent.id)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: true })
                benchmarkSales = (bSales || []) as any
            }
        }

        const eventDate = new Date(currentEvent.start_datetime)

        paceData = Array.from({ length: 31 }).map((_, i) => {
            const daysOut = 30 - i
            const cutoffDate = subDays(eventDate, daysOut)

            const currentCum = currentSales
                .filter(t => new Date(t.created_at) <= cutoffDate)
                .reduce((sum, t) => sum + (t.gross_amount || 0), 0)

            let benchmarkCum = 0
            if (benchmarkEvent) {
                const benchDate = new Date(benchmarkEvent.start_datetime)
                const benchCutoff = subDays(benchDate, daysOut)
                benchmarkCum = benchmarkSales
                    .filter(t => new Date(t.created_at) <= benchCutoff)
                    .reduce((sum, t) => sum + ((t as any).gross_amount || 0), 0)
            }

            return { daysOut, currentRevenue: currentCum, benchmarkRevenue: benchmarkCum }
        })
    }

    return {
        metrics: {
            totalRevenue,
            netRevenue,
            totalPlatformFees,
            totalPaymentFees,
            totalTicketsSold,
            totalCapacity,
            activeEventsCount: events.length,
            avgOrderValue
        },
        velocityData,
        paceData,
        currentEventName: currentEvent?.title || 'No upcoming events',
        benchmarkEventName: benchmarkEvent?.title || 'Historical Average',
        activeEvents: events,
        recentActivity: recentActivity || []
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dashboard focus — the top of the page.
 *
 * getDashboardStats above answers "how have we done overall". That is the wrong
 * first question for this platform. Looking at real prod data, there are exactly
 * two kinds of organizer here:
 *
 *   • a curator with 175 active listings, 168 of them EXTERNAL redirects that
 *     cannot sell a ticket, and ~₱100 of lifetime revenue, and
 *   • a promoter with ONE show that is selling right now.
 *
 * Neither is served by an all-time revenue total. Both need the same thing: what
 * is the next show, how is it tracking, and what needs doing today. That is what
 * this returns.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AttentionItem {
    id: string
    tone: 'urgent' | 'warn' | 'info'
    title: string
    detail: string
    href: string
    action: string
}

export interface DashboardFocus {
    nextEvent: {
        id: string
        title: string
        startsAt: string
        venue: string | null
        cover: string | null
        capacity: number
        sold: number
        revenue: number
        daysOut: number
        isExternal: boolean
    } | null
    momentum: { today: number; last7: number; prev7: number; tickets7: number }
    counts: { upcoming: number; external: number; pastStillActive: number }
    attention: AttentionItem[]
}

export async function getDashboardFocus(partnerId: string): Promise<DashboardFocus> {
    const supabase = await createClient()
    const now = new Date()
    const iso = now.toISOString()
    const d7 = new Date(now.getTime() - 7 * 864e5).toISOString()
    const d14 = new Date(now.getTime() - 14 * 864e5).toISOString()

    // Midnight in Manila, expressed as an instant. The organizer's "today" is the
    // one on the wall behind them, not UTC's.
    const manilaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    const startOfDay = new Date(now.getTime() - (
        manilaNow.getHours() * 3600 + manilaNow.getMinutes() * 60 + manilaNow.getSeconds()
    ) * 1000).toISOString()

    const [{ data: upcoming }, { data: txns }, { count: pastActive }] = await Promise.all([
        supabase
            .from('events')
            .select('id, title, start_datetime, venue_name, cover_image_url, capacity, tickets_sold, is_external, status')
            .eq('organizer_id', partnerId)
            .in('status', ['active', 'hidden'])
            .gte('start_datetime', iso)
            .order('start_datetime', { ascending: true })
            .limit(50),
        supabase
            .from('transactions')
            .select('gross_amount, created_at, event_id')
            .eq('partner_id', partnerId)
            .eq('status', 'completed')
            .gte('created_at', d14),
        supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('organizer_id', partnerId)
            .eq('status', 'active')
            .lt('start_datetime', iso),
    ])

    const rows = upcoming ?? []
    // An external listing sends the buyer to someone else's checkout, so it can
    // never produce a sale here. Counting it as an "active event" is what made the
    // old headline read 175 when the real answer was 7.
    const sellable = rows.filter((e) => !e.is_external)
    const next = sellable[0] ?? rows[0] ?? null

    const sum = (from: string, to?: string) =>
        (txns ?? [])
            .filter((t) => t.created_at >= from && (!to || t.created_at < to))
            .reduce((n, t) => n + Number(t.gross_amount || 0), 0)

    const momentum = {
        today: sum(startOfDay),
        last7: sum(d7),
        prev7: sum(d14, d7),
        tickets7: (txns ?? []).filter((t) => t.created_at >= d7).length,
    }

    const attention: AttentionItem[] = []
    for (const e of sellable.slice(0, 12)) {
        const daysOut = Math.ceil((new Date(e.start_datetime).getTime() - now.getTime()) / 864e5)
        const cap = e.capacity ?? 0
        const sold = e.tickets_sold ?? 0
        const ratio = cap > 0 ? sold / cap : null

        if (daysOut <= 10 && sold === 0) {
            attention.push({
                id: `nosales-${e.id}`, tone: 'urgent',
                title: `${e.title} hasn't sold a ticket`,
                detail: daysOut <= 1 ? 'Happening within a day' : `${daysOut} days away`,
                href: `/organizer/events/${e.id}`, action: 'Open',
            })
        } else if (daysOut <= 7 && ratio !== null && ratio < 0.5) {
            attention.push({
                id: `slow-${e.id}`, tone: 'warn',
                title: `${e.title} is ${Math.round(ratio * 100)}% sold`,
                detail: `${cap - sold} left with ${daysOut} day${daysOut === 1 ? '' : 's'} to go`,
                href: `/organizer/marketing`, action: 'Promote',
            })
        }
        if (!e.cover_image_url) {
            attention.push({
                id: `cover-${e.id}`, tone: 'info',
                title: `${e.title} has no cover image`,
                detail: 'Listings with artwork get opened far more often',
                href: `/organizer/events/${e.id}`, action: 'Add one',
            })
        }
    }

    return {
        nextEvent: next ? {
            id: next.id,
            title: next.title,
            startsAt: next.start_datetime,
            venue: next.venue_name ?? null,
            cover: next.cover_image_url ?? null,
            capacity: next.capacity ?? 0,
            sold: next.tickets_sold ?? 0,
            revenue: (txns ?? [])
                .filter((t) => t.event_id === next.id)
                .reduce((n, t) => n + Number(t.gross_amount || 0), 0),
            daysOut: Math.ceil((new Date(next.start_datetime).getTime() - now.getTime()) / 864e5),
            isExternal: !!next.is_external,
        } : null,
        momentum,
        counts: {
            upcoming: sellable.length,
            external: rows.length - sellable.length,
            pastStillActive: pastActive ?? 0,
        },
        attention: attention.slice(0, 5),
    }
}
