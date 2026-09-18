'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TicketSelector } from '@/components/events/ticket-selector'
import { InlineTierList, type TierDisplayConfig } from '@/components/events/inline-tier-list'
import { RegisterModal } from '@/components/events/register-modal'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Clock, CheckCircle2, Loader2, Ticket, Lock } from 'lucide-react'
import type { QuestionForForm } from '@/components/events/registration-questions-form'
import { isTierOnSale, tierSaleState } from '@/lib/tickets/tier-availability'

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
    /** Art-directed page theme id — carried into the register dialog so the
     *  checkout moment keeps the event's look. */
    pageTheme?: string
    /** Buyer already has an approved registration → skip questions, go to tickets. */
    initialApprovedRegistrationId?: string | null
    /** Buyer already holds a valid ticket → show "You're going". */
    hasTicket?: boolean
    /** Token for the buyer's hosted ticket page (when known). */
    ticketToken?: string | null
    /** RSVP mode (free events): single custom-labeled button, no quantity/checkout. */
    rsvpMode?: boolean
    rsvpLabel?: string
    /** How tiers are presented (from event.layout_config.tiers). inline defaults on. */
    tierDisplay?: TierDisplayConfig
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
    pageTheme,
    initialApprovedRegistrationId,
    hasTicket,
    ticketToken,
    rsvpMode,
    rsvpLabel,
    tierDisplay,
}: RegistrationGateProps) {
    const activeTiers = (tiers || []).filter((t: any) => isTierOnSale(t))
    // A tiered event with nothing on sale is CLOSED — it must not fall through to
    // the event-level price. That fallback is what let a locked-tier event hand
    // out tier-less "general admission" tickets. Only tier-less events use
    // ticketPrice.
    const hasTiers = (tiers?.length ?? 0) > 0
    const nothingOnSale = hasTiers && activeTiers.length === 0
    const isFree = activeTiers.length > 0
        ? activeTiers.every((t: any) => Number(t.price) === 0)
        : !hasTiers && Number(ticketPrice) === 0
    const freeTierId: string | null = activeTiers[0]?.id ?? null

    const [modalOpen, setModalOpen] = useState(false)
    const [regId, setRegId] = useState<string | null>(initialApprovedRegistrationId ?? null)
    const [guest, setGuest] = useState<{ name: string; email: string } | null>(null)
    const [pending, setPending] = useState(false)
    const [claimed, setClaimed] = useState(false)
    const [claimFailed, setClaimFailed] = useState(false)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [viewerEmail, setViewerEmail] = useState<string | null>(null)
    /** Token for the ticket we just issued. The page was server-rendered before
     *  this ticket existed, so `ticketToken` is null for anyone who registers
     *  live — which is why "View ticket" used to fall back to the signed-in-only
     *  /account page. */
    const [claimedToken, setClaimedToken] = useState<string | null>(null)
    const [rsvpSubmitting, setRsvpSubmitting] = useState(false)
    const claimStartedRef = useRef(false)

    const registered = !!regId

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            setIsLoggedIn(!!data.user)
            setViewerEmail(data.user?.email ?? null)
        })
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
                        source: 'web',
                    },
                })
                if (!error && (data as any)?.success) {
                    setClaimedToken((data as any).data?.access_token ?? null)
                    setClaimed(true)
                } else setClaimFailed(true)
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

    // Inline tier list is the default presentation; organizers can switch back to
    // the "Get Tickets" popup by turning inline off in the tier display settings.
    const inline = tierDisplay?.inline ?? true
    const ticketUI = (autoOpenModal: boolean) =>
        inline ? (
            <InlineTierList
                eventId={eventId}
                ticketPrice={ticketPrice}
                minTickets={minTickets}
                maxTickets={maxTickets}
                isSoldOut={isSoldOut}
                tiers={tiers}
                fullWidth={fullWidth}
                subscriberDiscount={subscriberDiscount}
                display={tierDisplay}
            />
        ) : (
            selector(autoOpenModal)
        )

    // ── Already going (has a ticket, or just claimed a free one) ──────────────
    if (hasTicket || claimed) {
        // Prefer the token from the ticket we just issued, then the one the page
        // was rendered with. /t/<token> is public, so either one shows the ticket
        // without a sign-in; /account is the last resort and does require one.
        const token = claimedToken ?? ticketToken
        const sentTo = guest?.email ?? viewerEmail
        return (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-500" />
                <p className="font-semibold">You&apos;re going!</p>
                <p className="mt-1 text-sm text-muted-foreground">Your ticket is confirmed.</p>
                <Button asChild size="lg" className="mt-3 gap-1.5">
                    <Link href={token ? `/t/${token}` : '/account'}>
                        <Ticket className="h-4 w-4" /> {token ? 'Show my ticket' : 'View ticket'}
                    </Link>
                </Button>
                {token && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        {sentTo ? `We emailed it to ${sentTo} too.` : 'We emailed you a copy too.'}
                    </p>
                )}
            </div>
        )
    }

    // ── Nothing on sale (every tier locked / outside its window) ─────────────
    // Sits after "already going" so a ticket holder still sees their ticket, and
    // before every purchase branch so none of them can run.
    if (nothingOnSale && !hasTicket && !claimed) {
        const states = (tiers || []).map((t: any) => tierSaleState(t))
        const copy = states.every(st => st === 'scheduled')
            ? 'Tickets aren\u2019t on sale yet. Check back soon.'
            : states.every(st => st === 'closed')
                ? 'Ticket sales for this event have closed.'
                : 'Tickets for this event aren\u2019t on sale right now.'
        return (
            <div className="rounded-xl border p-5 text-center">
                <Lock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="font-semibold">Not on sale</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
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
        return ticketUI(true)
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
                    pageTheme={pageTheme}
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
    if (questions.length === 0) return ticketUI(false)

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
                pageTheme={pageTheme}
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
