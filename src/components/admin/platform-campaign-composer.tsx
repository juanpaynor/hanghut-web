'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send, Users, ShieldCheck, AlertTriangle, Sparkles, Wand2, CalendarPlus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/organizer/marketing/rich-text-editor'
import {
    getPlatformAudienceCounts,
    getPlatformRecipients,
    getPlatformSender,
    getPlatformEventOptions,
} from '@/lib/admin/marketing-actions'
import { PLATFORM_AUDIENCES, type PlatformAudience } from '@/lib/admin/platform-audiences'
import { checkEmailList } from '@/lib/marketing/email-check-actions'
import { buildEventEmailBlock } from '@/lib/marketing/actions'
import { cn } from '@/lib/utils'

/**
 * HangHut's own campaign composer.
 *
 * Sends through the SAME pipeline organizers use — send-promotional-email →
 * email_send_queue → process-email-queue — so suppression, the unsubscribe
 * footer, idempotency, delivery stats and the Resend webhook all apply without
 * a second implementation. The only thing that differs is who the audience is.
 */

/**
 * Searchable event picker. Debounced server-side search rather than a fetched
 * dropdown: there are 280+ events and a <select> of all of them is unusable.
 */
function EventPicker({ onPick, placeholder, autoFocus }: {
    onPick: (e: { id: string; title: string }) => void
    placeholder?: string
    autoFocus?: boolean
}) {
    const [q, setQ] = useState('')
    const [options, setOptions] = useState<{ id: string; title: string }[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setLoading(true)
        const t = setTimeout(() => {
            getPlatformEventOptions(q).then(r => { setOptions(r); setLoading(false) })
        }, 250)
        return () => clearTimeout(t)
    }, [q])

    return (
        <div className="space-y-2">
            <Input
                value={q}
                autoFocus={autoFocus}
                onChange={e => setQ(e.target.value)}
                placeholder={placeholder ?? 'Search events…'}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border">
                {loading && options.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                )}
                {!loading && options.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No events match that.</p>
                )}
                {options.map(o => (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => onPick(o)}
                        className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    >
                        {o.title}
                    </button>
                ))}
            </div>
        </div>
    )
}

export function PlatformCampaignComposer() {
    const { toast } = useToast()
    const supabase = createClient()

    const [sender, setSender] = useState<{ id?: string; name?: string; error?: string }>({})
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [audience, setAudience] = useState<PlatformAudience>('all_buyers')
    const [eventId, setEventId] = useState('')
    const [eventQuery, setEventQuery] = useState('')
    const [days, setDays] = useState(180)

    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [testing, setTesting] = useState(false)
    const [editorKey, setEditorKey] = useState(0)

    // Write with AI (Groq, via the ai-marketing-copy edge function — the same
    // one organizers use, so platform copy and partner copy come out of one
    // prompt and one model policy).
    const [aiOpen, setAiOpen] = useState(false)
    const [aiBrief, setAiBrief] = useState('')
    const [aiTone, setAiTone] = useState('Friendly & fun')
    const [aiGenerating, setAiGenerating] = useState(false)
    const [aiResult, setAiResult] = useState<{ subjects: string[]; html: string } | null>(null)
    const [aiSubject, setAiSubject] = useState('')
    // The event the AI should write ABOUT. Kept separate from the audience's
    // event filter: "everyone who bought show A" and "write about show B" are
    // different questions, and conflating them silently writes the wrong email.
    const [aiEvent, setAiEvent] = useState<{ id: string; title: string } | null>(null)

    // Insert a real event card into the body.
    const [insertOpen, setInsertOpen] = useState(false)
    const [inserting, setInserting] = useState(false)

    const selected = useMemo(
        () => PLATFORM_AUDIENCES.find(a => a.value === audience)!,
        [audience],
    )

    useEffect(() => {
        getPlatformSender().then(setSender)
        getPlatformAudienceCounts().then(r => { if (r.data) setCounts(r.data) })
    }, [])


    const audienceReady = !selected.needsEvent || !!eventId
    const known = counts[audience]

    const resolve = async () => {
        const res = await getPlatformRecipients(audience, { eventId: eventId || undefined, days })
        if (res.error) {
            toast({ title: 'Could not resolve audience', description: res.error, variant: 'destructive' })
            return null
        }
        return res.data ?? []
    }

    const sendTest = async () => {
        if (!subject.trim() || !content.trim()) {
            toast({ title: 'Add a subject and some content first', variant: 'destructive' })
            return
        }
        setTesting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) throw new Error('No address on your account to send to.')
            const { data, error } = await supabase.functions.invoke('send-promotional-email', {
                body: {
                    partner_id: sender.id,
                    subject,
                    html_content: content,
                    sender_name: sender.name ?? 'HangHut',
                    test_recipient: user.email,
                },
            })
            if (error) throw new Error(error.message)
            if (!data?.success) throw new Error(data?.error || 'Test send failed')
            toast({ title: 'Test sent', description: `Check ${user.email}.` })
        } catch (e: any) {
            toast({ title: 'Test failed', description: e.message, variant: 'destructive' })
        } finally {
            setTesting(false)
        }
    }

    const generateAi = async () => {
        if (!aiBrief.trim()) return
        setAiGenerating(true)
        setAiResult(null)
        try {
            // The audience is part of the brief, not an afterthought. "Write to
            // people who haven't bought in six months" produces different copy
            // from "write to everyone", and the model cannot know which this is
            // unless we say so.
            const who = selected.label.toLowerCase()
            const { data, error } = await supabase.functions.invoke('ai-marketing-copy', {
                body: {
                    brief: `${aiBrief.trim()}\n\nThis email goes to HangHut's ${who} — ${selected.description}`
                        + (aiEvent ? `\nIt is about the event "${aiEvent.title}".` : ''),
                    tone: aiTone,
                    // Real event context — title, date, venue, price — so the
                    // model quotes facts instead of inventing them. The
                    // function refuses to fabricate specifics it was not given.
                    event_id: aiEvent?.id || undefined,
                    business_name: sender.name ?? 'HangHut',
                },
            })
            if (error) throw new Error(error.message || 'Failed to generate')
            if (data?.error) throw new Error(data.error)
            setAiResult(data)
            setAiSubject(data.subjects?.[0] || '')
        } catch (e: any) {
            toast({ title: 'Could not generate copy', description: e.message, variant: 'destructive' })
        } finally {
            setAiGenerating(false)
        }
    }

    const applyAi = () => {
        if (!aiResult) return
        if (aiSubject) setSubject(aiSubject)
        setContent(aiResult.html)
        // RichTextEditor is uncontrolled, so it only picks up new content on
        // remount.
        setEditorKey(k => k + 1)
        setAiOpen(false)
        toast({ title: 'Draft added', description: 'Review it, send yourself a test, then send.' })
    }

    const insertEvent = async (ev: { id: string; title: string }) => {
        setInserting(true)
        try {
            const res = await buildEventEmailBlock(ev.id)
            if (res.error || !res.html) throw new Error(res.error || 'Could not build that event card')
            // Appended, not replacing: the card belongs under whatever you have
            // already written, and silently discarding a draft to make room for
            // it would be its own bug.
            setContent(prev => prev + res.html)
            setEditorKey(k => k + 1)
            setInsertOpen(false)
            toast({ title: `Added "${ev.title}"`, description: 'The card sits at the end — drag your text around it.' })
        } catch (e: any) {
            toast({ title: 'Could not insert event', description: e.message, variant: 'destructive' })
        } finally {
            setInserting(false)
        }
    }

    const send = async () => {
        if (!sender.id) {
            toast({ title: 'No sending identity configured', description: sender.error, variant: 'destructive' })
            return
        }
        if (!subject.trim() || !content.trim()) {
            toast({ title: 'Add a subject and some content first', variant: 'destructive' })
            return
        }

        setSending(true)
        try {
            const recipients = await resolve()
            if (!recipients) return
            if (recipients.length === 0) {
                toast({ title: 'Nobody in that audience', variant: 'destructive' })
                return
            }

            // Same pre-send check organizers get. A platform blast is the worst
            // place to discover a list problem: it is the biggest audience we
            // ever send to, on the domain that carries everyone's tickets.
            const check = await checkEmailList(recipients.map(r => r.email))
            const bad = (check.data?.invalid ?? 0) + (check.data?.typos ?? 0)

            const confirmed = window.confirm(
                `Send "${subject}" to ${recipients.length.toLocaleString()} people as ${sender.name}?`
                + (bad > 0 ? `\n\n${bad} address${bad === 1 ? '' : 'es'} look wrong and will bounce.` : '')
                + `\n\nThis cannot be undone.`
            )
            if (!confirmed) return

            const { data, error } = await supabase.functions.invoke('send-promotional-email', {
                body: {
                    partner_id: sender.id,
                    subject,
                    html_content: content,
                    sender_name: sender.name ?? 'HangHut',
                    target_recipients: recipients,
                    segment: `platform:${audience}`,
                    ...(eventId ? { event_id: eventId } : {}),
                },
            })
            if (error) throw new Error(error.message)
            if (!data?.success) throw new Error(data?.error || 'Send failed')

            toast({
                title: 'Campaign queued',
                description: `Queued for ${(data.queued ?? recipients.length).toLocaleString()} recipients.`,
            })
            setSubject('')
            setContent('')
        } catch (e: any) {
            toast({ title: 'Send failed', description: e.message, variant: 'destructive' })
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" /> Audience
                    </CardTitle>
                    <CardDescription>
                        People with a direct HangHut relationship — they bought a ticket here or hold an account.
                        Organizers&apos; own subscriber lists are not included.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PLATFORM_AUDIENCES.map(a => (
                            <button
                                key={a.value}
                                type="button"
                                onClick={() => setAudience(a.value)}
                                className={cn(
                                    'rounded-lg border p-3 text-left transition-colors hover:bg-muted',
                                    audience === a.value && 'border-primary ring-2 ring-primary/30',
                                )}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{a.label}</span>
                                    {counts[a.value] !== undefined && (
                                        <Badge variant="secondary" className="tabular-nums">
                                            {counts[a.value].toLocaleString()}
                                        </Badge>
                                    )}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">{a.description}</span>
                            </button>
                        ))}
                    </div>

                    {selected.needsEvent && (
                        <div className="space-y-2">
                            <Label>Which event?</Label>
                            {eventId
                                ? (
                                    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                        <span className="truncate text-sm">{eventQuery}</span>
                                        <button
                                            type="button"
                                            onClick={() => { setEventId(''); setEventQuery('') }}
                                            className="shrink-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Choose a different event"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                )
                                : <EventPicker onPick={e => { setEventId(e.id); setEventQuery(e.title) }} />}
                        </div>
                    )}

                    {selected.needsDays && (
                        <div className="space-y-2">
                            <Label>Nothing bought in the last</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number" min={1} value={days}
                                    onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-28"
                                />
                                <span className="text-sm text-muted-foreground">days</span>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        {sender.error
                            ? <span className="text-destructive">{sender.error}</span>
                            : <>Sending as <span className="font-medium text-foreground">{sender.name ?? '…'}</span>.
                               Recipients can unsubscribe from HangHut mail without affecting organizers they follow.</>}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Message</CardTitle>
                    <CardDescription>
                        <code className="text-xs">{'{{first_name}}'}</code> is substituted per recipient.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="platform-subject">Subject</Label>
                        <Input
                            id="platform-subject"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="What's on this weekend"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label>Content</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button" variant="outline" size="sm"
                                    onClick={() => setInsertOpen(true)}
                                    className="gap-1.5"
                                >
                                    <CalendarPlus className="h-3.5 w-3.5" /> Insert event
                                </Button>
                                <Button
                                    type="button" variant="outline" size="sm"
                                    onClick={() => setAiOpen(true)}
                                    className="gap-1.5"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" /> Write with AI
                                </Button>
                            </div>
                        </div>
                        <RichTextEditor key={editorKey} value={content} onChange={setContent} />
                    </div>

                    {known !== undefined && known > 500 && (
                        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            This reaches {known.toLocaleString()} people on the domain that also delivers ticket
                            emails. Send yourself a test first.
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={sendTest} disabled={testing || !sender.id}>
                            {testing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : <><ShieldCheck className="mr-2 h-4 w-4" />Send test to me</>}
                        </Button>
                        <Button onClick={send} disabled={sending || !sender.id || !audienceReady}>
                            {sending
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                                : <><Send className="mr-2 h-4 w-4" />Send{known !== undefined ? ` to ${known.toLocaleString()}` : ''}</>}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={insertOpen} onOpenChange={setInsertOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarPlus className="h-5 w-5 text-primary" /> Insert an event
                        </DialogTitle>
                        <DialogDescription>
                            Adds a card with the cover image, date, venue, lowest live price and a
                            Get Tickets button — built email-safe, so it survives Gmail and Outlook.
                        </DialogDescription>
                    </DialogHeader>
                    {inserting
                        ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Building the card…
                          </p>
                        : <EventPicker autoFocus onPick={insertEvent} />}
                </DialogContent>
            </Dialog>

            {/* Deliberately large and two-column. The organizer version is a
                narrow single column, which means the generated email — the
                thing you are actually judging — renders in a 200px-tall strip.
                Here the brief and controls sit on the left and the draft gets a
                real, full-height pane on the right, so you can read it the way
                a recipient will before committing it to 1,800 inboxes. */}
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                <DialogContent className="max-w-[min(1200px,95vw)] h-[90vh] flex flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-6 py-4">
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-fuchsia-500" /> Write with AI
                        </DialogTitle>
                        <DialogDescription>
                            Writing as {sender.name ?? 'HangHut'} to {selected.label.toLowerCase()}
                            {known !== undefined ? ` (${known.toLocaleString()} people)` : ''}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(320px,380px)_1fr]">
                        {/* Brief */}
                        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b p-6 md:border-b-0 md:border-r">
                            <div className="space-y-1.5">
                                <Label className="text-xs">What&apos;s this email about?</Label>
                                <Textarea
                                    value={aiBrief}
                                    onChange={e => setAiBrief(e.target.value)}
                                    placeholder="e.g. Tell people what's on this weekend across Manila. Three shows, link to each. Warm, short, not salesy."
                                    className="min-h-[160px] resize-none"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Mention colours, branding or &ldquo;designed&rdquo; and it builds a full layout.
                                    Otherwise it keeps things plain.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Tone</Label>
                                <Select value={aiTone} onValueChange={setAiTone}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Friendly &amp; fun">Friendly &amp; fun</SelectItem>
                                        <SelectItem value="Hype &amp; urgent">Hype &amp; urgent</SelectItem>
                                        <SelectItem value="Professional">Professional</SelectItem>
                                        <SelectItem value="Playful">Playful</SelectItem>
                                        <SelectItem value="Warm &amp; personal">Warm &amp; personal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">About an event (optional)</Label>
                                {aiEvent
                                    ? (
                                        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                            <span className="truncate text-sm">{aiEvent.title}</span>
                                            <button
                                                type="button"
                                                onClick={() => setAiEvent(null)}
                                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                                aria-label="Remove event"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )
                                    : <EventPicker onPick={setAiEvent} placeholder="Search an event to write about…" />}
                                <p className="text-xs text-muted-foreground">
                                    Attach one and it writes from the real date, venue and price
                                    instead of inventing them.
                                </p>
                            </div>

                            <Button
                                onClick={generateAi}
                                disabled={aiGenerating || !aiBrief.trim()}
                                className="w-full gap-1.5"
                            >
                                {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                {aiGenerating ? 'Writing…' : aiResult ? 'Regenerate' : 'Generate'}
                            </Button>

                            {aiResult && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Pick a subject line</Label>
                                    {aiResult.subjects.map(sbj => (
                                        <button
                                            key={sbj}
                                            type="button"
                                            onClick={() => setAiSubject(sbj)}
                                            className={cn(
                                                'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                                aiSubject === sbj ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                                            )}
                                        >
                                            <span className={cn(
                                                'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border',
                                                aiSubject === sbj && 'border-primary bg-primary',
                                            )} />
                                            <span className="flex-1">{sbj}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Draft */}
                        <div className="flex min-h-0 flex-col bg-muted/30">
                            {aiResult ? (
                                <>
                                    <div className="flex items-center justify-between gap-3 border-b bg-background/60 px-6 py-3">
                                        <p className="truncate text-sm font-medium">
                                            {aiSubject || 'No subject selected'}
                                        </p>
                                        <Button onClick={applyAi} size="sm" className="shrink-0 gap-1.5">
                                            <Sparkles className="h-4 w-4" /> Use this draft
                                        </Button>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto p-6">
                                        <div
                                            className="prose prose-sm mx-auto max-w-[640px] rounded-lg border bg-white p-6 text-gray-800 shadow-sm"
                                            dangerouslySetInnerHTML={{ __html: aiResult.html }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                                    <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">
                                        {aiGenerating ? 'Writing your draft…' : 'Your draft will appear here.'}
                                    </p>
                                    {!aiGenerating && (
                                        <p className="max-w-xs text-xs text-muted-foreground/80">
                                            Describe the email on the left. It sees who the audience is, so the
                                            copy is written for them.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
