'use client'

import { RegistrationQuestionsManager, RegistrationQuestion } from '@/components/organizer/registration-questions-manager'
import { saveExperienceQuestions } from '@/lib/organizer/experience-question-actions'

interface Props {
    tableId: string
    initialQuestions: RegistrationQuestion[]
}

/**
 * Booking questions for an experience — reuses the events question editor, wired
 * to the experience save action and copy. Same UI, same 8 question types.
 */
export function ExperienceQuestionsManager({ tableId, initialQuestions }: Props) {
    return (
        <RegistrationQuestionsManager
            initialQuestions={initialQuestions}
            saveFn={(questions) => saveExperienceQuestions(tableId, questions)}
            heading="Booking Questions"
            subheading="Guests answer these while booking, before they pay. Their answers show up with each booking."
        />
    )
}
