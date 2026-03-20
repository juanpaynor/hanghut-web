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
            .select('gross_amount, status, created_at, purchase_intent_id, platform_fee, event_id')
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

    const events = (rawEvents || []).map(event => ({
        ...event,
        tickets_sold: ticketCountMap.get(event.id) || 0
    }))

    // ─── COMPUTE METRICS ─────────────────────────────────────────────

    const totalRevenue = transactions?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0
    const totalPlatformFees = transactions?.reduce((sum, t) => sum + (t.platform_fee || 0), 0) || 0
    const totalPaymentFees = totalRevenue * 0.04
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
