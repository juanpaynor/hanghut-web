'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
    Loader2, Send, CheckCircle2, UserPlus, Inbox, Paperclip,
    Lock, ChevronDown, MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSupportStream } from '@/lib/support/use-support-stream'
import { getSupportMessages, type SupportMessage } from '@/lib/support/actions'
import {
    listAgentThreads,
    replyAsAgent,
    setThreadStatus,
    setThreadPriority,
    claimThread,
    getTicketContext,
    type AgentThread,
    type TicketContext,
} from '@/lib/support/agent-actions'

type Filter = 'inbox' | 'mine' | 'resolved'

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'inbox', label: 'Inbox' },
    { value: 'mine', label: 'Mine' },
    { value: 'resolved', label: 'Resolved' },
]

/**
 * Hours a thread has been waiting on US. Only counts when the requester spoke
 * last — a thread where we already answered is not ageing, it is theirs to
 * reply to, and colouring it red would bury the ones that actually need work.
 */
function waitingHours(t: AgentThread): number | null {
    if (t.last_sender !== 'requester') return null
    if (t.status === 'resolved' || t.status === 'closed') return null
    return (Date.now() - new Date(t.last_message_at).getTime()) / 3_600_000
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/**
 * Queue order: what needs answering, worst first.
 *
 * Unanswered beats answered, then priority, then oldest — so the thing at the
 * top is always the one that has been waiting longest at the highest stake.
 * Plain last_message_at ordering (what this had) surfaces the most RECENT
 * message, which is the opposite: it hides the ticket nobody has touched for
 * two days under whatever just came in.
 */
function triageSort(a: AgentThread, b: AgentThread): number {
    const aw = waitingHours(a)
    const bw = waitingHours(b)
    if ((aw === null) !== (bw === null)) return aw === null ? 1 : -1

    const ap = PRIORITY_RANK[a.priority ?? 'normal'] ?? 2
    const bp = PRIORITY_RANK[b.priority ?? 'normal'] ?? 2
    if (ap !== bp) return ap - bp

    if (aw !== null && bw !== null) return bw - aw
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
}

function when(iso: string) {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return 'just now'
    if (secs < 3600) return `${Math.floor(secs / 60)}m`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`
    if (secs < 604800) return `${Math.floor(secs / 86400)}d`
    return new Date(iso).toLocaleDateString()
}

function clockTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

/** Date divider label. Today and Yesterday by name; everything else dated. */
function dayLabel(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
    if (same(d, today)) return 'Today'
    const yest = new Date(today)
    yest.setDate(yest.getDate() - 1)
    if (same(d, yest)) return 'Yesterday'
    return d.toLocaleDateString('en-PH', {
        weekday: 'short', month: 'short', day: 'numeric',
        year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })
}

function initials(name: string | null | undefined) {
    const s = (name ?? '').trim()
    if (!s) return '?'
    const parts = s.split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function peso(n: number) {
    return `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function since(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

/**
 * Who is writing — the PERSON, then the organization they write on behalf of.
 *
 * This led with the business name, which told an agent which account was
 * affected but never who they were about to talk to. Worse, for an app user
 * with no partner at all it fell through to "Unknown" while their name sat in
 * the users table the whole time: nothing had ever copied it onto the ticket
 * (fixed in 20260913140000).
 */
function threadWho(t: AgentThread) {
    return t.user_display_name ?? t.user_email ?? t.partner?.business_name ?? 'Unknown'
}

/** The org, only when it says something the name above did not. */
function threadOrg(t: AgentThread) {
    const org = t.partner?.business_name
    return org && org !== threadWho(t) ? org : null
}

/* ─────────────────────────────────────────────────────────────────────────────
   The console is a three-pane app, not a page: queue, conversation, context.
   It owns the full viewport and never scrolls as a whole — each pane scrolls
   itself, so the composer stays reachable and the queue stays visible while an
   agent reads down a long thread.
   ────────────────────────────────────────────────────────────────────────── */

export function SupportQueue({
    initialThreads,
    currentUserId,
}: {
    initialThreads: AgentThread[]
    currentUserId: string | null
}) {
    const [filter, setFilter] = useState<Filter>('inbox')
    const [threads, setThreads] = useState<AgentThread[]>(initialThreads)
    const [selected, setSelected] = useState<AgentThread | null>(initialThreads[0] ?? null)
    const [loading, setLoading] = useState(false)

    const refresh = useCallback(
        async (f: Filter) => {
            setLoading(true)
            const list = (await listAgentThreads(f)).sort(triageSort)
            setThreads(list)
            setSelected((prev) => list.find((t) => t.id === prev?.id) ?? list[0] ?? null)
            setLoading(false)
        },
        [],
    )

    useEffect(() => {
        void refresh(filter)
    }, [filter, refresh])

    // A reply on any thread already in the queue refreshes the list instantly.
    // Agents hold a namespace-wide token, so this is one connection carrying
    // every visible thread rather than one per row.
    useSupportStream(
        threads.map((t) => t.id),
        () => void refresh(filter),
        true,
    )

    // The 60s poll that used to live here is gone. It existed because a
    // brand-new ticket has no channel in the list to subscribe to, and because
    // the app writes tickets directly through RLS so our server never ran to
    // announce one. Both halves now publish to the shared queue channel above
    // (team_comms #314 Q5), which is subscribed for agents — so a new thread,
    // and a reply on one outside the current filter, arrive as signals rather
    // than on a timer.

    const unanswered = threads.filter((t) => waitingHours(t) !== null).length

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* ── Queue ─────────────────────────────────────────────────── */}
            <aside className="flex w-[20rem] shrink-0 flex-col border-r border-slate-200 bg-white 2xl:w-[23rem]">
                <div className="flex items-center gap-1 border-b border-slate-100 p-2">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setFilter(f.value)}
                            className={cn(
                                'flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                                filter === f.value
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* The one number that decides whether anyone needs to act. */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
                    </span>
                    {unanswered > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700">
                            {unanswered} awaiting reply
                        </span>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {loading && threads.length === 0 && (
                        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading
                        </div>
                    )}
                    {!loading && threads.length === 0 && (
                        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                            <Inbox className="h-9 w-9 text-slate-200" />
                            <p className="text-sm font-medium text-slate-500">
                                {filter === 'mine' ? 'Nothing assigned to you' : 'Nothing here'}
                            </p>
                        </div>
                    )}
                    <ul>
                        {threads.map((t) => {
                            const active = selected?.id === t.id
                            const w = waitingHours(t)
                            const hot = t.priority === 'urgent' || t.priority === 'high'
                            return (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(t)}
                                        className={cn(
                                            'relative w-full border-b border-slate-100 py-3.5 pl-5 pr-4 text-left transition-colors',
                                            active ? 'bg-indigo-50/70' : 'hover:bg-slate-50',
                                        )}
                                    >
                                        {/* Selection and stake both read at the
                                            left edge: a rail for the open thread,
                                            a coloured one when it also matters. */}
                                        <span
                                            aria-hidden
                                            className={cn(
                                                'absolute inset-y-0 left-0 w-[3px]',
                                                active
                                                    ? 'bg-indigo-600'
                                                    : t.priority === 'urgent'
                                                      ? 'bg-red-500'
                                                      : t.priority === 'high'
                                                        ? 'bg-amber-400'
                                                        : 'bg-transparent',
                                            )}
                                        />
                                        <div className="flex items-start gap-2">
                                            <span className={cn(
                                                'min-w-0 flex-1 truncate text-[15px] leading-snug',
                                                t.agent_unread > 0
                                                    ? 'font-semibold text-slate-900'
                                                    : 'font-medium text-slate-700',
                                            )}>
                                                {t.subject}
                                            </span>
                                            <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-slate-400">
                                                {when(t.last_message_at)}
                                            </span>
                                        </div>

                                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-500">
                                            {t.agent_unread > 0 && (
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                                            )}
                                            <span className="truncate">{threadWho(t)}</span>
                                            {threadOrg(t) && (
                                                <span className="shrink truncate text-slate-400">
                                                    · {threadOrg(t)}
                                                </span>
                                            )}
                                        </p>

                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                            <span className="font-mono text-[11px] text-slate-400">{t.reference}</span>
                                            <Chip>{t.category}</Chip>
                                            {hot && (
                                                <Chip tone={t.priority === 'urgent' ? 'danger' : 'warn'}>
                                                    {t.priority}
                                                </Chip>
                                            )}
                                            {t.source === 'app_user' && <Chip>app</Chip>}
                                            {t.status === 'pending' && <Chip>waiting on them</Chip>}
                                        </div>

                                        {/* Only ever shown for threads waiting on US —
                                            see waitingHours. A day is the line because the
                                            widget promises a reply "within a day". */}
                                        {w !== null && w >= 24 && (
                                            <p className={cn(
                                                'mt-2 text-[11px] font-semibold',
                                                w >= 72 ? 'text-red-600' : 'text-amber-600',
                                            )}>
                                                Unanswered for {Math.floor(w / 24)}d
                                            </p>
                                        )}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </aside>

            {selected ? (
                <AgentThreadView
                    key={selected.id}
                    thread={selected}
                    currentUserId={currentUserId}
                    onChanged={() => void refresh(filter)}
                />
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50">
                    <MessageSquare className="h-10 w-10 text-slate-200" />
                    <p className="text-sm text-slate-400">Select a conversation</p>
                </div>
            )}
        </div>
    )
}

/** One small fact about a thread. Uniform shape so a row scans as a row. */
function Chip({
    children,
    tone = 'plain',
}: {
    children: React.ReactNode
    tone?: 'plain' | 'warn' | 'danger' | 'good'
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
                tone === 'plain' && 'bg-slate-100 text-slate-600',
                tone === 'warn' && 'bg-amber-100 text-amber-800',
                tone === 'danger' && 'bg-red-100 text-red-700',
                tone === 'good' && 'bg-emerald-100 text-emerald-800',
            )}
        >
            {children}
        </span>
    )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Context
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Who is asking, and the facts behind the question they are most likely asking.
 *
 * Ordered by the ticket's CATEGORY rather than showing everything at equal
 * weight — a payouts ticket leads with payouts, a tickets ticket leads with
 * what they bought. A panel that shows fifteen facts with no hierarchy is a
 * panel an agent stops reading.
 *
 * This lives in its own rail rather than above the conversation, which is where
 * it started. Stacked on top it pushed the newest message off the bottom of the
 * pane and clipped the one before it — the agent had to scroll past the
 * customer's file to reach the sentence they were answering.
 */
function ContextBody({ thread, ctx }: { thread: AgentThread; ctx: TicketContext | null }) {
    if (!ctx) return null

    const money = thread.category === 'payouts'
    const kycBad = ctx.partner && ctx.partner.kyc_status !== 'verified'
    const lastPayoutBad = ctx.payouts?.last && ['rejected', 'failed'].includes(ctx.payouts.last.status)

    const payouts = ctx.payouts && (
        <Card title="Payouts">
            {ctx.payouts.last ? (
                <p className={cn('text-[13px] text-slate-700', lastPayoutBad && 'font-semibold text-red-700')}>
                    Last {peso(ctx.payouts.last.amount)} — {ctx.payouts.last.status}
                    <span className="text-slate-400"> · {when(ctx.payouts.last.created_at)} ago</span>
                </p>
            ) : (
                <p className="text-[13px] text-slate-700">Never requested a payout</p>
            )}
            <p className="mt-1 text-[12px] text-slate-500">
                {ctx.payouts.in_flight} in flight · {peso(ctx.payouts.paid_out_total)} paid out to date
            </p>
        </Card>
    )

    const purchases = ctx.recent_purchases.length > 0 && (
        <Card title="Recent purchases">
            <ul className="space-y-1.5">
                {ctx.recent_purchases.slice(0, 6).map((p, i) => (
                    <li key={i} className="text-[13px]">
                        <p className="truncate text-slate-700">{p.event}</p>
                        <p className="text-[12px] tabular-nums text-slate-400">
                            {p.quantity}× · {peso(p.total)} · {p.status}
                        </p>
                    </li>
                ))}
            </ul>
        </Card>
    )

    return (
        <div className="space-y-4">
            {/* Identity */}
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[13px] font-semibold text-slate-600">
                    {initials(ctx.person?.display_name ?? thread.user_display_name)}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-slate-900">
                        {ctx.person?.display_name ?? thread.user_display_name ?? 'Unknown'}
                    </p>
                    {ctx.person?.email && (
                        <a
                            href={`mailto:${ctx.person.email}`}
                            className="block truncate text-[13px] text-indigo-600 hover:underline"
                        >
                            {ctx.person.email}
                        </a>
                    )}
                    {ctx.person && (
                        <p className="mt-0.5 text-[12px] text-slate-400">
                            Member since {since(ctx.person.member_since)}
                        </p>
                    )}
                </div>
            </div>

            {ctx.person?.status && ctx.person.status !== 'active' && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
                    Account {ctx.person.status}
                </div>
            )}

            {/* Organizer */}
            {ctx.partner && (
                <Card title="Organizer">
                    <p className="truncate text-[14px] font-semibold text-slate-900">
                        {ctx.partner.business_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">
                        {ctx.partner.events} events · since {since(ctx.partner.since)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <Chip tone={kycBad ? 'warn' : 'good'}>KYC {ctx.partner.kyc_status ?? 'none'}</Chip>
                        {/* Main wallet changes the true answer to "where is my
                            money" — we hold it, not their own Xendit sub-account. */}
                        {ctx.partner.use_main_wallet && <Chip>platform managed</Chip>}
                    </div>
                </Card>
            )}

            {/* Whichever answers this ticket goes first. */}
            {money ? <>{payouts}{purchases}</> : <>{purchases}{payouts}</>}
        </div>
    )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {title}
            </p>
            {children}
        </div>
    )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Conversation
   ────────────────────────────────────────────────────────────────────────── */

function AgentThreadView({
    thread,
    currentUserId,
    onChanged,
}: {
    thread: AgentThread
    currentUserId: string | null
    onChanged: () => void
}) {
    const [messages, setMessages] = useState<SupportMessage[]>([])
    const [body, setBody] = useState('')
    const [internal, setInternal] = useState(false)
    const [ctx, setCtx] = useState<TicketContext | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()
    const bottomRef = useRef<HTMLDivElement>(null)

    const load = useCallback(async () => {
        // The console is the one surface that should see internal notes.
        const [msgs, context] = await Promise.all([
            getSupportMessages(thread.id, { includeInternal: true }),
            getTicketContext(thread.id),
        ])
        setMessages(msgs)
        setCtx(context)
    }, [thread.id])

    useEffect(() => {
        void load()
    }, [load])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    const send = () => {
        const text = body
        setError(null)
        startTransition(async () => {
            const result = await replyAsAgent(thread.id, text, internal)
            if ('error' in result) setError(result.error)
            else {
                setBody('')
                // Back to a real reply every time. A note is a deliberate act;
                // a sticky checkbox means the NEXT message an agent types —
                // meant for the customer — silently files as another note. It
                // looks sent in here, the customer never receives it, and the
                // only cue is a colour the agent has already stopped noticing.
                // That is exactly what happened on HH-1011.
                setInternal(false)
                await load()
                onChanged()
            }
        })
    }

    const act = (fn: () => Promise<unknown>) => startTransition(async () => {
        await fn()
        onChanged()
    })

    // Day dividers, and an avatar only where the speaker actually changes — a
    // column of identical badges down a back-and-forth is noise, and the eye
    // needs the marker exactly at the handover.
    const rows = useMemo(() => {
        let lastDay = ''
        let lastSender = ''
        return messages.map((m) => {
            const day = new Date(m.created_at).toDateString()
            const newDay = day !== lastDay
            const newSpeaker = newDay || m.sender !== lastSender
            lastDay = day
            lastSender = m.sender
            return { m, newDay, newSpeaker }
        })
    }, [messages])

    return (
        <>
            <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-6 py-3.5">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[17px] font-semibold leading-tight text-slate-900">
                            {thread.subject}
                        </h2>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 truncate text-[12px] text-slate-500">
                            <span className="font-mono text-slate-400">{thread.reference}</span>
                            <span className="text-slate-300">·</span>
                            <span>{threadWho(thread)}</span>
                            {threadOrg(thread) && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    <span>{threadOrg(thread)}</span>
                                </>
                            )}
                            {thread.opened_from_path && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-mono text-slate-400">
                                        from {thread.opened_from_path}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>

                    {thread.assigned_to !== currentUserId && (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => claimThread(thread.id))}>
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                            Claim
                        </Button>
                    )}
                    {/* Escalation at this size is not a ladder — there is no tier 2 to
                        escalate to. It is "make this one impossible to miss", which is
                        priority plus the Claim above. */}
                    <select
                        aria-label="Priority"
                        value={thread.priority ?? 'normal'}
                        disabled={pending}
                        onChange={(e) =>
                            act(() => setThreadPriority(thread.id, e.target.value as 'low' | 'normal' | 'high' | 'urgent'))
                        }
                        className={cn(
                            'h-9 rounded-lg border bg-white px-2.5 text-[13px] font-medium',
                            thread.priority === 'urgent'
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : thread.priority === 'high'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 text-slate-600',
                        )}
                    >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                    </select>
                    {/* "Waiting on them" existed as a status from day one and had no
                        way to be set, so every thread sat in Inbox whether or not the
                        ball was in our court. */}
                    {thread.status !== 'pending' && thread.status !== 'resolved' && thread.status !== 'closed' && (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setThreadStatus(thread.id, 'pending'))}>
                            Waiting on them
                        </Button>
                    )}
                    {thread.status !== 'resolved' && (
                        <Button size="sm" disabled={pending} onClick={() => act(() => setThreadStatus(thread.id, 'resolved'))}>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Resolve
                        </Button>
                    )}
                </header>

                {/* Below xl the rail has nowhere to go, so the same facts fold
                    into a disclosure rather than disappearing. */}
                {ctx && (
                    <details className="group border-b border-slate-200 bg-white xl:hidden">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50">
                            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                            <span className="font-medium text-slate-900">
                                {ctx.person?.display_name ?? threadWho(thread)}
                            </span>
                            {ctx.person?.email && <span className="truncate text-slate-400">{ctx.person.email}</span>}
                        </summary>
                        <div className="px-6 pb-4">
                            <ContextBody thread={thread} ctx={ctx} />
                        </div>
                    </details>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                    <div className="mx-auto flex max-w-3xl flex-col gap-1">
                        {rows.map(({ m, newDay, newSpeaker }) => (
                            <div key={m.id}>
                                {newDay && (
                                    <div className="my-5 flex items-center gap-3">
                                        <span className="h-px flex-1 bg-slate-200" />
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                            {dayLabel(m.created_at)}
                                        </span>
                                        <span className="h-px flex-1 bg-slate-200" />
                                    </div>
                                )}

                                {m.sender === 'system' ? (
                                    <p className="py-2 text-center text-[12px] italic text-slate-400">
                                        {m.body}
                                    </p>
                                ) : (
                                    <div
                                        className={cn(
                                            'flex items-end gap-2.5',
                                            m.sender === 'agent' ? 'flex-row-reverse' : 'flex-row',
                                            newSpeaker ? 'mt-4' : 'mt-1',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                                                !newSpeaker && 'invisible',
                                                m.sender === 'agent'
                                                    ? 'bg-indigo-100 text-indigo-700'
                                                    : 'bg-slate-200 text-slate-600',
                                            )}
                                        >
                                            {m.sender === 'agent'
                                                ? 'HH'
                                                : initials(ctx?.person?.display_name ?? thread.user_display_name)}
                                        </span>

                                        <div className={cn('min-w-0 max-w-[min(38rem,82%)]')}>
                                            <div
                                                className={cn(
                                                    'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                                                    // An internal note must never look like something
                                                    // the requester can see. Amber and labelled, not
                                                    // the same indigo as a real reply.
                                                    m.internal
                                                        ? 'border border-amber-300 bg-amber-50 text-amber-900'
                                                        : m.sender === 'agent'
                                                          ? 'rounded-br-md bg-indigo-600 text-white'
                                                          : 'rounded-bl-md border border-slate-200 bg-white text-slate-900',
                                                )}
                                            >
                                                {m.internal && (
                                                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
                                                        <Lock className="h-3 w-3" />
                                                        Internal note — not visible to them
                                                    </p>
                                                )}
                                                {m.deleted_at ? (
                                                    // The row stays so an agent can see that something
                                                    // WAS here — a thread that silently loses a message
                                                    // reads as an agent misremembering.
                                                    <p className="italic opacity-70">Removed by the sender</p>
                                                ) : (
                                                    m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                )}
                                                {m.attachments.map((a) =>
                                                    a.url ? (
                                                        <a
                                                            key={a.id}
                                                            href={a.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={cn('block', m.body && 'mt-2')}
                                                        >
                                                            {a.mime_type.startsWith('image/') ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={a.url}
                                                                    alt={a.file_name}
                                                                    className="max-h-80 w-full rounded-xl object-contain"
                                                                />
                                                            ) : (
                                                                <span className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 text-[13px] underline">
                                                                    <Paperclip className="h-3.5 w-3.5" />
                                                                    {a.file_name}
                                                                </span>
                                                            )}
                                                        </a>
                                                    ) : (
                                                        <span key={a.id} className="mt-2 block text-[13px] opacity-60">
                                                            {a.file_name} — reopen to load
                                                        </span>
                                                    ),
                                                )}
                                            </div>
                                            {/* Outside the bubble: a timestamp set in
                                                low-opacity white on indigo was the least
                                                legible text on the page. */}
                                            <p
                                                className={cn(
                                                    'mt-1 px-1 text-[11px] tabular-nums text-slate-400',
                                                    m.sender === 'agent' && 'text-right',
                                                )}
                                            >
                                                {clockTime(m.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                </div>

                {/* ── Composer ──────────────────────────────────────────── */}
                <div className={cn(
                    'border-t px-6 py-4 transition-colors',
                    internal ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white',
                )}>
                    <div className="mx-auto max-w-3xl">
                        {error && <p className="mb-2 text-[13px] font-medium text-red-600">{error}</p>}

                        {internal && (
                            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-amber-800">
                                <Lock className="h-3.5 w-3.5" />
                                Internal note — they will not see this
                            </p>
                        )}

                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={3}
                            maxLength={8000}
                            placeholder={internal ? 'Note for the team…' : 'Write a reply…'}
                            className={cn(
                                'resize-none rounded-xl bg-white text-[15px] leading-relaxed',
                                internal && 'border-amber-300 focus-visible:ring-amber-400',
                            )}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                            }}
                        />

                        <div className="mt-2.5 flex items-center gap-3">
                            {/* A toggle, not a checkbox. The mode it selects
                                repaints the whole composer, so the control that
                                selects it has to look like a mode. */}
                            <button
                                type="button"
                                onClick={() => setInternal((v) => !v)}
                                aria-pressed={internal}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                                    internal
                                        ? 'border-amber-400 bg-amber-100 text-amber-900'
                                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                                )}
                            >
                                <Lock className="h-3.5 w-3.5" />
                                Internal note
                            </button>

                            {body.length > 7500 && (
                                <span className={cn(
                                    'text-[12px] tabular-nums',
                                    body.length >= 8000 ? 'font-semibold text-red-600' : 'text-slate-500',
                                )}>
                                    {8000 - body.length} left
                                </span>
                            )}

                            <span className="ml-auto hidden text-[12px] text-slate-400 sm:inline">
                                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px]">⌘↵</kbd>
                                {' to send'}
                            </span>

                            <Button
                                onClick={send}
                                disabled={pending || !body.trim()}
                                className={cn(internal && 'bg-amber-600 hover:bg-amber-700')}
                            >
                                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {internal ? 'Save note' : 'Send reply'}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Context rail ──────────────────────────────────────────── */}
            <aside className="hidden w-[19rem] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 xl:flex 2xl:w-[21rem]">
                {ctx ? (
                    <ContextBody thread={thread} ctx={ctx} />
                ) : (
                    <div className="flex items-center gap-2 text-[13px] text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading
                    </div>
                )}
            </aside>
        </>
    )
}
