import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { CalendarManager } from '@/components/organizer/experiences/calendar-manager'

export const dynamic = 'force-dynamic'

export default async function ExperienceCalendarPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const supabase = await createClient()

    // max_guests seeds a brand-new session so the host is not asked for a
    // capacity the listing already states.
    const { data: hostTables } = await supabase
        .from('tables')
        .select('id, title, max_guests')
        .eq('host_id', user.id)
        .eq('is_experience', true)
        .order('title')

    const tableIds = hostTables?.map((t: any) => t.id) ?? []

    // Slots and the recurring rules that generate them are fetched together so
    // the calendar can say WHICH session produced a date. Without
    // generated_from_rule_id a host cannot tell a rule-generated slot from one
    // they added by hand -- and the two behave differently on delete.
    const [{ data: schedules }, { data: rules }] = tableIds.length > 0
        ? await Promise.all([
            supabase
                .from('experience_schedules')
                .select('id, start_time, end_time, max_guests, current_guests, status, price_per_person, table_id, generated_from_rule_id')
                .in('table_id', tableIds)
                .order('start_time', { ascending: true }),
            supabase
                .from('experience_availability_rules')
                .select('*')
                .in('table_id', tableIds)
                .order('start_time_local', { ascending: true }),
        ])
        : [{ data: [] }, { data: [] }]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Calendar</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                    Set the sessions that run every week, and manage individual dates
                </p>
            </div>
            <CalendarManager
                experiences={hostTables ?? []}
                schedules={(schedules ?? []) as any}
                rules={(rules ?? []) as any}
            />
        </div>
    )
}
