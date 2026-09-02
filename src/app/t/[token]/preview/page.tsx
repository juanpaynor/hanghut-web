import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TicketOrderView, type TicketOrder, type TicketTemplate } from '@/components/tickets/ticket-order-view'

// Reading searchParams is a dynamic API, so this route is rendered per-request.
// That is exactly why it is a SEPARATE route: putting ?template= on the live
// /t/[token] page would have opted every real ticket out of ISR and sent each
// view to the database.
export const dynamic = 'force-dynamic'
// A preview is a working surface, not something to index or share around.
export const metadata = { robots: { index: false, follow: false } }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TEMPLATES = ['classic', 'boarding', 'minimal', 'stub'] as const
const LABELS: Record<TicketTemplate, string> = {
    classic: 'Classic',
    boarding: 'Boarding pass',
    minimal: 'Minimal',
    stub: 'Concert stub',
}

function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export default async function TicketPreviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>
    searchParams: Promise<{ template?: string }>
}) {
    const { token } = await params
    const { template: raw } = await searchParams
    if (!UUID_RE.test(token)) notFound()

    // Anything unrecognised falls through to the organizer's saved design rather
    // than erroring — a bad query string should never break the render.
    const override = TEMPLATES.includes(raw as TicketTemplate)
        ? (raw as TicketTemplate)
        : undefined

    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_ticket_order', { p_token: token })
    if (error || !data) notFound()

    return (
        <div>
            {/* Switcher. Nothing here writes to the database — changing the design
                for real still happens in Settings; this only changes THIS view. */}
            <div className="sticky top-0 z-50 border-b bg-amber-50 px-4 py-2.5">
                <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                        Preview
                    </span>
                    <span className="text-[11px] text-amber-900/70">
                        Buyers still see your saved design.
                    </span>
                    <div className="flex w-full flex-wrap gap-1.5">
                        {TEMPLATES.map((t) => (
                            <a
                                key={t}
                                href={`?template=${t}`}
                                className={
                                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors '
                                    + (override === t
                                        ? 'border-amber-500 bg-amber-500 text-white'
                                        : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100')
                                }
                            >
                                {LABELS[t]}
                            </a>
                        ))}
                        <a
                            href="?"
                            className={
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors '
                                + (override === undefined
                                    ? 'border-amber-500 bg-amber-500 text-white'
                                    : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100')
                            }
                        >
                            Saved design
                        </a>
                    </div>
                </div>
            </div>

            <TicketOrderView order={data as TicketOrder} templateOverride={override} />
        </div>
    )
}
