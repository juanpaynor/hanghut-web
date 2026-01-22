import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckoutClient } from '@/components/checkout/checkout-client'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ eventId: string; quantity: string }>
}) {
    // 1. Validate params
    const { eventId, quantity } = await searchParams
    const qty = parseInt(quantity || '0')

    if (!eventId || qty < 1) {
        redirect('/')
    }

    const supabase = await createClient()

    // 2. Fetch Event Details
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
            )
        `)
        .eq('id', eventId)
        .single()

    if (!event) {
        redirect('/')
    }

    // 3. User State
    const { data: { user } } = await supabase.auth.getUser()

    // 4. Check Availability
    if (event.capacity - event.tickets_sold < qty) {
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
                />
            </main>
        </div>
    )
}
