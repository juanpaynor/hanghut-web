'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, AlertTriangle, Loader2, Link2, ChevronDown, ChevronUp } from 'lucide-react'
import { RegistrationQuestionsCard } from '@/components/checkout/registration-questions-card'
import { visibleQuestions, isSectionBlock, type AnswerMap } from '@/lib/events/question-visibility'
import { parseAnswer } from '@/lib/events/answer-format'
import {
    saveAttendeeDetails, mintAttendeeSublink,
    type DetailBundle, type DetailSlot, type DetailQuestion, type AnswerSource,
} from '@/lib/events/attendee-detail-actions'
import { cn } from '@/lib/utils'

/**
 * One slot per ticket, each filled in independently.
 *
 * The whole point of this page is that the slots do not share state: an order's
 * tickets used to share a single answer set, so a shirt size entered for the
 * fourth attendee described the first one too. Here `answers` is keyed by
 * ticket id and every save names its ticket, so nothing one attendee types can
 * reach another.
 *
 * Pre-filling is deliberately narrow. Only answers the server vouches for as
 * belonging to THIS attendee ('own' or 'order') appear in the form. A set it
 * flags as 'rewritten' or 'shared' is real data about a real person, but not
 * necessarily this one — pre-filling it would invite the buyer to confirm a
 * stranger's medical history as their own, which is the exact failure this page
 * exists to undo.
 */

const PREFILLABLE: AnswerSource[] = ['own', 'order']

function sourceNotice(source: AnswerSource, requiredCount: number): { tone: 'ok' | 'warn' | 'info'; text: string } | null {
    switch (source) {
        case 'own':
            return { tone: 'ok', text: 'These details are on file for this attendee. Change anything that is wrong.' }
        case 'order':
            return { tone: 'ok', text: 'These came from the original booking. Please check they are right.' }
        case 'rewritten':
            return {
                tone: 'warn',
                text: 'The details we had for this ticket were replaced by a later booking on the same email, so they may describe someone else. Please enter this attendee’s details again.',
            }
        case 'shared':
            return {
                tone: 'warn',
                text: 'This booking has one set of answers covering several tickets, so we cannot tell which attendee they belong to. Please enter this attendee’s details.',
            }
        case 'none':
            return requiredCount > 0
                ? { tone: 'info', text: 'We have no details for this attendee yet.' }
                : null
    }
}

export function AttendeeDetailsClient({ bundle, token }: { bundle: DetailBundle; token: string }) {
    const { toast } = useToast()
    const questions = useMemo<DetailQuestion[]>(
        () => [...(bundle.questions ?? [])].sort((a, b) => a.display_order - b.display_order),
        [bundle.questions]
    )
    const typeOf = useMemo(() => {
        const m = new Map<string, string>()
        questions.forEach(q => m.set(q.id, q.question_type))
        return m
    }, [questions])

    const [slots, setSlots] = useState<DetailSlot[]>(bundle.tickets ?? [])

    // Answers per ticket, seeded only from sources the server vouches for.
    const [answers, setAnswers] = useState<Record<string, AnswerMap>>(() => {
        const seed: Record<string, AnswerMap> = {}
        for (const t of bundle.tickets ?? []) {
            const row: AnswerMap = {}
            if (!t.status.readonly && PREFILLABLE.includes(t.status.answer_source)) {
                for (const a of t.status.answers ?? []) {
                    row[a.question_id] = parseAnswer(a.answer, typeOfIn(bundle.questions, a.question_id))
                }
            }
            seed[t.id] = row
        }
        return seed
    })

    const [names, setNames] = useState<Record<string, string>>(() => {
        const seed: Record<string, string> = {}
        for (const t of bundle.tickets ?? []) seed[t.id] = t.attendee_name ?? ''
        return seed
    })

    // A completed slot collapses, so a buyer with six tickets sees what is left
    // to do rather than six long forms.
    const [open, setOpen] = useState<Record<string, boolean>>(() => {
        const seed: Record<string, boolean> = {}
        for (const t of bundle.tickets ?? []) seed[t.id] = !t.status.complete
        return seed
    })

    const [saving, setSaving] = useState<string | null>(null)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [copied, setCopied] = useState<string | null>(null)

    const setTicketAnswers = (ticketId: string) =>
        (updater: React.SetStateAction<Record<string, any>>) =>
            setAnswers(prev => ({
                ...prev,
                [ticketId]: typeof updater === 'function'
                    ? (updater as (p: Record<string, any>) => Record<string, any>)(prev[ticketId] ?? {})
                    : updater,
            }))

    const askedOf = (slot: DetailSlot) =>
        visibleQuestions(questions, answers[slot.id] ?? {}, slot.tier_id)

    const handleSave = async (slot: DetailSlot) => {
        const asked = askedOf(slot)
        const mine = answers[slot.id] ?? {}

        // Mirror the server's rule so the attendee sees which field is missing
        // instead of one generic rejection after a round trip.
        const missing = asked.filter(q => {
            if (isSectionBlock(q) || !q.is_required) return false
            const v = mine[q.id]
            if (Array.isArray(v)) return v.length === 0
            if (typeof v === 'boolean') return !v
            return !String(v ?? '').trim()
        })
        if (missing.length > 0) {
            setErrors(prev => ({
                ...prev,
                [slot.id]: `Please answer: ${missing.slice(0, 3).map(q => q.label.split(/[.:(]/)[0].trim().slice(0, 40)).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`,
            }))
            return
        }

        setErrors(prev => { const e = { ...prev }; delete e[slot.id]; return e })
        setSaving(slot.id)

        // Only the questions actually asked of this attendee are sent. A
        // tier-scoped or branched-away question was never shown, so sending a
        // blank for it would store an answer nobody gave.
        const payload: AnswerMap = {}
        for (const q of asked) {
            if (isSectionBlock(q)) continue
            if (q.id in mine) payload[q.id] = mine[q.id]
        }

        const res = await saveAttendeeDetails(token, slot.id, payload, names[slot.id] || null)
        setSaving(null)

        if (!res.ok) {
            setErrors(prev => ({ ...prev, [slot.id]: res.error ?? 'Could not save.' }))
            return
        }

        setSlots(prev => prev.map(s => s.id === slot.id
            ? { ...s, attendee_name: names[slot.id] || s.attendee_name,
                status: { ...s.status, complete: true, missing_count: 0, answer_source: 'own' } }
            : s))
        setOpen(prev => ({ ...prev, [slot.id]: false }))
        toast({ title: 'Saved', description: `${names[slot.id] || slot.ticket_number} is all set.` })
    }

    const handleCopyLink = async (slot: DetailSlot) => {
        const res = await mintAttendeeSublink(token, slot.id)
        if (res.error || !res.token) {
            toast({ title: 'Could not create link', description: res.error, variant: 'destructive' })
            return
        }
        const url = `${window.location.origin}/d/${res.token}`
        try {
            await navigator.clipboard.writeText(url)
            setCopied(slot.id)
            setTimeout(() => setCopied(null), 2500)
        } catch {
            // Clipboard is blocked outside a secure context and in some
            // in-app browsers. Show the URL so it can still be copied by hand.
            toast({ title: 'Copy this link', description: url })
        }
    }

    const done = slots.filter(s => s.status.complete).length
    const isOrder = bundle.scope === 'buyer'

    return (
        <div className="space-y-5">
            {slots.length > 1 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                    <span className="font-medium">{done} of {slots.length} attendees complete</span>
                    {done < slots.length && (
                        <span className="text-muted-foreground">{slots.length - done} still to fill in</span>
                    )}
                </div>
            )}

            {slots.map((slot, i) => {
                const asked = askedOf(slot)
                const answerable = asked.filter(q => !isSectionBlock(q))
                const notice = sourceNotice(slot.status.answer_source, slot.status.required_count)
                const isOpen = open[slot.id]

                return (
                    <Card key={slot.id} className={cn(
                        'border-border/60',
                        slot.status.complete && !isOpen && 'bg-muted/20'
                    )}>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                        <span>Attendee {i + 1}</span>
                                        {slot.attendee_name && (
                                            <span className="text-muted-foreground font-normal truncate">
                                                {slot.attendee_name}
                                            </span>
                                        )}
                                        {slot.status.complete
                                            ? <Badge variant="secondary" className="gap-1 text-emerald-700 bg-emerald-50 border-emerald-200">
                                                <CheckCircle2 className="h-3 w-3" /> Complete
                                              </Badge>
                                            : <Badge variant="secondary" className="gap-1 text-amber-800 bg-amber-50 border-amber-200">
                                                <AlertTriangle className="h-3 w-3" /> Needs details
                                              </Badge>}
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {slot.ticket_number}{slot.tier ? ` · ${slot.tier}` : ''}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost" size="sm"
                                    onClick={() => setOpen(p => ({ ...p, [slot.id]: !p[slot.id] }))}
                                    aria-expanded={isOpen}
                                >
                                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    <span className="sr-only">{isOpen ? 'Collapse' : 'Expand'}</span>
                                </Button>
                            </div>
                        </CardHeader>

                        {isOpen && slot.status.readonly && (
                            <CardContent className="space-y-4">
                                <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                                    {slot.attendee_name || 'This attendee'} filled these in themselves, so
                                    they are not shown here and only they can change them.
                                </p>
                                {isOrder && (
                                    <>
                                        <Button variant="outline" onClick={() => handleCopyLink(slot)}>
                                            <Link2 className="mr-2 h-4 w-4" />
                                            {copied === slot.id ? 'Link copied' : 'Send their link again'}
                                        </Button>
                                        <p className="text-xs text-muted-foreground">
                                            Use this if something needs correcting.
                                        </p>
                                    </>
                                )}
                            </CardContent>
                        )}

                        {isOpen && !slot.status.readonly && (
                            <CardContent className="space-y-5">
                                {notice && (
                                    <p className={cn(
                                        'rounded-lg border p-3 text-sm',
                                        notice.tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900',
                                        notice.tone === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                                        notice.tone === 'info' && 'border-border bg-muted/30 text-muted-foreground',
                                    )}>
                                        {notice.text}
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor={`name_${slot.id}`}>Attendee&apos;s full name</Label>
                                    <Input
                                        id={`name_${slot.id}`}
                                        value={names[slot.id] ?? ''}
                                        onChange={e => setNames(p => ({ ...p, [slot.id]: e.target.value }))}
                                        placeholder="Who is this ticket for?"
                                        className="bg-muted/30"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Tickets bought together are all named after the buyer, so this may need correcting.
                                    </p>
                                </div>

                                {answerable.length > 0 && bundle.event && (
                                    <RegistrationQuestionsCard
                                        bare
                                        eventId={bundle.event.id}
                                        registrationQuestions={asked as never}
                                        regAnswers={answers[slot.id] ?? {}}
                                        setRegAnswers={setTicketAnswers(slot.id)}
                                        requireApproval={false}
                                    />
                                )}

                                {errors[slot.id] && (
                                    <p className="text-sm text-destructive">{errors[slot.id]}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={() => handleSave(slot)} disabled={saving === slot.id}>
                                        {saving === slot.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save these details
                                    </Button>
                                    {isOrder && (
                                        <Button variant="outline" onClick={() => handleCopyLink(slot)}>
                                            <Link2 className="mr-2 h-4 w-4" />
                                            {copied === slot.id ? 'Link copied' : 'Get a link for this person'}
                                        </Button>
                                    )}
                                </div>
                                {isOrder && (
                                    <p className="text-xs text-muted-foreground">
                                        Send that link if you would rather this attendee filled in their own details.
                                        It opens only their form, not your other tickets.
                                    </p>
                                )}
                            </CardContent>
                        )}
                    </Card>
                )
            })}
        </div>
    )
}

/** Question type lookup during the initial seed, before the memo exists. */
function typeOfIn(questions: DetailQuestion[] | undefined, questionId: string): string {
    return questions?.find(q => q.id === questionId)?.question_type ?? 'short_text'
}
