'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send, Users, ShieldCheck, AlertTriangle } from 'lucide-react'
import { RichTextEditor } from '@/components/organizer/marketing/rich-text-editor'
import {
    PLATFORM_AUDIENCES,
    getPlatformAudienceCounts,
    getPlatformRecipients,
    getPlatformSender,
    getPlatformEventOptions,
    type PlatformAudience,
} from '@/lib/admin/marketing-actions'
import { checkEmailList } from '@/lib/marketing/email-check-actions'
import { cn } from '@/lib/utils'

/**
 * HangHut's own campaign composer.
 *
 * Sends through the SAME pipeline organizers use — send-promotional-email →
 * email_send_queue → process-email-queue — so suppression, the unsubscribe
 * footer, idempotency, delivery stats and the Resend webhook all apply without
 * a second implementation. The only thing that differs is who the audience is.
 */

export function PlatformCampaignComposer() {
    const { toast } = useToast()
    const supabase = createClient()

    const [sender, setSender] = useState<{ id?: string; name?: string; error?: string }>({})
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [audience, setAudience] = useState<PlatformAudience>('all_buyers')
    const [eventId, setEventId] = useState('')
    const [eventQuery, setEventQuery] = useState('')
    const [eventOptions, setEventOptions] = useState<{ id: string; title: string }[]>([])
    const [days, setDays] = useState(180)

    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [testing, setTesting] = useState(false)

    const selected = useMemo(
        () => PLATFORM_AUDIENCES.find(a => a.value === audience)!,
        [audience],
    )

    useEffect(() => {
        getPlatformSender().then(setSender)
        getPlatformAudienceCounts().then(r => { if (r.data) setCounts(r.data) })
    }, [])

    // Debounced so typing a show title doesn't fire a query per keystroke.
    useEffect(() => {
        if (!selected.needsEvent) return
        const t = setTimeout(() => { getPlatformEventOptions(eventQuery).then(setEventOptions) }, 250)
        return () => clearTimeout(t)
    }, [eventQuery, selected.needsEvent])

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
                            <Input
                                value={eventQuery}
                                onChange={e => { setEventQuery(e.target.value); setEventId('') }}
                                placeholder="Search events…"
                            />
                            {eventOptions.length > 0 && !eventId && (
                                <div className="max-h-44 overflow-auto rounded-md border">
                                    {eventOptions.map(o => (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => { setEventId(o.id); setEventQuery(o.title) }}
                                            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                        >
                                            {o.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {eventId && <p className="text-xs text-muted-foreground">Selected. Clear the box to pick another.</p>}
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
                        <Label>Content</Label>
                        <RichTextEditor value={content} onChange={setContent} />
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
        </div>
    )
}
