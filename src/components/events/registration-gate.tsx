'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TicketSelector } from '@/components/events/ticket-selector'
import { RegisterModal } from '@/components/events/register-modal'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Clock, CheckCircle2, Loader2, Ticket } from 'lucide-react'
import type { QuestionForForm } from '@/components/events/registration-questions-form'

interface RegistrationGateProps {
    eventId: string
    eventTitle: string
    ticketPrice: number
    minTickets?: number
    maxTickets?: number
    isSoldOut: boolean
    tiers?: any[]
    fullWidth?: boolean
    subscriberDiscount?: any
    questions: QuestionForForm[]
    requireApproval?: boolean
    inviteOnly?: boolean
    themeColor?: string | null
    dark?: boolean
    /** Buyer already has an approved registration → skip questions, go to tickets. */
    initialApprovedRegistrationId?: string | null
    /** Buyer already holds a valid ticket → show "You're going". */
    hasTicket?: boolean
    /** Token for the buyer's hosted ticket page (when known). */
    ticketToken?: string | null
    /** RSVP mode (free events): single custom-labeled button, no quantity/checkout. */
    rsvpMode?: boolean
    rsvpLabel?: string
}

/**
 * Pre-checkout registration gate.
 *  - No questions → normal TicketSelector.
 *  - Has questions → answer them in the Register modal first.
 *  - Free events → answering questions issues the ticket in one step (auto-claim).
 *  - Paid events → after registration, pick tickets → checkout.
 *  - Already has a ticket → "You're going" (no duplicate checkout).
 */
export function RegistrationGate({
    eventId,
    eventTitle,
    ticketPrice,
    minTickets,
    maxTickets,
    isSoldOut,
    tiers,
    fullWidth,
    subscriberDiscount,
    questions,
    requireApproval,
    inviteOnly,
    themeColor,
    dark,
    initialApprovedRegistrationId,
    hasTicket,
    ticketToken,
    rsvpMode,
    rsvpLabel,
}: RegistrationGateProps) {
    const activeTiers = (tiers || []).filter((t: any) => t.is_active !== false)
    const isFree = activeTiers.length > 0
        ? activeTiers.every((t: any) => Number(t.price) === 0)
        : Number(ticketPrice) === 0
    const freeTierId: string | null = activeTiers[0]?.id ?? null

    const [modalOpen, setModalOpen] = useState(false)
    const [regId, setRegId] = useState<string | null>(initialApprovedRegistrationId ?? null)
    const [guest, setGuest] = useState<{ name: string; email: string } | null>(null)
    const [pending, setPending] = useState(false)
    const [claimed, setClaimed] = useState(false)
    const [claimFailed, setClaimFailed] = useState(false)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [rsvpSubmitting, setRsvpSubmitting] = useState(false)
    const claimStartedRef = useRef(false)

    const registered = !!regId

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user))
    }, [])

    // Mirror a server-resolved approval into sessionStorage so checkout agrees.
    useEffect(() => {
        if (initialApprovedRegistrationId && typeof window !== 'undefined') {
            sessionStorage.setItem(`approved_reg_${eventId}`, initialApprovedRegistrationId)
        }
    }, [initialApprovedRegistrationId, eventId])

    // Free events: once registered/approved, claim the ticket in one step
    // (skip the redundant "Get Tickets" → checkout dance for $0 RSVPs).
    useEffect(() => {
        if (!registered || !isFree || hasTicket || claimed || claimFailed) return
        if (claimStartedRef.current) return
        claimStartedRef.current = true
        ;(async () => {
            try {
                const { data, error } = await createClient().functions.invoke('create-purchase-intent', {
                    body: {
                        event_id: eventId,
                        quantity: 1,
                        tier_id: freeTierId,
                        registration_id: regId,
                        guest_details: guest ?? undefined,
                    },
                })
                if (!error && (data as any)?.success) setClaimed(true)
                else setClaimFailed(true)
            } catch {
                setClaimFailed(true)
            }
        })()
    }, [registered, isFree, hasTicket, claimed, claimFailed, eventId, freeTierId, regId, guest])

    const selector = (autoOpen: boolean) => (
        <TicketSelector
            eventId={eventId}
            ticketPrice={ticketPrice}
            minTickets={minTickets}
            maxTickets={maxTickets}
            isSoldOut={isSoldOut}
            tiers={tiers}
            fullWidth={fullWidth}
            subscriberDiscount={subscriberDiscount}
            autoOpen={autoOpen}
            trigger={autoOpen ? undefined : null}
        />
    )

    // ── Already going (has a ticket, or just claimed a free one) ──────────────
    if (hasTicket || claimed) {
        return (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-500" />
                <p className="font-semibold">You&apos;re going!</p>
                <p className="mt-1 text-sm text-muted-foreground">Your ticket is confirmed.</p>
                <Button asChild className="mt-3 gap-1.5">
                    <Link href={ticketToken ? `/t/${ticketToken}` : '/account'}>
                        <Ticket className="h-4 w-4" /> View ticket
                    </Link>
                </Button>
            </div>
        )
    }

    // ── Approval/invite request awaiting organizer review ─────────────────────
    if (pending) {
        return (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
                <Clock className="mx-auto mb-2 h-6 w-6 text-amber-500" />
                <p className="font-semibold">Registration submitted</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    The organizer reviews registrations for this event. You&apos;ll get an email once you&apos;re approved.
                </p>
            </div>
        )
    }

    // ── Registered ────────────────────────────────────────────────────────────
    if (registered) {
        // Free + claiming/claimed handled above; show a spinner while it issues.
        if (isFree && !claimFailed) {
            return (
                <div className="rounded-xl border p-6 text-center">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Getting your ticket…</p>
                </div>
            )
        }
        // Paid (or free claim failed → let them retry via checkout).
        return selector(true)
    }

    // ── RSVP mode (free events): single custom-labeled button, no quantity ─────
    if (rsvpMode) {
        if (rsvpSubmitting) {
            return (
                <div className="rounded-xl border p-6 text-center">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Reserving your spot…</p>
                </div>
            )
        }
        const label = isSoldOut ? 'Event full' : (rsvpLabel || 'RSVP')
        const onRsvp = async () => {
            setClaimFailed(false)
            // Any custom questions → modal (collects answers; guests also get an
            // identity step). Safe for both guest and logged-in.
            if (questions.length > 0) { setModalOpen(true); return }
            // No questions → decide from FRESH auth. The isLoggedIn state resolves
            // async, so relying on it can race the modal into an empty-step crash.
            const { data: { user } } = await createClient().auth.getUser()
            if (!user) { setModalOpen(true); return } // guest → modal identity step
            // Logged-in + no questions → register in one tap via the same RPC the
            // modal uses. Setting regId then hands off to the shared free-claim
            // effect, which issues the (scannable) ticket.
            if (claimStartedRef.current) return
            setRsvpSubmitting(true)
            try {
                const { data, error } = await createClient().rpc('submit_event_request', {
                    p_event_id: eventId, p_answers: [], p_guest_email: null, p_guest_name: null,
                })
                if (error) { setClaimFailed(true); setRsvpSubmitting(false); return }
                if ((data as any)?.status === 'pending') { setPending(true); setRsvpSubmitting(false) }
                else setRegId((data as any)?.registration_id ?? null) // → registered spinner → claim
            } catch { setClaimFailed(true); setRsvpSubmitting(false) }
        }
        return (
            <>
                {claimFailed && (
                    <p className="mb-3 text-sm text-red-600 text-center">Something went wrong. Please try again.</p>
                )}
                <Button
                    size="lg"
                    className={fullWidth ? 'w-full' : 'w-full md:w-auto'}
                    disabled={isSoldOut}
                    onClick={onRsvp}
                >
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    {label}
                </Button>
                <RegisterModal
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    event={{ id: eventId, title: eventTitle, require_approval: requireApproval, invite_only: inviteOnly }}
                    questions={questions}
                    isLoggedIn={isLoggedIn}
                    themeColor={themeColor}
                    dark={dark}
                    onApproved={(rid, g) => {
                        if (typeof window !== 'undefined') sessionStorage.setItem(`approved_reg_${eventId}`, rid)
                        setModalOpen(false)
                        setGuest(g ?? null)
                        setRegId(rid)
                    }}
                    onPending={() => { setModalOpen(false); setPending(true) }}
                />
            </>
        )
    }

    // ── No registration questions → normal ticket flow ───────────────────────
    if (questions.length === 0) return selector(false)

    // ── Not registered yet → Register CTA + modal ────────────────────────────
    const cta = isSoldOut ? 'Sold Out' : requireApproval || inviteOnly ? 'Request to Register' : 'Register'

    return (
        <>
            <Button
                size="lg"
                className={fullWidth ? 'w-full' : 'w-full md:w-auto'}
                disabled={isSoldOut}
                onClick={() => setModalOpen(true)}
            >
                <ClipboardList className="mr-2 h-5 w-5" />
                {cta}
            </Button>

            <RegisterModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                event={{ id: eventId, title: eventTitle, require_approval: requireApproval, invite_only: inviteOnly }}
                questions={questions}
                isLoggedIn={isLoggedIn}
                themeColor={themeColor}
                dark={dark}
                onApproved={(rid, g) => {
                    if (typeof window !== 'undefined') sessionStorage.setItem(`approved_reg_${eventId}`, rid)
                    setModalOpen(false)
                    setGuest(g ?? null)
                    setRegId(rid)
                }}
                onPending={() => setPending(true)}
            />
        </>
    )
}
