import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { ExperiencePassView, type ExperienceBooking } from '@/components/tickets/experience-pass-view'

// The hosted experience pass — the /t/{token} of experiences, and deliberately
// built the same way: per-URL ISR keyed on an unguessable token, over content
// that does not change (experience, time, QR payload). Check-in state is owned
// by the host's bookings manager and is not worth a dynamic render per view.
export const revalidate = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cookieless anon client — reading cookies would force a dynamic render on
// every request and throw away the caching this page is written for.
function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export default async function ExperiencePassPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!UUID_RE.test(token)) notFound()

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_experience_booking', { p_token: token })
    if (error || !data) notFound()

    return <ExperiencePassView booking={data as ExperienceBooking} />
}
