import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { BookingsManager } from '@/components/organizer/experiences/bookings-manager'

export const dynamic = 'force-dynamic'

export default async function ExperienceBookingsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const supabase = await createClient()

    const { data: hostTables } = await supabase
        .from('tables')
        .select('id')
        .eq('host_id', user.id)
        .eq('is_experience', true)

    const tableIds = hostTables?.map((t: any) => t.id) ?? []

    const { data: bookings } = tableIds.length > 0
        ? await supabase
            .from('experience_purchase_intents')
            .select(`
                id, quantity, total_amount, guest_name, guest_email, guest_phone,
                created_at, status, check_in_status, checked_in_at, answers,
                table:tables!table_id(id, title),
                schedule:experience_schedules!schedule_id(start_time, end_time)
            `)
            .in('table_id', tableIds)
            .in('status', ['paid', 'confirmed', 'completed'])
            .order('created_at', { ascending: false })
        : { data: [] }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Bookings</h1>
                <p className="text-muted-foreground text-sm mt-0.5">All confirmed guest bookings</p>
            </div>
            <BookingsManager bookings={(bookings ?? []) as any} />
        </div>
    )
}
