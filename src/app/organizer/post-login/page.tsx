import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'

export const dynamic = 'force-dynamic'

/**
 * Shared post-login gate (used by the OAuth callback). Mirrors the inline gate
 * in the password login: routes the now-authenticated user by partner status.
 *  - approved partner / team member → dashboard
 *  - partner pending/rejected       → back to login with a notice
 *  - no partner at all (new OAuth)  → finish the partner application
 */
export default async function PartnerPostLogin() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const supabase = await createClient()

    const { data: partner } = await supabase
        .from('partners')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()

    if (partner) {
        if (partner.status === 'approved') redirect('/organizer')
        redirect(`/organizer/login?notice=${encodeURIComponent(`Your partner application is ${partner.status}. You'll get an email once approved.`)}`)
    }

    const { data: team } = await supabase
        .from('partner_team_members')
        .select('partner_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (team) redirect('/organizer')

    // Brand-new OAuth user — send them to complete the partner application.
    redirect('/organizer/register')
}
