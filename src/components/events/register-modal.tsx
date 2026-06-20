'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn, hexToHsl } from '@/lib/utils'
import { Check, ChevronLeft, ChevronRight, Loader2, Clock, PartyPopper } from 'lucide-react'
import type { QuestionForForm } from './registration-questions-form'

interface RegisterModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    event: { id: string; title: string; require_approval?: boolean; invite_only?: boolean }
    questions: QuestionForForm[]
    isLoggedIn: boolean
    /** Fired when registration is approved/auto-approved — proceed to tickets.
     *  Guest info is passed so a free auto-claim can attribute the ticket. */
    onApproved: (registrationId: string, guest?: { name: string; email: string }) => void
    /** Fired when the request goes to pending (approval/invite-only events). */
    onPending?: () => void
    /** Event's accent color (hex) — themes the modal's primary/accent. */
    themeColor?: string | null
    /** Whether the event page is using a dark background — match it. */
    dark?: boolean
}

type Phase = 'form' | 'submitting' | 'approved' | 'pending'

const slide = {
    enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
}

export function RegisterModal({ open, onOpenChange, event, questions, isLoggedIn, onApproved, onPending, themeColor, dark }: RegisterModalProps) {
    // Mirror the event page's theme inside the portal: a `dark` class flips the
    // shadcn tokens to their dark values, and the brand hue overrides --primary.
    const brandHsl = themeColor ? hexToHsl(themeColor) : null
    const brandVars = brandHsl
        ? ({ ['--primary']: brandHsl, ['--ring']: brandHsl } as React.CSSProperties)
        : undefined
    const sorted = useMemo(
        () => [...questions].sort((a, b) => a.display_order - b.display_order),
        [questions]
    )
    // Guests answer an identity step first (name + email) so the registration
    // can be attributed without a login.
    const steps = useMemo<('identity' | QuestionForForm)[]>(
        () => (isLoggedIn ? sorted : ['identity', ...sorted]),
        [isLoggedIn, sorted]
    )

    const [step, setStep] = useState(0)
    const [dir, setDir] = useState(1)
    const [phase, setPhase] = useState<Phase>('form')
    const [error, setError] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

    const current = steps[step]
    const isLast = step === steps.length - 1
    const progress = Math.round(((step + 1) / steps.length) * 100)

    function setAnswer(qid: string, value: string | string[]) {
        setAnswers((prev) => ({ ...prev, [qid]: value }))
    }

    function stepValid(): boolean {
        if (current === 'identity') {
            return name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
        }
        const q = current
        if (!q.is_required) return true
        const v = answers[q.id]
        if (Array.isArray(v)) return v.length > 0
        return !!v && String(v).trim().length > 0
    }

    function go(next: number) {
        setDir(next > step ? 1 : -1)
        setStep(next)
        setError(null)
    }

    async function submit() {
        setPhase('submitting')
        setError(null)
        try {
            const supabase = createClient()
            const payload = sorted
                .map((q) => {
                    const v = answers[q.id]
                    if (v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')) return null
                    return { question_id: q.id, answer: Array.isArray(v) ? JSON.stringify(v) : String(v) }
                })
                .filter(Boolean)

            const { data, error: rpcError } = await supabase.rpc('submit_event_request', {
                p_event_id: event.id,
                p_answers: payload,
                p_guest_email: isLoggedIn ? null : email.trim(),
                p_guest_name: isLoggedIn ? null : name.trim(),
            })

            if (rpcError) {
                const msg = rpcError.message || ''
                setError(
                    msg.includes('already registered')
                        ? 'You have already registered for this event.'
                        : msg.includes('Required questions')
                        ? 'Please answer all required questions.'
                        : 'Something went wrong. Please try again.'
                )
                setPhase('form')
                return
            }

            const status = (data as any)?.status as string
            const regId = (data as any)?.registration_id as string
            if (status === 'pending') {
                setPhase('pending')
                onPending?.()
            } else {
                setPhase('approved')
                // brief success beat before handing off to the ticket selector
                const guest = isLoggedIn ? undefined : { name: name.trim(), email: email.trim() }
                setTimeout(() => onApproved(regId, guest), 1100)
            }
        } catch {
            setError('Something went wrong. Please try again.')
            setPhase('form')
        }
    }

    function handleNext() {
        if (!stepValid()) return
        if (isLast) submit()
        else go(step + 1)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { /* reset on close */ setStep(0); setPhase('form') } onOpenChange(o) }}>
            <DialogContent className={cn('max-w-xl overflow-hidden p-0 gap-0 flex flex-col max-h-[90vh]', dark && 'dark bg-background text-foreground')} style={brandVars}>
                <DialogTitle className="sr-only">Register for {event.title}</DialogTitle>

                {/* Progress bar */}
                {phase === 'form' && (
                    <div className="h-1 w-full bg-muted">
                        <motion.div
                            className="h-full bg-primary"
                            initial={false}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                        />
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-7 pt-6 pb-4 min-h-[280px]">
                    {/* Header */}
                    <div className="mb-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Register · {event.title}
                        </p>
                    </div>

                    {/* Body */}
                    <div className="flex-1">
                        <AnimatePresence mode="wait" custom={dir} initial={false}>
                            {phase === 'form' && (
                                <motion.div
                                    key={step}
                                    custom={dir}
                                    variants={slide}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="space-y-4"
                                >
                                    {current === 'identity' ? (
                                        <div className="space-y-4">
                                            <h3 className="text-xl font-bold tracking-tight">First, who&apos;s registering?</h3>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Full name</label>
                                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan dela Cruz" autoFocus />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Email</label>
                                                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
                                                <p className="text-xs text-muted-foreground">Your ticket and updates go here.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <QuestionStep q={current} value={answers[current.id]} onChange={(v) => setAnswer(current.id, v)} />
                                    )}
                                </motion.div>
                            )}

                            {phase === 'submitting' && (
                                <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground">Submitting your registration…</p>
                                </motion.div>
                            )}

                            {phase === 'approved' && (
                                <motion.div key="approved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-center">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                                        className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30"
                                    >
                                        <Check className="h-8 w-8" />
                                    </motion.div>
                                    <div>
                                        <h3 className="text-xl font-bold">You&apos;re registered!</h3>
                                        <p className="text-sm text-muted-foreground mt-1">Taking you to tickets…</p>
                                    </div>
                                </motion.div>
                            )}

                            {phase === 'pending' && (
                                <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-center">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -20 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 240, damping: 16 }}
                                        className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                                    >
                                        <Clock className="h-8 w-8" />
                                    </motion.div>
                                    <div>
                                        <h3 className="text-xl font-bold">Request sent</h3>
                                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                            The organizer reviews registrations for this event. You&apos;ll get an email once you&apos;re approved.
                                        </p>
                                    </div>
                                    <Button onClick={() => onOpenChange(false)} className="mt-2">Done</Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Footer — pinned below the scrollable questions */}
                {phase === 'form' && (
                    <div className="shrink-0 border-t px-7 py-4 space-y-3 bg-background">
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => go(step - 1)}
                                disabled={step === 0}
                                className={cn(step === 0 && 'invisible')}
                            >
                                <ChevronLeft className="mr-1 h-4 w-4" /> Back
                            </Button>
                            <span className="text-xs text-muted-foreground">{step + 1} / {steps.length}</span>
                            <Button size="sm" onClick={handleNext} disabled={!stepValid()}>
                                {isLast ? (<><PartyPopper className="mr-1.5 h-4 w-4" /> Submit</>) : (<>Next <ChevronRight className="ml-1 h-4 w-4" /></>)}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

// ─── Per-question input ──────────────────────────────────────────────────────
function QuestionStep({ q, value, onChange }: { q: QuestionForForm; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
    const str = typeof value === 'string' ? value : ''
    const arr = Array.isArray(value) ? value : []

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold tracking-tight">
                {q.label}
                {q.is_required && <span className="ml-1 text-destructive">*</span>}
            </h3>

            {(q.question_type === 'short_text' || q.question_type === 'url' || q.question_type === 'social_profile' || q.question_type === 'company') && (
                <Input
                    autoFocus
                    value={str}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={
                        q.question_type === 'url' ? 'https://…'
                            : q.question_type === 'social_profile' ? '@username'
                                : q.question_type === 'company' ? 'Company name'
                                    : 'Your answer'
                    }
                />
            )}

            {q.question_type === 'long_text' && (
                <textarea
                    autoFocus
                    rows={4}
                    value={str}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Your answer"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            )}

            {q.question_type === 'checkbox' && (
                <button
                    type="button"
                    onClick={() => onChange(str === 'true' ? 'false' : 'true')}
                    className={cn(
                        'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
                        str === 'true' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    )}
                >
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded border-2', str === 'true' ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {str === 'true' && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-sm font-medium">Yes, I agree</span>
                </button>
            )}

            {q.question_type === 'single_choice' && (
                <div className="space-y-2">
                    {q.options.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onChange(opt)}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition-all',
                                str === opt ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/40'
                            )}
                        >
                            <span className={cn('h-4 w-4 rounded-full border-2', str === opt ? 'border-primary bg-primary' : 'border-muted-foreground/40')} />
                            {opt}
                        </button>
                    ))}
                </div>
            )}

            {q.question_type === 'multi_choice' && (
                <div className="space-y-2">
                    {q.options.map((opt) => {
                        const checked = arr.includes(opt)
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => onChange(checked ? arr.filter((o) => o !== opt) : [...arr, opt])}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition-all',
                                    checked ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/40'
                                )}
                            >
                                <span className={cn('flex h-4 w-4 items-center justify-center rounded border-2', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                                    {checked && <Check className="h-3 w-3" />}
                                </span>
                                {opt}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
