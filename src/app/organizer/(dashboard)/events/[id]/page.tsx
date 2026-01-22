import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventForm } from '@/components/organizer/event-form'

interface EditEventPageProps {
    params: {
        id: string
    }
}

export default async function EditEventPage({ params }: EditEventPageProps) {
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
        .eq('id', params.id)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) {
        notFound()
    }

    // Get commission rate
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage
        ? partner.custom_percentage / 100
        : 0.15

    return (
        <div className="p-8">
            <EventForm
                partnerId={partner.id}
                commissionRate={commissionRate}
                initialData={event}
                eventId={event.id}
            />
        </div>
    )
}
