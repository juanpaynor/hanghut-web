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
import { formatInManila } from '@/lib/datetime'
import {
    answersToFormState,
    rememberPresaleToken,
    fetchResumableRegistration,
    rememberRegistration,
    rememberedRegistrationId,
    stillMissingQuestions,
    type ResumedRegistration,
} from '@/lib/events/resume-registration'

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
    /** Organizer's custom buy-button wording for paid events. */
    ctaLabel?: string
    /** How tiers are presented (from event.layout_config.tiers). inline defaults on. */
    tierDisplay?: TierDisplayConfig
    /** How the registration questions are presented (event.layout_config.registration.layout). */
    formLayout?: 'stepper' | 'single'
    /**
     * Which comes first (event.layout_config.registration.order).
     *
     * 'ticket_first' hands the attendee straight to the ticket selector and
     * lets CHECKOUT ask the questions — it already asks the full tier-aware set
     * and collects guest identity for anyone arriving without a registration.
     * Default and fallback is the original 'questions_first'.
     */
    flowOrder?: 'questions_first' | 'ticket_first'
    /**
     * Where this event is in its presale, resolved ON THE SERVER.
     *
     * Deliberately not a timestamp compared in the browser. The page already
     * decides `isEventSalesClosed` server-side, and doing the same here keeps
     * the first paint identical to the markup — a `new Date()` comparison in
     * render is a hydration mismatch waiting for the second the clock ticks
     * between the two.
     *
     * null/undefined = this event has no presale, which is every event today.
     */
    presaleState?: 'before' | 'presale' | 'public' | null
    /** When the presale opens, for the copy. */
    presaleOpensAt?: string | null
    /** Has this viewer already pre-registered (or arrived with a valid link)? */
    onPresaleList?: boolean
    /** The list has stopped taking new people. */
    presaleListClosed?: boolean
    /** ?pt= from the on-sale email, stashed so checkout can still send it. */
    presaleToken?: string | null
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
    ctaLabel,
    tierDisplay,
    formLayout,
    flowOrder,
    presaleState,
    presaleOpensAt,
    onPresaleList,
    presaleListClosed,
    presaleToken,
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
    /**
     * The organizer shut the pre-registration list (P0006 from
     * submit_event_request).
     *
     * Separate from claimFailed because the two need opposite advice: a failed
     * claim is worth retrying, a closed list never is. Sharing claimFailed's
     * "Something went wrong. Please try again." would have people hammering a
     * button that cannot ever succeed.
     */
    const [listClosed, setListClosed] = useState(false)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [viewerEmail, setViewerEmail] = useState<string | null>(null)
    /** Token for the ticket we just issued. The page was server-rendered before
     *  this ticket existed, so `ticketToken` is null for anyone who registers
     *  live — which is why "View ticket" used to fall back to the signed-in-only
     *  /account page. */
    const [claimedToken, setClaimedToken] = useState<string | null>(null)
    const [rsvpSubmitting, setRsvpSubmitting] = useState(false)
    const claimStartedRef = useRef(false)
    /** What this registrant told us last time, for the modal to prefill. */
    const [resumePrefill, setResumePrefill] = useState<{
        name?: string | null
        email?: string | null
        answers?: Record<string, any>
    } | null>(null)
    const resumeTriedRef = useRef(false)

    const registered = !!regId
    // ── Presale ──────────────────────────────────────────────────────────────
    // `registered ||` matters: onPresaleList was resolved when the page was
    // rendered, so the moment someone pre-registers in the modal it is stale
    // and would still say "you are not on the list" to the person who just
    // joined it.
    const presaleOn = presaleState != null
    const onList = (onPresaleList ?? false) || registered
    const presaleBlocked = presaleState === 'before'
        || (presaleState === 'presale' && !onList)

    // The token arrives once, in the URL. Checkout is several screens away and
    // nothing carries a query param that far, so stash it the moment we see it.
    useEffect(() => {
        if (presaleToken) rememberPresaleToken(eventId, presaleToken)
    }, [eventId, presaleToken])

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            setIsLoggedIn(!!data.user)
            setViewerEmail(data.user?.email ?? null)
        })
    }, [])

    // Mirror a server-resolved approval into storage so checkout agrees.
    useEffect(() => {
        if (initialApprovedRegistrationId) {
            rememberRegistration(eventId, initialApprovedRegistrationId)
        }
    }, [initialApprovedRegistrationId, eventId])

    /**
     * "Save responses so a returning registrant goes straight to payment."
     *
     * The id was already being kept, but in sessionStorage, which dies with the
     * tab — and the measured gap before someone comes back averages 173 hours.
     * It now lives in localStorage, and this asks the server what that
     * registration already holds.
     *
     * Two deliberate limits:
     *
     * 1. SKIPPING the form outright is for PAID events only. On a free event,
     *    setting regId is what arms the auto-claim effect below, so resuming
     *    into it would mint a real scannable ticket on page load with no click.
     *    A free event has no payment to go straight to, so there is nothing to
     *    gain by it either. Free events get the answers prefilled instead.
     *
     * 2. A registration that already produced an order is prefilled but NOT
     *    reused. They may well be buying a second ticket, and that purchase
     *    needs its own row — submit_event_request refuses to reuse a
     *    consummated one anyway, so claiming it here would only make checkout
     *    skip questions whose answers then had nowhere to go.
     */
    useEffect(() => {
        if (resumeTriedRef.current) return
        if (questions.length === 0 || hasTicket || regId) return
        const remembered = rememberedRegistrationId(eventId)
        if (!remembered) return
        resumeTriedRef.current = true

        let cancelled = false
        void (async () => {
            const resumed = await fetchResumableRegistration(createClient(), eventId, remembered)
            if (cancelled || !resumed) return

            const answers = answersToFormState(resumed)
            setResumePrefill({
                name: resumed.guest_name,
                email: resumed.guest_email,
                answers,
            })
            if (resumed.guest_email) {
                setGuest({ name: resumed.guest_name ?? '', email: resumed.guest_email })
            }

            // No tier is chosen at this point, so tier-scoped questions are not
            // part of this decision — checkout asks those once a ticket is picked.
            const missing = stillMissingQuestions(questions, answers, null)
            // Only a LIVE registration may be reused. A 'cancelled' one is
            // resumable for its answers and nothing else: it was released by
            // expire_stale_registrations(), and reusing it would carry that
            // status through payment, leaving a real paying attendee filed as
            // cancelled and therefore invisible on the organizer's roster —
            // the clutter complaint this all started from, inverted. 161 rows
            // are in that state right now and the job adds more every 15
            // minutes. Prefilled and tapped through instead, so
            // submit_event_request opens a correctly-statused row.
            const reusable = resumed.status === 'approved' || resumed.status === 'auto_approved'
            if (!isFree && reusable && !resumed.consummated && missing.length === 0) {
                setRegId(resumed.registration_id)
            }
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, questions, hasTicket, regId, isFree])

    // Free events: once registered/approved, claim the ticket in one step
    // (skip the redundant "Get Tickets" → checkout dance for $0 RSVPs).
    useEffect(() => {
        if (!registered || !isFree || hasTicket || claimed || claimFailed) return
        // ⚠ A FREE EVENT MINTS A TICKET THE INSTANT SOMEONE REGISTERS.
        // During a shut presale this call reaches the gate and comes back
        // EVENT_NOT_YET_ON_SALE, which sets claimFailed and shows an error to
        // somebody who has just successfully joined the list. Worse, it would
        // be the one path where "pre-register now, get in later" silently
        // became "get your ticket now", defeating the whole feature on exactly
        // the events most likely to need it (free, capacity-limited). They
        // claim when they come back after it opens.
        if (presaleBlocked) return
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
    }, [registered, isFree, hasTicket, claimed, claimFailed, eventId, freeTierId, regId, guest, presaleBlocked])

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
            ctaLabel={ctaLabel}
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

    // Hoisted so the presale branch below and the ordinary Register CTA at the
    // bottom open the SAME modal with the same handlers. A second copy would
    // drift — and it is the copy that remembers the registration id, which is
    // the thing a returning pre-registrant depends on.
    const registerModal = (
        <RegisterModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            event={{ id: eventId, title: eventTitle, require_approval: requireApproval, invite_only: inviteOnly }}
            questions={questions}
            isLoggedIn={isLoggedIn}
            themeColor={themeColor}
            dark={dark}
            pageTheme={pageTheme}
            formLayout={formLayout}
            prefill={resumePrefill}
            onApproved={(rid, g) => {
                rememberRegistration(eventId, rid)
                setModalOpen(false)
                setGuest(g ?? null)
                setRegId(rid)
            }}
            onPending={() => setPending(true)}
        />
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

    // ── Presale ──────────────────────────────────────────────────────────────
    // AFTER "already going", so a pre-registrant who has bought still sees
    // their ticket rather than being told to wait for a sale they already made.
    // BEFORE "nothing on sale", because when a presale is set the tiers are
    // usually scheduled too, and "Tickets aren't on sale yet. Check back soon."
    // is the strictly worse version of what this says — it has no date, no way
    // to join, and no idea the buyer is already on the list.
    //
    // Only the BLOCKING states return here. Anyone allowed to buy falls through
    // to the ordinary flow, so the tier windows still get the last word.
    if (presaleOn && presaleBlocked) {
        const opensCopy = formatInManila(presaleOpensAt, {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: 'numeric', minute: '2-digit',
        })

        // On the list, waiting. The one job of this screen is to stop them
        // checking back blind — give them the date.
        if (onList) {
            return (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-primary" />
                    <p className="font-semibold">You&apos;re on the list</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {opensCopy
                            ? <>Tickets open to you on <strong className="text-foreground">{opensCopy}</strong>. We&apos;ll email you.</>
                            : <>We&apos;ll email you the moment tickets open.</>}
                    </p>
                </div>
            )
        }

        // Not on the list. Two different situations, and the difference matters:
        // the list may still be open to them, or it may have shut.
        const listShut = presaleListClosed === true
        return (
            <>
                <div className="rounded-xl border p-5 text-center">
                    <Lock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="font-semibold">
                        {presaleState === 'before' ? 'Early access' : 'Pre-registered buyers only'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {listShut
                            ? 'Tickets are being sold to people who registered in advance. Registration for this one has closed.'
                            : presaleState === 'before'
                                ? <>Register now and you can buy{opensCopy ? <> from <strong className="text-foreground">{opensCopy}</strong></> : ' first'}, before anyone else.</>
                                : 'Tickets are open to people who registered in advance. Register now to buy.'}
                    </p>
                    {!listShut && !isSoldOut && (
                        <Button size="lg" className="mt-3" onClick={() => setModalOpen(true)}>
                            <ClipboardList className="mr-2 h-5 w-5" />
                            Pre-register
                        </Button>
                    )}
                </div>
                {registerModal}
            </>
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
                if (error) {
                    // claimFailed is still set either way: it is what stops the
                    // auto-claim effect retrying a call that already refused.
                    if ((error.message || '').includes('has closed')) setListClosed(true)
                    setClaimFailed(true); setRsvpSubmitting(false); return
                }
                if ((data as any)?.status === 'pending') { setPending(true); setRsvpSubmitting(false) }
                else setRegId((data as any)?.registration_id ?? null) // → registered spinner → claim
            } catch { setClaimFailed(true); setRsvpSubmitting(false) }
        }
        return (
            <>
                {claimFailed && (
                    <p className="mb-3 text-sm text-red-600 text-center">
                        {listClosed
                            ? 'Registration for this event has closed.'
                            : 'Something went wrong. Please try again.'}
                    </p>
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
                    formLayout={formLayout}
                    prefill={resumePrefill}
                    onApproved={(rid, g) => {
                        rememberRegistration(eventId, rid)
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

    /**
     * ── Ticket first → the same normal ticket flow ────────────────────────────
     *
     * Checkout asks the questions instead, which it already does for anyone who
     * reaches it without a registration. The win is WHEN the row is written:
     * questions-first writes it before the attendee has seen a price (314 rows
     * with no payment on one event, 185 of which never reached the payment
     * screen), ticket-first writes it when they press Pay.
     *
     * The three refusals are repeated here rather than trusted to the setter.
     * An organizer can switch approval on, or drop every paid tier, AFTER
     * saving this — and a stored value that strands a buyer mid-flow is not
     * something to find out from a support message:
     *
     *   FREE — nothing to pay, and on the free path it is setting regId that
     *   arms the auto-claim which mints the ticket.
     *   APPROVAL / INVITE-ONLY — they must be cleared before paying, so this
     *   would let them choose a ticket and answer everything, then be told to
     *   wait or that they were never invited.
     *
     * nothingOnSale is left to ticketUI, which already says "closed" properly.
     */
    const ticketFirst =
        flowOrder === 'ticket_first' && !isFree && !requireApproval && !inviteOnly
    if (ticketFirst) return ticketUI(false)

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

            {registerModal}
        </>
    )
}
