import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountDashboard } from '@/components/account/account-dashboard'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/account/login?next=/account')

    const { data: profile } = await supabase
        .from('users')
        .select('display_name, email, profile_photo_url')
        .eq('id', user.id)
        .maybeSingle()

    // My Memberships
    const { data: subscriptions } = await supabase
        .from('fan_subscriptions')
        .select(`
            id, status, current_period_end, cancelled_at, created_at,
            subscription_tiers ( id, name, price_monthly, perks ),
            partners ( id, business_name, slug, profile_photo_url )
        `)
        .eq('fan_id', user.id)
        .order('created_at', { ascending: false })

    // My Tickets — valid/confirmed, join event details
    const { data: tickets } = await supabase
        .from('tickets')
        .select(`
            id, ticket_number, qr_code, status, tier, checked_in_at, created_at, seat_info,
            events ( id, title, start_datetime, venue_name, cover_image_url, organizer_id ),
            purchase_intents ( access_token )
        `)
        .eq('user_id', user.id)
        .in('status', ['valid', 'confirmed', 'approved'])
        .order('created_at', { ascending: false })
        .limit(50)

    // Existing claims (for YourPerks dedup)
    const { data: claims } = await supabase
        .from('subscription_claims')
        .select('perk_type, claim_period, status, partner_id')
        .eq('fan_id', user.id)

    return (
        <AccountDashboard
            user={{ id: user.id, email: user.email ?? '' }}
            profile={profile}
            subscriptions={(subscriptions || []) as any}
            tickets={(tickets || []) as any}
            claims={(claims || []) as any}
        />
    )
}
