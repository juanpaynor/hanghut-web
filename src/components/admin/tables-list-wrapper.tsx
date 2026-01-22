import { createClient } from '@/lib/supabase/server'
import { TablesListClient } from './tables-list'

async function TablesList({ hostId }: { hostId: string }) {
    const supabase = await createClient()

    // Find tables where user is host
    const { data: tables } = await supabase
        .from('tables')
        .select('*')
        .eq('host_id', hostId)
        .order('datetime', { ascending: false })
        .limit(10)

    if (!tables || tables.length === 0) {
        return (
            <div className="text-center py-8 text-slate-400">
                No tables hosted by this user yet.
            </div>
        )
    }

    return <TablesListClient hostId={hostId} tables={tables} />
}

export { TablesList }
