import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckoutClient } from '@/components/checkout/checkout-client'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ eventId: string; quantity: string; tierId?: string }>
}) {
    // 1. Validate params
    const { eventId, quantity, tierId } = await searchParams
    const qty = parseInt(quantity || '0')

    if (!eventId || qty < 1) {
        redirect('/')
    }

    const supabase = await createClient()

    // 2. Fetch Event Details with Ticket Tiers
    const { data: event } = await supabase
        .from('events')
        .select(`
            id,
            title,
            start_datetime,
            venue_name,
            ticket_price,
            cover_image_url,
            capacity,
            tickets_sold,
            organizer:partners (
                business_name
            ),
            ticket_tiers (
                id,
                name,
                price,
                quantity_total,
                quantity_sold,
                is_active
            )
        `)
        .eq('id', eventId)
        .single()

    if (!event) {
        redirect('/')
    }

    // 3. Resolve Tier
    let tierToUse = null

    if (tierId) {
        tierToUse = event.ticket_tiers?.find((t: any) => t.id === tierId) || null
    }

    // Fallback: If no tierId specified, check if event has tiers and use the first one (General Admission usually)
    // Or if event has no tiers, use event-level data
    if (!tierToUse) {
        // If tiers exist, default to the cheapest active one? Or just the first one?
        const activeTiers = event.ticket_tiers?.filter((t: any) => t.is_active) || []
        if (activeTiers.length > 0) {
            tierToUse = activeTiers[0]
        } else {
            // Backward compatibility for old events without tiers
            tierToUse = {
                id: null,
                name: 'General Admission',
                price: event.ticket_price,
                quantity_total: event.capacity,
                quantity_sold: event.tickets_sold
            }
        }
    }

    // 4. User State
    const { data: { user } } = await supabase.auth.getUser()

    // 5. Check Availability (use tier-specific availability)
    const availableTickets = tierToUse.quantity_total - tierToUse.quantity_sold
    if (availableTickets < qty) {
        redirect(`/events/${eventId}?error=sold_out`)
    }

    return (
        <div className="min-h-screen bg-muted/30">
            <header className="bg-background border-b sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="font-headline font-bold text-xl">
                        Checkout
                    </h1>
                    <div className="text-sm text-muted-foreground">
                        Secure Payment by Xendit
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <CheckoutClient
                    event={event}
                    quantity={qty}
                    user={user}
                    tier={tierToUse}
                />
            </main>
        </div>
    )
}
