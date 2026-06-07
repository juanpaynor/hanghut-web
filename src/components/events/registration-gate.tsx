'use client'

import { TicketSelector } from '@/components/events/ticket-selector'
import type { QuestionForForm } from '@/components/events/registration-questions-form'
import { AppDownloadPrompt } from '@/components/shared/app-download-prompt'

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
    // No questions — render TicketSelector directly
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

    // Has registration questions — send web visitors to the app
    return (
        <AppDownloadPrompt
            title="Registration required"
            description="This event requires registration through the HangHut app. Download it free to register and buy tickets."
        />
    )
}
