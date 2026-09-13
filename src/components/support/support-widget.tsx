'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Headset, X, ArrowLeft, Send, Paperclip, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSupportStream } from '@/lib/support/use-support-stream'
import {
    listSupportThreads,
    getSupportMessages,
    getSupportUnreadCount,
    openSupportThread,
    replyToSupportThread,
    markSupportThreadRead,
    uploadSupportAttachment,
    retractSupportMessage,
    type SupportThread,
    type SupportMessage,
} from '@/lib/support/actions'

/**
 * The organizer's support bubble.
 *
 * Deliberately NOT a live chat. There is no presence dot, no typing indicator
 * and no "an agent will be with you shortly" — two people answer these, and a
 * widget that implies someone is sitting there right now turns a reasonable
 * wait into a broken promise. It says when we reply, and it says it up front.
 *
 * Realtime is a convenience, not the transport. Support rides Ably like every
 * other chat surface (team_comms #306), the signal carries no message body, and
 * if the socket never connects the thread still refreshes when reopened. The
 * email notification is what actually reaches an organizer who closed the tab.
 */

const CATEGORIES = [
    { value: 'payouts', label: 'Payouts & balance' },
    { value: 'events', label: 'Events & seating' },
    { value: 'tickets', label: 'Tickets & attendees' },
    { value: 'account', label: 'Account & verification' },
    { value: 'technical', label: 'Something is broken' },
    { value: 'other', label: 'Something else' },
] as const

const STATUS_LABEL: Record<string, string> = {
    open: 'Open',
    pending: 'Waiting on you',
    resolved: 'Resolved',
    closed: 'Closed',
}

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return 'just now'
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
    return new Date(iso).toLocaleDateString()
}

type View = { name: 'list' } | { name: 'new' } | { name: 'thread'; id: string; reference: string }

export function SupportWidget({ currentPath }: { currentPath?: string }) {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<View>({ name: 'list' })
    const [threads, setThreads] = useState<SupportThread[]>([])
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(false)

    const refreshThreads = useCallback(async () => {
        setLoading(true)
        const [list, count] = await Promise.all([listSupportThreads(), getSupportUnreadCount()])
        setThreads(list)
        setUnread(count)
        setLoading(false)
    }, [])

    // The badge is the only thing that matters while the panel is shut, so it is
    // the only thing fetched. Once on mount, then when the panel opens.
    useEffect(() => {
        getSupportUnreadCount().then(setUnread).catch(() => {})
    }, [])

    useEffect(() => {
        if (open && view.name === 'list') void refreshThreads()
    }, [open, view.name, refreshThreads])

    return (
        <>
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={unread > 0 ? `Support — ${unread} unread` : 'Support'}
                    className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    <Headset className="h-6 w-6" />
                    {unread > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    )}
                </button>
            )}

            {open && (
                <div className="fixed bottom-6 right-6 z-40 flex h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
                    <header className="flex items-center gap-2 border-b px-4 py-3">
                        {view.name !== 'list' && (
                            <button
                                type="button"
                                onClick={() => setView({ name: 'list' })}
                                aria-label="Back"
                                className="-ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                                {view.name === 'thread' ? view.reference : 'Support'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {view.name === 'thread'
                                    ? 'We reply by email too'
                                    : 'We usually reply within a day'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close support"
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </header>

                    {view.name === 'list' && (
                        <ThreadList
                            threads={threads}
                            loading={loading}
                            onOpen={(t) => setView({ name: 'thread', id: t.id, reference: t.reference })}
                            onNew={() => setView({ name: 'new' })}
                        />
                    )}

                    {view.name === 'new' && (
                        <NewThread
                            currentPath={currentPath}
                            onCreated={(id, reference) => setView({ name: 'thread', id, reference })}
                        />
                    )}

                    {view.name === 'thread' && (
                        <Thread
                            ticketId={view.id}
                            status={threads.find((t) => t.id === view.id)?.status ?? 'open'}
                            onChanged={() => void refreshThreads()}
                            onStartNew={() => setView({ name: 'new' })}
                        />
                    )}
                </div>
            )}
        </>
    )
}

function ThreadList({
    threads,
    loading,
    onOpen,
    onNew,
}: {
    threads: SupportThread[]
    loading: boolean
    onOpen: (t: SupportThread) => void
    onNew: () => void
}) {
    return (
        <>
            <div className="flex-1 overflow-y-auto">
                {loading && threads.length === 0 && (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
                    </div>
                )}

                {!loading && threads.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                        <p className="text-sm font-medium">No conversations yet</p>
                        <p className="text-xs text-muted-foreground">
                            Stuck on something? Start a conversation and we&apos;ll pick it up.
                        </p>
                    </div>
                )}

                <ul className="divide-y">
                    {threads.map((t) => (
                        <li key={t.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(t)}
                                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{t.subject}</span>
                                    {t.organizer_unread > 0 && (
                                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono">{t.reference}</span>
                                    <Badge
                                        variant={t.status === 'resolved' ? 'secondary' : 'outline'}
                                        className="px-1.5 py-0 text-[10px] font-normal"
                                    >
                                        {STATUS_LABEL[t.status] ?? t.status}
                                    </Badge>
                                    <span className="ml-auto">{timeAgo(t.last_message_at)}</span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="border-t p-3">
                <Button onClick={onNew} className="w-full" size="sm">
                    Start a conversation
                </Button>
            </div>
        </>
    )
}

function NewThread({
    currentPath,
    onCreated,
}: {
    currentPath?: string
    onCreated: (id: string, reference: string) => void
}) {
    const [category, setCategory] = useState<string>('other')
    const [body, setBody] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const submit = () => {
        setError(null)
        startTransition(async () => {
            const result = await openSupportThread({ body, category, openedFromPath: currentPath })
            if ('error' in result) setError(result.error)
            else onCreated(result.id, result.reference)
        })
    }

    return (
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                What&apos;s this about?
            </label>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((c) => (
                    <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        className={cn(
                            'rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                            category === c.value
                                ? 'border-primary bg-primary/5 font-medium text-foreground'
                                : 'text-muted-foreground hover:bg-muted/60',
                        )}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Tell us what&apos;s happening
            </label>
            <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={8000}
                placeholder="The more detail the better — what you expected, what happened, and which event or payout it concerns."
                className="resize-none text-sm"
            />

            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

            <Button onClick={submit} disabled={pending || !body.trim()} className="mt-4" size="sm">
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
                You&apos;ll get an email when we reply.
            </p>
        </div>
    )
}

const TEMP_PREFIX = 'temp-'

function Thread({
    ticketId,
    status,
    onChanged,
    onStartNew,
}: {
    ticketId: string
    status: string
    /** Refresh the thread list behind this view — previews, unread, status. */
    onChanged: () => void
    onStartNew: () => void
}) {
    // Closed is final. Read it up front rather than letting someone type a
    // paragraph and discover it from a rejected insert — which is precisely
    // what we asked the app team NOT to do in team_comms #309, and then did.
    const isClosed = status === 'closed'
    const [messages, setMessages] = useState<SupportMessage[]>([])
    const [body, setBody] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [pending, startTransition] = useTransition()
    const bottomRef = useRef<HTMLDivElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const list = await getSupportMessages(ticketId)
        setMessages(list)
    }, [ticketId])

    useEffect(() => {
        void load()
        void markSupportThreadRead(ticketId).then(onChanged)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticketId])

    // Live updates over Ably. The signal carries no message text — it only says
    // "this thread moved" — so the refetch below is what actually produces the
    // message, under the same RLS as every other read.
    useSupportStream(
        [ticketId],
        () => {
            void load()
            void markSupportThreadRead(ticketId)
        },
    )

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    const send = () => {
        const text = body.trim()
        if (!text) return
        setError(null)

        // Show it immediately. A message that only appears after the round trip
        // reads as "did that send?" on a slow connection, and people send twice
        // — which is how support threads end up with duplicates in them.
        const tempId = `${TEMP_PREFIX}${crypto.randomUUID()}`
        setMessages((prev) => [
            ...prev,
            {
                id: tempId,
                sender: 'requester',
                body: text,
                created_at: new Date().toISOString(),
                sender_user_id: null,
                internal: false,
                deleted_at: null,
                attachments: [],
            },
        ])
        setBody('')

        startTransition(async () => {
            const result = await replyToSupportThread(ticketId, text)
            if ('error' in result) {
                // Take the bubble back and hand them their words — retyping a
                // paragraph because the network blinked is the worst version of
                // this.
                setMessages((prev) => prev.filter((m) => m.id !== tempId))
                setBody(text)
                setError(result.error)
            } else {
                await load()
                onChanged()
            }
        })
    }

    const retract = async (messageId: string) => {
        // Confirm, because it cannot be undone and because the thing being
        // removed is usually something the person is anxious about.
        if (!window.confirm('Remove this message for everyone? This cannot be undone.')) return
        setError(null)
        const result = await retractSupportMessage(messageId)
        if ('error' in result) setError(result.error)
        else {
            await load()
            // The list behind this shows a preview of the last message. Leaving
            // it stale would keep a just-removed line on screen — which, for the
            // pasted-secret case this exists for, is the whole failure.
            onChanged()
        }
    }

    const attach = async (file: File | undefined) => {
        if (!file) return
        setUploading(true)
        setError(null)
        const result = await uploadSupportAttachment(ticketId, file)
        if ('error' in result) setError(result.error)
        else await load()
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
    }

    return (
        <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={cn('flex', m.sender === 'requester' ? 'justify-end' : 'justify-start')}
                    >
                        <div
                            className={cn(
                                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                                m.sender === 'requester'
                                    ? 'bg-primary text-primary-foreground'
                                    : m.sender === 'system'
                                      ? 'bg-muted text-muted-foreground italic'
                                      : 'bg-muted',
                            )}
                        >
                            {m.sender === 'agent' && (
                                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                                    HangHut
                                </p>
                            )}
                            {m.deleted_at ? (
                                <p className="italic opacity-60">Message removed</p>
                            ) : (
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            )}
                            {m.attachments.map((a) =>
                                a.url ? (
                                    <a
                                        key={a.id}
                                        href={a.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 block"
                                    >
                                        {a.mime_type.startsWith('image/') ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={a.url}
                                                alt={a.file_name}
                                                className="max-h-48 w-full rounded-lg object-cover"
                                            />
                                        ) : (
                                            <span className="flex items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1.5 text-xs underline">
                                                <Paperclip className="h-3 w-3" />
                                                {a.file_name}
                                            </span>
                                        )}
                                    </a>
                                ) : (
                                    // The signed URL is short-lived; if signing failed,
                                    // say the file exists rather than render a dead link.
                                    <span key={a.id} className="mt-2 block text-xs opacity-60">
                                        {a.file_name} — reopen to load
                                    </span>
                                ),
                            )}
                            <div className="mt-1 flex items-center gap-2">
                                <p className="text-[10px] opacity-60">
                                    {m.id.startsWith(TEMP_PREFIX) ? 'Sending…' : timeAgo(m.created_at)}
                                </p>
                                {/* Yours, still standing, and still yours to take
                                    back — the case this exists for is a pasted key
                                    or password, which has no time limit. */}
                                {m.sender === 'requester' && !m.deleted_at && !m.id.startsWith(TEMP_PREFIX) && (
                                    <button
                                        type="button"
                                        onClick={() => void retract(m.id)}
                                        aria-label="Remove this message"
                                        className="text-[10px] underline opacity-60 transition-opacity hover:opacity-100"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {error && <p className="px-4 pb-1 text-xs text-destructive">{error}</p>}

            {isClosed ? (
                <div className="border-t p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                        This conversation is closed.
                    </p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={onStartNew}>
                        Start a new conversation
                    </Button>
                </div>
            ) : (
            <div className="border-t p-3">
                <div className="flex items-end gap-2">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                        className="hidden"
                        onChange={(e) => void attach(e.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        aria-label="Attach a screenshot"
                        className="mb-1 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </button>
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={2}
                        maxLength={8000}
                        placeholder="Reply…"
                        className="min-h-0 resize-none text-sm"
                        onKeyDown={(e) => {
                            // Enter sends, Shift+Enter breaks the line. This is a
                            // chat bubble and that is what every chat bubble does;
                            // requiring a modifier here meant people pressed Enter,
                            // got a newline, and pressed it again.
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                send()
                            }
                        }}
                    />
                    <Button
                        size="icon"
                        onClick={send}
                        disabled={pending || !body.trim()}
                        aria-label="Send"
                        className="mb-0.5 h-9 w-9 shrink-0"
                    >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
                {/* Only once it matters. A counter sitting at "8000 left" under
                    every empty box is noise; a textarea that silently stops
                    accepting keystrokes is a bug. */}
                {body.length > 7500 && (
                    <p className={cn(
                        'mt-1 text-right text-[10px]',
                        body.length >= 8000 ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                        {8000 - body.length} characters left
                    </p>
                )}
            </div>
            )}
        </>
    )
}
