'use server'

import { createClient } from '@/lib/supabase/server'
import { startOfDay, subDays, format, differenceInDays } from 'date-fns'

export async function getDashboardStats(partnerId: string) {
    const supabase = await createClient()

    // verify auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // 1. Fetch Key Metrics
    // Get all transactions for this partner
    const { data: transactions } = await supabase
        .from('transactions')
        .select('gross_amount, status, created_at, purchase_intent_id, platform_fee')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')

    // Get all active events
    // Get all active events
    const { data: rawEvents } = await supabase
        .from('events')
        .select('id, title, capacity, tickets_sold, start_datetime, ticket_tiers(name, quantity_sold, quantity_total)')
        .eq('organizer_id', partnerId)
        .eq('status', 'active')
        .order('start_datetime', { ascending: true })

    // [SMART SCALING FIX] Manually count sold tickets (status != 'available')
    // The 'tickets_sold' column on the event table is deprecated/laggy.
    const eventsWithCounts = await Promise.all((rawEvents || []).map(async (event) => {
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .neq('status', 'available')

        return {
            ...event,
            tickets_sold: count || 0
        }
    }))

    // Use the corrected array for calculations
    const events = eventsWithCounts

    const totalRevenue = transactions?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0
    const totalPlatformFees = transactions?.reduce((sum, t) => sum + (t.platform_fee || 0), 0) || 0
    // Payment Processing Fee: Strict 4% (Updated to match Xendit rates + margin)
    const totalPaymentFees = totalRevenue * 0.04

    // Net Revenue = Gross - Platform - Payment
    const netRevenue = totalRevenue - totalPlatformFees - totalPaymentFees

    // Get unique orders (count unique purchase_intent_id)
    const uniqueOrders = new Set(transactions?.map(t => t.purchase_intent_id)).size
    const avgOrderValue = uniqueOrders > 0 ? totalRevenue / uniqueOrders : 0
    const totalTicketsSold = events?.reduce((sum, e) => sum + (e.tickets_sold || 0), 0) || 0
    const totalCapacity = events?.reduce((sum, e) => sum + (e.capacity || 0), 0) || 0

    // 2. Prepare Sales Velocity (Last 30 Days)
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

    // 3. Sales Pace Data (Current vs Previous Best)
    // Find the event with highest revenue in past (Benchmark)
    const { data: pastEvents } = await supabase
        .from('events')
        .select('id, title, start_datetime, tickets_sold')
        .eq('organizer_id', partnerId)
        .lt('start_datetime', new Date().toISOString())
        .order('tickets_sold', { ascending: false })
        .limit(1)
        .single()

    const benchmarkEvent = pastEvents

    // For simplicity, let's take the NEXT upcoming event as "Current"
    const currentEvent = events?.[0]

    let paceData: { daysOut: number; currentRevenue: number; benchmarkRevenue: number }[] = []
    if (currentEvent) {
        // Calculate cumulative sales by "Days Out" for Current Event
        const { data: currentSales } = await supabase
            .from('transactions')
            .select('created_at, gross_amount')
            .eq('event_id', currentEvent.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: true })

        // Benchmarking data
        let benchmarkSales: any[] = []
        if (benchmarkEvent) {
            const { data: bSales } = await supabase
                .from('transactions')
                .select('created_at, gross_amount')
                .eq('event_id', benchmarkEvent.id)
                .eq('status', 'completed')
                .order('created_at', { ascending: true })
            benchmarkSales = bSales || []
        }

        // Generate data points: Days Out (30 -> 0)
        const eventDate = new Date(currentEvent.start_datetime)

        paceData = Array.from({ length: 31 }).map((_, i) => {
            const daysOut = 30 - i // 30, 29... 0 days until event
            const cutoffDate = subDays(eventDate, daysOut)

            // Current Cumulative
            const currentCum = currentSales?.filter(t => new Date(t.created_at) <= cutoffDate)
                .reduce((sum, t) => sum + t.gross_amount, 0) || 0

            // Benchmark Cumulative
            let benchmarkCum = 0
            if (benchmarkEvent) {
                const benchDate = new Date(benchmarkEvent.start_datetime)
                const benchCutoff = subDays(benchDate, daysOut)
                benchmarkCum = benchmarkSales.filter(t => new Date(t.created_at) <= benchCutoff)
                    .reduce((sum, t) => sum + t.gross_amount, 0) || 0
            }

            return {
                daysOut,
                currentRevenue: currentCum,
                benchmarkRevenue: benchmarkCum
            }
        })
    }

    // 4. Recent Activity
    const { data: recentActivity } = await supabase
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

    return {
        metrics: {
            totalRevenue,
            netRevenue,
            totalPlatformFees,
            totalPaymentFees,
            totalTicketsSold,
            totalCapacity,
            activeEventsCount: events?.length || 0,
            avgOrderValue
        },
        velocityData,
        paceData,
        currentEventName: currentEvent?.title || 'No upcoming events',
        benchmarkEventName: benchmarkEvent?.title || 'Historical Average',
        activeEvents: events || [],
        recentActivity: recentActivity || []
    }
}
