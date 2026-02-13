import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EventForm } from '@/components/organizer/event-form'

export const dynamic = 'force-dynamic'

export default async function CreateEventPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, custom_percentage, pricing_model, status, pass_fees_to_customer, fixed_fee_per_ticket')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        redirect('/organizer/login')
    }

    if (partner.status !== 'approved') {
        redirect('/organizer')
    }

    // Get commission rate (custom or default 15%)
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage !== null
        ? partner.custom_percentage / 100
        : 0.15

    return (
        <div className="p-8">
            <EventForm
                partnerId={partner.id}
                commissionRate={commissionRate}
                passFeesToCustomer={partner.pass_fees_to_customer || false}
                fixedFeePerTicket={parseFloat(partner.fixed_fee_per_ticket?.toString() || '15.00')}
            />
        </div>
    )
}
