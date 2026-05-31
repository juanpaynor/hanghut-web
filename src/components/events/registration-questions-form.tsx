'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RegistrationAnswer {
    question_id: string
    answer: string // JSON array string for multi_choice e.g. '["a","b"]', plain string for others
}

export interface QuestionForForm {
    id: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox' | 'social_profile' | 'url' | 'company'
    options: string[]
    is_required: boolean
    display_order: number
}

interface Props {
    eventId: string
    questions: QuestionForForm[]
    isOpen: boolean
    onClose: () => void
    onComplete: (answers: RegistrationAnswer[]) => void
    isLoading?: boolean
}

export function RegistrationQuestionsForm({ eventId, questions, isOpen, onClose, onComplete, isLoading }: Props) {
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})

    const setAnswer = (questionId: string, value: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }))
        if (errors[questionId]) setErrors(prev => { const e = { ...prev }; delete e[questionId]; return e })
    }

    const toggleMultiChoice = (questionId: string, option: string) => {
        const current: string[] = answers[questionId] ? JSON.parse(answers[questionId]) : []
        const updated = current.includes(option)
            ? current.filter(o => o !== option)
            : [...current, option]
        setAnswer(questionId, JSON.stringify(updated))
    }

    const handleSubmit = () => {
        const newErrors: Record<string, string> = {}
        for (const q of questions) {
            if (!q.is_required) continue
            const val = answers[q.id] ?? ''
            if (q.question_type === 'multi_choice') {
                const arr = val ? JSON.parse(val) : []
                if (arr.length === 0) newErrors[q.id] = 'This field is required'
            } else if (!val.trim()) {
                newErrors[q.id] = 'This field is required'
            }
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        const result: RegistrationAnswer[] = questions.map(q => ({
            question_id: q.id,
            answer: answers[q.id] ?? ''
        }))
        onComplete(result)
    }

    const sortedQuestions = [...questions].sort((a, b) => a.display_order - b.display_order)

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-primary" />
                        Registration Questions
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">Please fill in the details below before proceeding.</p>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {sortedQuestions.map((q, index) => (
                        <div key={q.id} className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                {index + 1}. {q.label}
                                {q.is_required && <span className="text-destructive ml-1">*</span>}
                            </Label>

                            {q.question_type === 'short_text' && (
                                <Input
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    placeholder="Your answer"
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'long_text' && (
                                <Textarea
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    placeholder="Your answer"
                                    rows={3}
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'url' && (
                                <Input
                                    type="url"
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    placeholder="https://"
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'social_profile' && (
                                <Input
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    placeholder="e.g. linkedin.com/in/username or @handle"
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'company' && (
                                <Input
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    placeholder="Company or organization name"
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'checkbox' && (
                                <div className="flex items-center gap-2 pt-1">
                                    <Checkbox
                                        id={q.id}
                                        checked={answers[q.id] === 'true'}
                                        onCheckedChange={(checked) => setAnswer(q.id, checked ? 'true' : 'false')}
                                    />
                                    <label htmlFor={q.id} className="text-sm text-muted-foreground cursor-pointer">Yes</label>
                                </div>
                            )}

                            {q.question_type === 'single_choice' && (
                                <RadioGroup
                                    value={answers[q.id] ?? ''}
                                    onValueChange={v => setAnswer(q.id, v)}
                                    className="space-y-1.5 pt-1"
                                >
                                    {q.options.map(opt => (
                                        <div key={opt} className="flex items-center gap-2">
                                            <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                                            <label htmlFor={`${q.id}-${opt}`} className="text-sm cursor-pointer">{opt}</label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            )}

                            {q.question_type === 'multi_choice' && (
                                <div className="space-y-1.5 pt-1">
                                    {q.options.map(opt => {
                                        const selected: string[] = answers[q.id] ? JSON.parse(answers[q.id]) : []
                                        return (
                                            <div key={opt} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`${q.id}-${opt}`}
                                                    checked={selected.includes(opt)}
                                                    onCheckedChange={() => toggleMultiChoice(q.id, opt)}
                                                />
                                                <label htmlFor={`${q.id}-${opt}`} className="text-sm cursor-pointer">{opt}</label>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {errors[q.id] && <p className="text-xs text-destructive">{errors[q.id]}</p>}
                        </div>
                    ))}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isLoading} className="bg-primary">
                        {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : 'Continue to Checkout'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
