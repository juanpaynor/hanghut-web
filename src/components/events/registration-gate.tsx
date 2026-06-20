'use client'

import { useEffect, useState } from 'react'
import { TicketSelector } from '@/components/events/ticket-selector'
import { RegisterModal } from '@/components/events/register-modal'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Clock } from 'lucide-react'
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
}

/**
 * Pre-checkout registration gate. Events with registration questions answer them
 * in a dedicated modal FIRST; the resulting (auto-)approved registration_id is
 * stashed so checkout skips its own question step. Approval/invite events that go
 * pending stop here with a friendly notice. Events with no questions fall straight
 * through to the normal TicketSelector.
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
}: RegistrationGateProps) {
    const [modalOpen, setModalOpen] = useState(false)
    const [registered, setRegistered] = useState(false)
    const [pending, setPending] = useState(false)
    const [isLoggedIn, setIsLoggedIn] = useState(false)

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user))
    }, [])

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

    // No registration questions → unchanged ticket flow.
    if (questions.length === 0) return selector(false)

    // Registered + approved → pick tickets (checkout reads approved_reg_{id}).
    if (registered) return selector(true)

    // Approval/invite request awaiting organizer review.
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
                onApproved={(regId) => {
                    if (typeof window !== 'undefined') sessionStorage.setItem(`approved_reg_${eventId}`, regId)
                    setModalOpen(false)
                    setRegistered(true)
                }}
                onPending={() => setPending(true)}
            />
        </>
    )
}
