'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'

interface RegistrationQuestion {
    id: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox' | 'social_profile' | 'url' | 'company'
    options: string[] | null
    is_required: boolean
    display_order: number
}

interface Props {
    registrationQuestions: RegistrationQuestion[]
    regAnswers: Record<string, any>
    setRegAnswers: React.Dispatch<React.SetStateAction<Record<string, any>>>
    requireApproval: boolean
}

/**
 * Controlled, presentational registration-questions form. Extracted from
 * CheckoutClient and lazy-loaded so the ~60% of checkouts that never require
 * approval / custom questions don't ship this code. The parent still owns
 * `regAnswers` and feeds it to the payment flow — behavior is unchanged.
 */
export function RegistrationQuestionsCard({ registrationQuestions, regAnswers, setRegAnswers, requireApproval }: Props) {
    return (
        <Card className="border-border/50 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                    <ClipboardList className="w-5 h-5" />
                    Registration Questions
                </CardTitle>
                <CardDescription>
                    {requireApproval
                        ? 'The organizer requires approval for this event. Please answer the questions below.'
                        : 'Please answer the following questions to complete your registration.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {registrationQuestions.map((q) => (
                    <div key={q.id} className="space-y-2">
                        <Label htmlFor={`q_${q.id}`}>
                            {q.label}
                            {q.is_required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        {(q.question_type === 'short_text' || q.question_type === 'url' || q.question_type === 'social_profile' || q.question_type === 'company') && (
                            <Input
                                id={`q_${q.id}`}
                                placeholder={
                                    q.question_type === 'url' ? 'https://...'
                                    : q.question_type === 'social_profile' ? '@username'
                                    : q.question_type === 'company' ? 'Company name'
                                    : ''
                                }
                                value={regAnswers[q.id] ?? ''}
                                onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                className="bg-muted/30"
                            />
                        )}
                        {q.question_type === 'long_text' && (
                            <textarea
                                id={`q_${q.id}`}
                                rows={3}
                                className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={regAnswers[q.id] ?? ''}
                                onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            />
                        )}
                        {q.question_type === 'single_choice' && q.options && (
                            <div className="space-y-2">
                                {q.options.map((opt) => (
                                    <Label key={opt} className="flex items-center gap-3 cursor-pointer font-normal">
                                        <input
                                            type="radio"
                                            name={`q_${q.id}`}
                                            value={opt}
                                            checked={regAnswers[q.id] === opt}
                                            onChange={() => setRegAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                            className="h-4 w-4 text-primary"
                                        />
                                        {opt}
                                    </Label>
                                ))}
                            </div>
                        )}
                        {q.question_type === 'multi_choice' && q.options && (
                            <div className="space-y-2">
                                {q.options.map((opt) => (
                                    <Label key={opt} className="flex items-center gap-3 cursor-pointer font-normal">
                                        <input
                                            type="checkbox"
                                            checked={Array.isArray(regAnswers[q.id]) && regAnswers[q.id].includes(opt)}
                                            onChange={(e) => {
                                                const current: string[] = Array.isArray(regAnswers[q.id]) ? regAnswers[q.id] : []
                                                setRegAnswers(prev => ({
                                                    ...prev,
                                                    [q.id]: e.target.checked
                                                        ? [...current, opt]
                                                        : current.filter(v => v !== opt)
                                                }))
                                            }}
                                            className="h-4 w-4 rounded text-primary"
                                        />
                                        {opt}
                                    </Label>
                                ))}
                            </div>
                        )}
                        {q.question_type === 'checkbox' && (
                            <Label className="flex items-center gap-3 cursor-pointer font-normal">
                                <input
                                    type="checkbox"
                                    checked={!!regAnswers[q.id]}
                                    onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))}
                                    className="h-4 w-4 rounded text-primary"
                                />
                                {q.label}
                            </Label>
                        )}
                    </div>
                ))}
                {requireApproval && (
                    <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <span className="text-base leading-none">⏳</span>
                        <p>This event requires organizer approval. After submitting, you&apos;ll be notified by email when your registration is reviewed.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
