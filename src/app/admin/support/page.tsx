import { listAgentThreads } from '@/lib/support/agent-actions'
import { getAuthUser } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { SupportQueue } from './support-queue'

export const dynamic = 'force-dynamic'

/**
 * The agent inbox. One queue for every source — an organizer raising a thread
 * from the web dashboard and (once the app team lands their half, team_comms
 * #304) a user raising one in the app both arrive here.
 *
 * Access is the /admin layout's job: it already requires an admin role and a
 * verification within the last 8 hours, and every write these pages make is
 * re-checked by is_support_agent() in the database regardless.
 *
 * The one extra check below is about honesty, not security. The nav hides this
 * page from finance_admin, and RLS refuses them everything on it — so someone
 * who reaches it by typing the URL would see an empty queue and reasonably read
 * that as "no tickets today" rather than "not for you". Ask the same predicate
 * the database uses and say so.
 */
export default async function AdminSupportPage() {
    const supabase = await createClient()
    const { data: isAgent } = await supabase.rpc('is_support_agent')

    if (isAgent !== true) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold tracking-tight">Support</h1>
                <p className="mt-2 max-w-prose text-sm text-slate-500">
                    Your admin role doesn&apos;t include the support queue. Ask a super admin
                    if you need access — this isn&apos;t an empty inbox, it&apos;s a closed door.
                </p>
            </div>
        )
    }

    const [{ user }, inbox] = await Promise.all([getAuthUser(), listAgentThreads('inbox')])

    // The console owns the viewport. A page that scrolls as a whole would put
    // the composer below the fold on a long thread — the one control an agent
    // needs on every single screen — so the height is fixed here and each pane
    // inside scrolls on its own.
    return (
        <div className="flex h-screen flex-col overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-6 py-3.5">
                <h1 className="text-xl font-semibold tracking-tight">Support</h1>
                <p className="text-[13px] text-slate-500">
                    Organizer and user conversations. Replies reach them by email too.
                </p>
            </div>
            <SupportQueue initialThreads={inbox} currentUserId={user?.id ?? null} />
        </div>
    )
}
