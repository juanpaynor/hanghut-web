import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { DoorTill } from '@/components/box-office/door-till'
import { getDoorSales, getDoorSummary } from '@/lib/box-office/actions'

export const dynamic = 'force-dynamic'

export default async function BoxOfficeTillPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/login?next=/box-office/${id}`)

    const { data: event } = await supabase
        .from('events')
        .select('id, title, ticket_price, organizer_id, capacity, tickets_sold')
        .eq('id', id)
        .single()
    if (!event) notFound()

    // The database owns this rule (can_sell_at_door). Asking it directly avoids a
    // second copy of the role list drifting out of sync with the RPC that matters.
    const { data: allowed } = await supabase.rpc('can_sell_at_door', { p_org: event.organizer_id })
    if (!allowed) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
                    <h1 className="text-lg font-bold">Not your door</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        You don&rsquo;t have permission to sell tickets for this event.
                    </p>
                </div>
            </div>
        )
    }

    // Seated events: the seller picks a section and we seat the party (best
    // available). Sections + live availability come from the same status RPC
    // the buyer picker polls.
    const { data: seatStatus } = await supabase.rpc('get_event_seat_status', { p_event_id: id })
    let sections: { id: string; label: string; available: number }[] = []
    if (seatStatus && Array.isArray((seatStatus as any).sections)) {
        const { data: secRows } = await supabase
            .from('event_sections')
            .select('id, label, sort_order')
            .eq('event_id', id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
        const avail = new Map<string, number>(((seatStatus as any).sections as any[]).map(s => [s.id, Number(s.available_count) || 0]))
        sections = (secRows ?? []).map(r => ({ id: r.id, label: r.label, available: avail.get(r.id) ?? 0 }))
    }

    const [{ data: tiers }, { count: availableCount }, sales, summary] = await Promise.all([
        supabase
            .from('ticket_tiers')
            .select('id, name, price, quantity_total, quantity_sold')
            .eq('event_id', id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', id)
            .eq('status', 'available'),
        getDoorSales(id),
        getDoorSummary(id),
    ])

    // No page chrome and no width cap: the till owns the whole viewport so it can
    // lay itself out without scrolling. Its own header carries the back link.
    return (
        <DoorTill
            eventId={id}
            eventTitle={event.title}
            basePrice={Number(event.ticket_price) || 0}
            tiers={(tiers ?? []).map((t) => ({
                id: t.id,
                name: t.name,
                price: Number(t.price) || 0,
                available: Math.max(0, (t.quantity_total ?? 0) - (t.quantity_sold ?? 0)),
            }))}
            ticketsLeft={availableCount ?? 0}
            sections={sections}
            initialSales={sales}
            initialSummary={summary}
        />
    )
}
