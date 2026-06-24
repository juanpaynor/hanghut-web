import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EventForm } from '@/components/organizer/event-form'
import { getAuthUser, getUserRole } from '@/lib/auth/cached'

export const dynamic = 'force-dynamic'

export default async function CreateEventPage() {
    const supabase = await createClient()

    const { user } = await getAuthUser()
    if (!user) {
        redirect('/organizer/login')
    }

    // Owners and managers can create events; team members were previously
    // bounced to login because this only checked partners.user_id ownership.
    const userRole = await getUserRole(user.id)
    if (!userRole || (userRole.role !== 'owner' && userRole.role !== 'manager')) {
        redirect('/organizer')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, custom_percentage, pricing_model, status, pass_fees_to_customer, fixed_fee_per_ticket')
        .eq('id', userRole.partnerId)
        .single()

    if (!partner) {
        redirect('/organizer')
    }

    if (partner.status !== 'approved') {
        redirect('/organizer')
    }

    // Get commission rate (custom or default 4%)
    const commissionRate = partner.pricing_model === 'custom' && partner.custom_percentage !== null
        ? partner.custom_percentage / 100
        : 0.04

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
