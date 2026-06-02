import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClaimsManager, type Claim } from '@/components/organizer/subscriptions/claims-manager'

export const dynamic = 'force-dynamic'

async function getClaims(partnerId: string): Promise<Claim[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('subscription_claims')
        .select(`
            id, perk_type, perk_label, claim_period, details, status,
            organizer_note, created_at, fulfilled_at,
            users ( display_name, email )
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })

    return (data || []).map((c: any) => ({
        id: c.id,
        perk_type: c.perk_type,
        perk_label: c.perk_label,
        claim_period: c.claim_period,
        details: c.details ?? {},
        status: c.status,
        organizer_note: c.organizer_note,
        created_at: c.created_at,
        fulfilled_at: c.fulfilled_at,
        fan_name: c.users?.display_name ?? null,
        fan_email: c.users?.email ?? null,
    }))
}

export default async function ClaimsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const claims = await getClaims(partnerId)

    return <ClaimsManager claims={claims} />
}
