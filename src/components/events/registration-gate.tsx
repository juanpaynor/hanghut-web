'use client'

import { useState } from 'react'
import { TicketSelector } from '@/components/events/ticket-selector'
import { RegistrationQuestionsForm, QuestionForForm, RegistrationAnswer } from '@/components/events/registration-questions-form'
import { Button } from '@/components/ui/button'
import { Ticket } from 'lucide-react'

interface RegistrationGateProps {
    eventId: string
    ticketPrice: number
    minTickets?: number
    maxTickets?: number
    isSoldOut: boolean
    tiers?: any[]
    fullWidth?: boolean
    trigger?: React.ReactNode
    questions: QuestionForForm[]
}

const ANSWERS_STORAGE_KEY = (eventId: string) => `reg_answers_${eventId}`

export function RegistrationGate({
    eventId,
    ticketPrice,
    minTickets,
    maxTickets,
    isSoldOut,
    tiers,
    fullWidth,
    trigger,
    questions,
}: RegistrationGateProps) {
    const [showQuestionsForm, setShowQuestionsForm] = useState(false)
    const [showTicketSelector, setShowTicketSelector] = useState(false)

    // No questions — render TicketSelector directly, zero behaviour change
    if (questions.length === 0) {
        return (
            <TicketSelector
                eventId={eventId}
                ticketPrice={ticketPrice}
                minTickets={minTickets}
                maxTickets={maxTickets}
                isSoldOut={isSoldOut}
                tiers={tiers}
                fullWidth={fullWidth}
                trigger={trigger}
            />
        )
    }

    const handleQuestionsComplete = (answers: RegistrationAnswer[]) => {
        // Store answers in sessionStorage so CheckoutClient can pick them up
        sessionStorage.setItem(ANSWERS_STORAGE_KEY(eventId), JSON.stringify(answers))
        setShowQuestionsForm(false)
        setShowTicketSelector(true)
    }

    const handleOpenGate = () => {
        if (isSoldOut) return
        setShowQuestionsForm(true)
    }

    const defaultTrigger = (
        <Button
            size="lg"
            className={fullWidth ? 'w-full bg-primary' : 'bg-primary w-full md:w-auto'}
            disabled={isSoldOut}
            onClick={handleOpenGate}
        >
            <Ticket className="h-5 w-5 mr-2" />
            {isSoldOut ? 'Sold Out' : 'Get Tickets'}
        </Button>
    )

    return (
        <>
            {/* The visible trigger button */}
            {trigger
                ? <div onClick={handleOpenGate}>{trigger}</div>
                : defaultTrigger
            }

            {/* Step 1: Registration questions modal */}
            <RegistrationQuestionsForm
                eventId={eventId}
                questions={questions}
                isOpen={showQuestionsForm}
                onClose={() => setShowQuestionsForm(false)}
                onComplete={handleQuestionsComplete}
            />

            {/* Step 2: Ticket selector — opens programmatically after questions */}
            {showTicketSelector && (
                <TicketSelector
                    eventId={eventId}
                    ticketPrice={ticketPrice}
                    minTickets={minTickets}
                    maxTickets={maxTickets}
                    isSoldOut={isSoldOut}
                    tiers={tiers}
                    fullWidth={fullWidth}
                    trigger={<span />}
                    autoOpen
                    onClose={() => setShowTicketSelector(false)}
                />
            )}
        </>
    )
}
