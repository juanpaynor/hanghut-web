import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventEditTabs } from '@/components/organizer/event-edit-tabs'

interface EditEventPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function EditEventPage({ params }: EditEventPageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, custom_percentage, pricing_model, status')
        .eq('user_id', user.id)
        .single()

    if (!partner || partner.status !== 'approved') {
        redirect('/organizer')
    }

    // Fetch event details
    const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) {
        notFound()
    }

    // Fetch ticket tiers
    const { data: tiers } = await supabase
        .from('ticket_tiers')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true })

    // Get commission rate
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage
        ? partner.custom_percentage / 100
        : 0.15

    // Fetch attendees
    const { getEventAttendees } = await import('@/lib/organizer/attendee-actions')
    const { attendees } = await getEventAttendees(id)

    // Fetch promo codes
    const { getPromoCodes } = await import('@/lib/organizer/promo-actions')
    const { data: promoCodes } = await getPromoCodes(id)

    return (
        <div className="p-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Edit Event</h1>
                <p className="text-muted-foreground">Update your event details and manage ticket tiers</p>
            </div>

            <EventEditTabs
                partnerId={partner.id}
                commissionRate={commissionRate}
                event={event}
                eventId={event.id}
                tiers={tiers || []}
                initialAttendees={attendees}
                promoCodes={promoCodes || []}
            />
        </div>
    )
}
