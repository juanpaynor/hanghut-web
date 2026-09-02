import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TicketOrderView, type TicketOrder } from '@/components/tickets/ticket-order-view'

// Per-URL ISR: the page is keyed by an unguessable token and its content is
// effectively immutable (event, seat, QR payload). Cache it so on-sale spikes
// don't hammer the DB; live check-in status is owned by the gate scanner.
export const revalidate = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cookieless anon client — keeps this page statically cacheable (reading cookies
// would force dynamic rendering on every request).
function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!UUID_RE.test(token)) notFound()

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_ticket_order', { p_token: token })
    if (error || !data) notFound()

    // No templateOverride here — the buyer-facing page always renders the
    // organizer's saved design.
    return <TicketOrderView order={data as TicketOrder} />
}
