'use client'

/**
 * Walk-up check-in kiosk.
 *
 * A guest types their own name and email on a screen the organizer props up at
 * the door. That single fact drives every decision in here:
 *
 *  - No result list, ever. The staff-facing door search is fuzzy and shows full
 *    names and emails, which is right when a trusted person is reading it and a
 *    guest-list leak when a stranger is. The server matches on exact email and
 *    returns one first name; this component never asks for more.
 *  - Fields clear the moment a check-in resolves, so the next person in the
 *    queue never sees the last person's address.
 *  - Leaving the kiosk is a press-and-hold, not a button. A guest tapping around
 *    must not be able to wander into the organizer's dashboard, and a plain
 *    confirm dialog is one more tap, not a barrier.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertCircle, Ticket, ArrowLeft } from 'lucide-react'
import { kioskCheckIn, getKioskCounts, type KioskResult } from '@/lib/checkin/actions'

/** How long a confirmation holds the screen before it resets for the next guest. */
const RESET_AFTER_MS = 4500
/** Press-and-hold duration to leave the kiosk. */
const EXIT_HOLD_MS = 2000

export function CheckinKiosk({
    eventId,
    eventTitle,
    venueName,
    initialCounts,
}: {
    eventId: string
    eventTitle: string
    venueName: string | null
    initialCounts: { checked_in: number; expected: number }
}) {
    const router = useRouter()
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<KioskResult | null>(null)
    const [counts, setCounts] = useState(initialCounts)
    const [holdPct, setHoldPct] = useState(0)

    const nameRef = useRef<HTMLInputElement>(null)
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const reset = useCallback(() => {
        if (resetTimer.current) clearTimeout(resetTimer.current)
        setResult(null)
        setName('')
        setEmail('')
        // Focus back on the first field so the next guest can just start typing.
        setTimeout(() => nameRef.current?.focus(), 50)
    }, [])

    useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current) }, [])

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        const res = await kioskCheckIn(eventId, name, email)
        setResult(res)

        // Clear the guest's details immediately — the confirmation screen is
        // still up, but their email is already gone from the DOM.
        if (res.ok || res.code === 'ALREADY_IN' || res.code === 'SEE_BOX_OFFICE') {
            setName('')
            setEmail('')
            setCounts(await getKioskCounts(eventId))
        }
        setBusy(false)

        // Validation misses stay on screen until corrected; a resolved check-in
        // clears itself so the door keeps moving without staff intervention.
        if (res.ok || res.code === 'ALREADY_IN') {
            resetTimer.current = setTimeout(reset, RESET_AFTER_MS)
        }
    }

    // ── Press-and-hold to exit ────────────────────────────────────────────────
    const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)
    const stopHold = useCallback(() => {
        if (holdTimer.current) clearInterval(holdTimer.current)
        holdTimer.current = null
        setHoldPct(0)
    }, [])
    const startHold = useCallback(() => {
        const started = Date.now()
        holdTimer.current = setInterval(() => {
            const pct = Math.min(100, ((Date.now() - started) / EXIT_HOLD_MS) * 100)
            setHoldPct(pct)
            if (pct >= 100) { stopHold(); router.push('/checkin') }
        }, 50)
    }, [router, stopHold])
    useEffect(() => stopHold, [stopHold])

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Staff strip. Counts only — never names. */}
            <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{eventTitle}</p>
                    {venueName && (
                        <p className="truncate text-xs text-muted-foreground">{venueName}</p>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right tabular-nums">
                        <p className="text-lg font-bold leading-none text-foreground">
                            {counts.checked_in}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            checked in
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="Hold to exit kiosk"
                        onPointerDown={startHold}
                        onPointerUp={stopHold}
                        onPointerLeave={stopHold}
                        onPointerCancel={stopHold}
                        className="relative overflow-hidden rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
                    >
                        <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-75"
                            style={{ width: `${holdPct}%` }}
                        />
                        <span className="relative flex items-center gap-1.5">
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Hold to exit
                        </span>
                    </button>
                </div>
            </header>

            <main className="flex flex-1 items-center justify-center px-5 py-8">
                {result && (result.ok || result.code === 'ALREADY_IN') ? (
                    <Outcome result={result} onDone={reset} />
                ) : (
                    <form onSubmit={submit} className="w-full max-w-md">
                        <h1 className="text-center text-3xl font-bold tracking-tight text-foreground">
                            Check in
                        </h1>
                        <p className="mt-2 text-center text-sm text-muted-foreground">
                            Enter your name and email to get your ticket.
                        </p>

                        <div className="mt-8 space-y-4">
                            <div>
                                <label htmlFor="k-name" className="mb-1.5 block text-sm font-medium text-foreground">
                                    Full name
                                </label>
                                <input
                                    id="k-name"
                                    ref={nameRef}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    autoComplete="off"
                                    autoCapitalize="words"
                                    className="h-14 w-full rounded-xl border border-border bg-card px-4 text-lg text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label htmlFor="k-email" className="mb-1.5 block text-sm font-medium text-foreground">
                                    Email
                                </label>
                                <input
                                    id="k-email"
                                    type="email"
                                    inputMode="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="h-14 w-full rounded-xl border border-border bg-card px-4 text-lg text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        {result && !result.ok && (
                            <p
                                role="alert"
                                className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                            >
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {result.message}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
                        >
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ticket className="h-5 w-5" />}
                            {busy ? 'Checking in…' : 'Check in'}
                        </button>
                    </form>
                )}
            </main>
        </div>
    )
}

/**
 * Full-bleed confirmation. Deliberately readable from arm's length by whoever is
 * working the door, and carries a first name only — enough for staff to see the
 * right person was matched, not enough to expose the guest list.
 */
function Outcome({ result, onDone }: { result: KioskResult; onDone: () => void }) {
    const admitted = result.ok
    const first = ('first_name' in result && result.first_name) || 'there'

    return (
        <button
            type="button"
            onClick={onDone}
            className="flex w-full max-w-md flex-col items-center gap-5 text-center"
        >
            <span
                className={
                    'flex h-24 w-24 items-center justify-center rounded-full ' +
                    (admitted ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-600')
                }
            >
                {admitted ? <Check className="h-12 w-12" /> : <AlertCircle className="h-12 w-12" />}
            </span>

            <span className="text-4xl font-bold tracking-tight text-foreground">
                {admitted ? `You're in, ${first}!` : `Already checked in`}
            </span>

            <span className="text-base text-muted-foreground">
                {result.ok && result.code === 'REGISTERED'
                    ? "We've emailed your ticket. Enjoy the show."
                    : admitted
                      ? 'Enjoy the show.'
                      : `${first}, this ticket has already been used. Please see a staff member.`}
            </span>

            <span className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                Tap anywhere for the next guest
            </span>
        </button>
    )
}
