'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Send, CheckCircle2, UserPlus, Inbox, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSupportStream } from '@/lib/support/use-support-stream'
import { getSupportMessages, type SupportMessage } from '@/lib/support/actions'
import {
    listAgentThreads,
    replyAsAgent,
    setThreadStatus,
    setThreadPriority,
    claimThread,
    type AgentThread,
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

    return (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <div className="rounded-xl border bg-white">
                <div className="flex gap-1 border-b p-2">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setFilter(f.value)}
                            className={cn(
                                'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                                filter === f.value
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:bg-slate-100',
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
                    {loading && threads.length === 0 && (
                        <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading
                        </div>
                    )}
                    {!loading && threads.length === 0 && (
                        <div className="flex flex-col items-center gap-2 p-10 text-center">
                            <Inbox className="h-8 w-8 text-slate-300" />
                            <p className="text-sm text-slate-500">Nothing here</p>
                        </div>
                    )}
                    <ul className="divide-y">
                        {threads.map((t) => (
                            <li key={t.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelected(t)}
                                    className={cn(
                                        'w-full px-4 py-3 text-left transition-colors',
                                        selected?.id === t.id ? 'bg-slate-50' : 'hover:bg-slate-50/60',
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-slate-900">
                                            {t.subject}
                                        </span>
                                        {t.agent_unread > 0 && (
                                            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                                        )}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-slate-500">
                                        {t.partner?.business_name ?? t.user_display_name ?? t.user_email ?? 'Unknown'}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                        <span className="font-mono">{t.reference}</span>
                                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                                            {t.category}
                                        </Badge>
                                        {(t.priority === 'high' || t.priority === 'urgent') && (
                                            <Badge
                                                className={cn(
                                                    'px-1.5 py-0 text-[10px] font-medium',
                                                    t.priority === 'urgent'
                                                        ? 'bg-red-600 text-white hover:bg-red-600'
                                                        : 'bg-amber-100 text-amber-900 hover:bg-amber-100',
                                                )}
                                            >
                                                {t.priority}
                                            </Badge>
                                        )}
                                        {t.source === 'app_user' && (
                                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                                                app
                                            </Badge>
                                        )}
                                        {t.status === 'pending' && (
                                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-slate-500">
                                                waiting on them
                                            </Badge>
                                        )}
                                        <span className="ml-auto">{when(t.last_message_at)}</span>
                                    </div>
                                    {(() => {
                                        // Only ever shown for threads waiting on US —
                                        // see waitingHours. A day is the line because the
                                        // widget promises a reply "within a day".
                                        const w = waitingHours(t)
                                        if (w === null || w < 24) return null
                                        return (
                                            <p className={cn(
                                                'mt-1 text-[11px] font-medium',
                                                w >= 72 ? 'text-red-600' : 'text-amber-600',
                                            )}>
                                                Unanswered for {Math.floor(w / 24)}d
                                            </p>
                                        )
                                    })()}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {selected ? (
                <AgentThreadView
                    key={selected.id}
                    thread={selected}
                    currentUserId={currentUserId}
                    onChanged={() => void refresh(filter)}
                />
            ) : (
                <div className="flex items-center justify-center rounded-xl border bg-white p-16 text-sm text-slate-500">
                    Select a conversation
                </div>
            )}
        </div>
    )
}

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
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()
    const bottomRef = useRef<HTMLDivElement>(null)

    const load = useCallback(async () => {
        // The console is the one surface that should see internal notes.
        setMessages(await getSupportMessages(thread.id, { includeInternal: true }))
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

    return (
        <div className="flex max-h-[calc(100vh-12rem)] flex-col rounded-xl border bg-white">
            <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{thread.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                        <span className="font-mono">{thread.reference}</span>
                        {' · '}
                        {thread.partner?.business_name ?? thread.user_display_name ?? thread.user_email ?? 'Unknown'}
                        {thread.opened_from_path && (
                            <>
                                {' · from '}
                                <span className="font-mono">{thread.opened_from_path}</span>
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
                        'h-8 rounded-md border px-2 text-xs font-medium',
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
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setThreadStatus(thread.id, 'resolved'))}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Resolve
                    </Button>
                )}
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.map((m) => (
                    <div key={m.id} className={cn('flex', m.sender === 'agent' ? 'justify-end' : 'justify-start')}>
                        <div
                            className={cn(
                                'max-w-[70%] rounded-2xl px-3.5 py-2 text-sm',
                                // An internal note must never look like something
                                // the requester can see. Amber and labelled, not
                                // the same blue as a real reply.
                                m.internal
                                    ? 'border border-amber-300 bg-amber-50 text-amber-900'
                                    : m.sender === 'agent'
                                      ? 'bg-blue-600 text-white'
                                      : m.sender === 'system'
                                        ? 'bg-slate-100 italic text-slate-500'
                                        : 'bg-slate-100 text-slate-900',
                            )}
                        >
                            {m.internal && (
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
                                    Internal note — not visible to them
                                </p>
                            )}
                            {m.deleted_at ? (
                                // The row stays so an agent can see that something
                                // WAS here — a thread that silently loses a message
                                // reads as an agent misremembering.
                                <p className="italic opacity-70">Removed by the sender</p>
                            ) : (
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            )}
                            {m.attachments.map((a) =>
                                a.url ? (
                                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                                        {a.mime_type.startsWith('image/') ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={a.url} alt={a.file_name} className="max-h-64 w-full rounded-lg object-contain" />
                                        ) : (
                                            <span className="flex items-center gap-1.5 rounded-lg bg-black/10 px-2 py-1.5 text-xs underline">
                                                <Paperclip className="h-3 w-3" />
                                                {a.file_name}
                                            </span>
                                        )}
                                    </a>
                                ) : (
                                    <span key={a.id} className="mt-2 block text-xs opacity-60">
                                        {a.file_name} — reopen to load
                                    </span>
                                ),
                            )}
                            <p className="mt-1 text-[10px] opacity-60">{when(m.created_at)} ago</p>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {error && <p className="px-5 pb-1 text-xs text-red-600">{error}</p>}

            <div className="border-t p-4">
                {body.length > 7500 && (
                    <p className={cn(
                        'mb-1 text-right text-[10px]',
                        body.length >= 8000 ? 'text-red-600' : 'text-slate-500',
                    )}>
                        {8000 - body.length} characters left
                    </p>
                )}
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    maxLength={8000}
                    placeholder="Reply… (⌘↵ to send)"
                    className="resize-none text-sm"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                    }}
                />
                <div className="mt-2 flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                        <input
                            type="checkbox"
                            checked={internal}
                            onChange={(e) => setInternal(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        Internal note
                    </label>
                    <Button size="sm" onClick={send} disabled={pending || !body.trim()}>
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {internal ? 'Save note' : 'Send reply'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
