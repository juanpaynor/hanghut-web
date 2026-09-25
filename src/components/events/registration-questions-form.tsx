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
import { RegistrationFileInput } from './registration-file-input'
import { QuestionHelp } from './question-help'
import { OptionImagePicker, hasOptionImages } from './option-image-picker'
import { visibleQuestions, isSectionBlock } from '@/lib/events/question-visibility'
import { cn } from '@/lib/utils'

export interface RegistrationAnswer {
    question_id: string
    answer: string // JSON array string for multi_choice e.g. '["a","b"]', plain string for others
}

export interface QuestionForForm {
    id: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox' | 'social_profile' | 'url' | 'company' | 'file' | 'date' | 'dropdown' | 'section'
    options: string[]
    is_required: boolean
    display_order: number
    /** Guidance shown under the label — e.g. how to read a size chart. */
    help_text?: string | null
    /** An image shown with the question. A size chart is the motivating case. */
    help_image_url?: string | null
    /** Only ask this when depends_on_question_id holds one of depends_on_values. */
    depends_on_question_id?: string | null
    depends_on_values?: string[] | null
    /** Only ask this of buyers on these ticket tiers. Empty = everyone. */
    tier_ids?: string[] | null
    /** A picture per option, keyed by the option's label. */
    option_images?: Record<string, string> | null
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

    const sortedQuestions = [...questions].sort((a, b) => a.display_order - b.display_order)
    const shown = visibleQuestions(sortedQuestions, answers, null)
    // Sections are not numbered, so the questions around them stay 1, 2, 3.
    const numbering = new Map<string, number>()
    shown.filter(q => !isSectionBlock(q)).forEach((q, i) => numbering.set(q.id, i + 1))
    const numberOf = (id: string) => numbering.get(id) ?? 0

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
        // A hidden question is not missing — it was never asked.
        for (const q of shown) {
            if (isSectionBlock(q) || !q.is_required) continue
            const val = answers[q.id] ?? ''
            if (q.question_type === 'multi_choice') {
                const arr = val ? JSON.parse(val) : []
                if (arr.length === 0) newErrors[q.id] = 'This field is required'
            } else if (q.question_type === 'file') {
                // The answer is a JSON record of the upload, not typed text.
                if (!val.trim()) newErrors[q.id] = 'Please upload a file'
            } else if (!val.trim()) {
                newErrors[q.id] = 'This field is required'
            }
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        const result: RegistrationAnswer[] = shown
            .filter(q => !isSectionBlock(q))
            .map(q => ({
                question_id: q.id,
                answer: answers[q.id] ?? ''
            }))
        onComplete(result)
    }

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
                    {shown.map((q) => (
                        <div key={q.id} className={cn('space-y-1.5', isSectionBlock(q) && 'border-t pt-4 first:border-t-0 first:pt-0')}>
                            {isSectionBlock(q) ? (
                                <h4 className="text-base font-semibold tracking-tight">{q.label}</h4>
                            ) : (
                                <Label className="text-sm font-medium">
                                    {numberOf(q.id)}. {q.label}
                                    {q.is_required && <span className="text-destructive ml-1">*</span>}
                                </Label>
                            )}

                            <QuestionHelp text={q.help_text} imageUrl={q.help_image_url} />

                            {hasOptionImages(q.option_images)
                                && ['single_choice', 'dropdown', 'multi_choice'].includes(q.question_type) && (
                                <OptionImagePicker
                                    options={q.options}
                                    images={q.option_images as Record<string, string>}
                                    multiple={q.question_type === 'multi_choice'}
                                    value={q.question_type === 'multi_choice'
                                        ? (answers[q.id] ? JSON.parse(answers[q.id]) : [])
                                        : (answers[q.id] ?? '')}
                                    onChange={(v) => setAnswer(q.id, Array.isArray(v) ? JSON.stringify(v) : v)}
                                />
                            )}

                            {!hasOptionImages(q.option_images) && q.question_type === 'dropdown' && (
                                <select
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    className={cn(
                                        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        errors[q.id] && 'border-destructive'
                                    )}
                                >
                                    <option value="">Choose…</option>
                                    {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            )}

                            {q.question_type === 'date' && (
                                <Input
                                    type="date"
                                    value={answers[q.id] ?? ''}
                                    onChange={e => setAnswer(q.id, e.target.value)}
                                    className={cn(errors[q.id] && 'border-destructive')}
                                />
                            )}

                            {q.question_type === 'file' && (
                                <RegistrationFileInput
                                    eventId={eventId}
                                    questionId={q.id}
                                    value={answers[q.id] ?? ''}
                                    onChange={(v) => setAnswer(q.id, v)}
                                    disabled={isLoading}
                                />
                            )}

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

                            {!hasOptionImages(q.option_images) && q.question_type === 'single_choice' && (
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

                            {!hasOptionImages(q.option_images) && q.question_type === 'multi_choice' && (
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
