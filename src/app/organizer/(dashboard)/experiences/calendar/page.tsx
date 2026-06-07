import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { CalendarManager } from '@/components/organizer/experiences/calendar-manager'

export const dynamic = 'force-dynamic'

export default async function ExperienceCalendarPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const supabase = await createClient()

    const { data: hostTables } = await supabase
        .from('tables')
        .select('id, title')
        .eq('host_id', user.id)
        .eq('is_experience', true)
        .order('title')

    const tableIds = hostTables?.map((t: any) => t.id) ?? []

    const { data: schedules } = tableIds.length > 0
        ? await supabase
            .from('experience_schedules')
            .select('id, start_time, end_time, max_guests, current_guests, status, price_per_person, table_id')
            .in('table_id', tableIds)
            .order('start_time', { ascending: true })
        : { data: [] }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Calendar</h1>
                <p className="text-muted-foreground text-sm mt-0.5">Manage your experience slots</p>
            </div>
            <CalendarManager
                experiences={hostTables ?? []}
                schedules={(schedules ?? []) as any}
            />
        </div>
    )
}
