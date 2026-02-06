'use server'

import { createClient } from '@/lib/supabase/server'

export interface TierStat {
    name: string
    value: number
    color: string
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

export async function getTierStats(eventId: string): Promise<{ data?: TierStat[], error?: string }> {
    const supabase = await createClient()

    // 1. Fetch all tickets for this event with tier info
    // We group by tier_id.
    // Note: Supabase/PostgREST doesn't support "GROUP BY" easily in JS client without RPC.
    // So we fetch relevant columns and aggregate in JS (efficient enough for <10k tickets).
    // Or we use the `ticket_tiers` table and count sold.

    // Better approach: Use `ticket_tiers` table which has `quantity_sold`.
    // It's already aggregated!

    const { data: tiers, error } = await supabase
        .from('ticket_tiers')
        .select('name, quantity_sold')
        .eq('event_id', eventId)
        .gt('quantity_sold', 0) // Only show tiers with sales
        .order('quantity_sold', { ascending: false })

    if (error) {
        console.error('Error fetching tier stats:', error)
        return { error: 'Failed to fetch tier stats' }
    }

    // Format for Recharts
    const stats: TierStat[] = tiers.map((tier, index) => ({
        name: tier.name,
        value: tier.quantity_sold,
        color: COLORS[index % COLORS.length]
    }))

    return { data: stats }
}
