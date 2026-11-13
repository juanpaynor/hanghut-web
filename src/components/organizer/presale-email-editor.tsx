'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { RichTextEditor } from '@/components/organizer/marketing/rich-text-editor'
import { Mail, Send, ChevronDown, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import {
    setPresaleEmailCopy,
    sendPresaleTestEmail,
    type PresaleEmailCopy,
} from '@/lib/organizer/presale-announce-actions'

/**
 * The two presale emails, edited with the SAME tools as a marketing campaign.
 *
 * The first version of this was a bare <textarea> of raw HTML, which was a
 * worse experience than the Email tab three clicks away and taught organizers
 * that presale emails are a second-class thing. RichTextEditor already carries
 * visual editing, an HTML tab, image upload and a preview — so it is reused
 * whole rather than reimplemented badly.
 *
 * ⚠ THE ONE RULE THE CAMPAIGN COMPOSER DOES NOT HAVE: {{presale_link}} must
 * survive. It becomes each person's own link, and 95% of registrants are
 * guests with no account — without it the page cannot recognise them when they
 * arrive and asks them to pre-register for the thing they already did. The AI
 * does not know that, so generated copy has the button re-attached rather than
 * being handed to the organizer one failed save later.
 */

interface Props {
    eventId: string
    reminder: PresaleEmailCopy
    announcement: PresaleEmailCopy
    customised: boolean
    testTo: string
}

type Kind = 'reminder' | 'announcement'

/** The CTA, in the exact shape the defaults use. */
const LINK_BUTTON = `
<p style="margin:28px 0"><a href="{{presale_link}}" style="background:#4f46e5;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Get your tickets</a></p>`

export function PresaleEmailEditor({ eventId, reminder, announcement, customised, testTo }: Props) {
    const { toast } = useToast()
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [which, setWhich] = useState<Kind>('announcement')
    const [saving, startSaving] = useTransition()
    const [testing, startTesting] = useTransition()

    const [copy, setCopy] = useState<Record<Kind, PresaleEmailCopy>>({ reminder, announcement })
    // Remounts RichTextEditor when the body is replaced wholesale (AI, or
    // switching between the two emails). Without it the editor keeps showing
    // the old document, because it reads `value` once on mount.
    const [editorKey, setEditorKey] = useState(0)

    const [aiOpen, setAiOpen] = useState(false)
    const [aiBrief, setAiBrief] = useState('')
    const [aiTone, setAiTone] = useState('friendly')
    const [aiBusy, setAiBusy] = useState(false)

    const current = copy[which]
    const set = (patch: Partial<PresaleEmailCopy>) =>
        setCopy(c => ({ ...c, [which]: { ...c[which], ...patch } }))

    const switchTo = (k: Kind) => { setWhich(k); setEditorKey(n => n + 1) }

    const save = () => {
        startSaving(async () => {
            const res = await setPresaleEmailCopy(eventId, which, copy[which])
            toast(res.error
                ? { title: 'Not saved', description: res.error, variant: 'destructive' }
                : { title: 'Email saved', description: 'Anything already scheduled was rebuilt with the new wording.' })
        })
    }

    const test = () => {
        startTesting(async () => {
            const res = await sendPresaleTestEmail(eventId, testTo)
            toast(res.error
                ? { title: 'Not sent', description: res.error, variant: 'destructive' }
                : { title: 'Test sent', description: `Check ${testTo}.` })
        })
    }

    const generate = async () => {
        if (!aiBrief.trim()) {
            toast({ title: 'Say what it should cover', variant: 'destructive' })
            return
        }
        setAiBusy(true)
        try {
            // The same edge function the campaign composer uses. The brief is
            // prefixed so the model knows this is a presale note and not a
            // general promo — without it the copy invites everyone to buy,
            // which is the opposite of what a presale says.
            const intent = which === 'reminder'
                ? 'A short heads-up email to people who pre-registered: tickets open to them tomorrow, before the general public. They do not need to do anything yet.'
                : 'A short email to people who pre-registered telling them their early access has started and they can buy now, before the general public.'
            const { data, error } = await supabase.functions.invoke('ai-marketing-copy', {
                body: { brief: `${intent}\n\nOrganizer's notes: ${aiBrief.trim()}`, tone: aiTone, event_id: eventId },
            })
            if (error) throw new Error(error.message || 'Failed to generate')
            if (data?.error) throw new Error(data.error)

            let html: string = data.html ?? ''
            // ⚠ The model has no idea this placeholder is load-bearing. Rather
            // than let the organizer discover it on a refused save, put the
            // button back and say so.
            const needsLink = which === 'announcement' && !html.includes('{{presale_link}}')
            if (needsLink) html += LINK_BUTTON

            set({ subject: data.subjects?.[0] || copy[which].subject, html })
            setEditorKey(n => n + 1)
            setAiOpen(false)
            toast({
                title: 'Copy written',
                description: needsLink
                    ? 'Their personal ticket link was added at the end — move it wherever you like.'
                    : 'Review and tweak, then save.',
            })
        } catch (err: any) {
            toast({ title: 'Could not write it', description: err.message, variant: 'destructive' })
        } finally {
            setAiBusy(false)
        }
    }

    return (
        <div className="rounded-lg border bg-muted/20">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/30 transition-colors"
            >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Mail className="h-4 w-4 text-muted-foreground" />
                What we email them
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {customised ? 'Edited' : 'Using the default wording'}
                </span>
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex rounded-lg border p-0.5 bg-background">
                            {([
                                ['announcement', 'When tickets open'],
                                ['reminder', 'The day before'],
                            ] as [Kind, string][]).map(([k, label]) => (
                                <button
                                    key={k} type="button" onClick={() => switchTo(k)}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                        which === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >{label}</button>
                            ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} className="ml-auto">
                            <Sparkles className="h-4 w-4 mr-1.5" /> Write it for me
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Two placeholders get filled in per person:{' '}
                        <code className="px-1 py-0.5 rounded bg-muted font-mono">{'{{first_name}}'}</code>{' '}
                        and{' '}
                        <code className="px-1 py-0.5 rounded bg-muted font-mono">{'{{presale_link}}'}</code>,
                        which becomes <em>their own</em> link. Keep the link in the on-sale email — without
                        it they have no way to prove they are on your list.
                    </p>

                    <div>
                        <Label htmlFor="presale-subject" className="text-xs">Subject</Label>
                        <Input
                            id="presale-subject"
                            value={current.subject}
                            onChange={(e) => set({ subject: e.target.value })}
                            disabled={saving}
                        />
                    </div>

                    {/* Visual editing, raw HTML and a preview, all inside this one
                        component — the same one the Email tab uses. */}
                    <RichTextEditor
                        key={`${which}-${editorKey}`}
                        value={current.html}
                        onChange={(html) => set({ html })}
                        disabled={saving}
                    />

                    <div className="flex items-center gap-3 flex-wrap pt-1">
                        <Button size="sm" onClick={save} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                            Save this email
                        </Button>
                        <Button size="sm" variant="secondary" onClick={test} disabled={testing || !testTo}>
                            <Send className="h-4 w-4 mr-1.5" />
                            Send me a test
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            {testTo
                                ? <>Test goes to {testTo} only — nobody on your list is emailed, and it does not count towards your stats.</>
                                : <>Add an email to your account to send yourself a test.</>}
                        </span>
                    </div>
                </div>
            )}

            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            Write the {which === 'reminder' ? 'day-before' : 'on-sale'} email
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            It already knows this is a presale and who it is going to. Tell it
                            anything else that matters — the lineup, the venue, a price, the vibe.
                        </p>
                        <Textarea
                            rows={4}
                            placeholder="e.g. Rooftop show, 3 bands, doors 8pm. Limited couches. Keep it short and a bit cheeky."
                            value={aiBrief}
                            onChange={(e) => setAiBrief(e.target.value)}
                        />
                        <div>
                            <Label className="text-xs">Tone</Label>
                            <Select value={aiTone} onValueChange={setAiTone}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="friendly">Friendly</SelectItem>
                                    <SelectItem value="excited">Excited</SelectItem>
                                    <SelectItem value="professional">Professional</SelectItem>
                                    <SelectItem value="casual">Casual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAiOpen(false)} disabled={aiBusy}>Cancel</Button>
                        <Button onClick={generate} disabled={aiBusy}>
                            {aiBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                            Write it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
