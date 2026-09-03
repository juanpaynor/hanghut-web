'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { saveRegistrationQuestions } from '@/lib/organizer/registration-actions'

export interface RegistrationQuestion {
    id?: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox' | 'social_profile' | 'url' | 'company'
    options: string[] // for single_choice / multi_choice
    is_required: boolean
    display_order: number
}

const QUESTION_TYPE_LABELS: Record<RegistrationQuestion['question_type'], string> = {
    short_text: 'Short Text',
    long_text: 'Long Text (paragraph)',
    single_choice: 'Single Choice',
    multi_choice: 'Multiple Choice',
    checkbox: 'Checkbox (Yes/No)',
    social_profile: 'Social Profile',
    url: 'URL',
    company: 'Company / Organization',
}

interface Props {
    eventId?: string
    initialQuestions: RegistrationQuestion[]
    // Injectable so the same editor can drive experiences (saveExperienceQuestions)
    // as well as events. Defaults preserve the original event behaviour.
    saveFn?: (questions: RegistrationQuestion[]) => Promise<{ error?: string; success?: boolean; questions?: RegistrationQuestion[] }>
    heading?: string
    subheading?: string
    savedNoun?: string
    // Controlled mode (create wizard): emit changes to the parent and hide the
    // Save button, since the parent persists the questions when the event is
    // created rather than saving them here against an event that doesn't exist yet.
    onChange?: (questions: RegistrationQuestion[]) => void
    hideSave?: boolean
}

export function RegistrationQuestionsManager({ eventId, initialQuestions, saveFn, heading, subheading, onChange, hideSave }: Props) {
    const { toast } = useToast()
    const [questions, setQuestions] = useState<RegistrationQuestion[]>(
        initialQuestions.length > 0
            ? initialQuestions
            : []
    )
    const [isSaving, setIsSaving] = useState(false)

    // Controlled mode: keep the parent in sync so it can persist on event create.
    useEffect(() => {
        if (onChange) onChange(questions)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questions])

    const addQuestion = () => {
        setQuestions(prev => [
            ...prev,
            {
                label: '',
                question_type: 'short_text',
                options: [],
                is_required: false,
                display_order: prev.length,
            }
        ])
    }

    const updateQuestion = (index: number, patch: Partial<RegistrationQuestion>) => {
        setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...patch } : q))
    }

    const removeQuestion = (index: number) => {
        setQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, display_order: i })))
    }

    const moveQuestion = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= questions.length) return
        setQuestions(prev => {
            const updated = [...prev]
            ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
            return updated.map((q, i) => ({ ...q, display_order: i }))
        })
    }

    const addOption = (index: number) => {
        updateQuestion(index, { options: [...(questions[index].options || []), ''] })
    }

    const updateOption = (qIndex: number, oIndex: number, value: string) => {
        const options = [...(questions[qIndex].options || [])]
        options[oIndex] = value
        updateQuestion(qIndex, { options })
    }

    const removeOption = (qIndex: number, oIndex: number) => {
        const options = questions[qIndex].options.filter((_, i) => i !== oIndex)
        updateQuestion(qIndex, { options })
    }

    const handleSave = async () => {
        // Validate
        for (let i = 0; i < questions.length; i++) {
            if (!questions[i].label.trim()) {
                toast({ title: 'Missing question text', description: `Question ${i + 1} needs a label.`, variant: 'destructive' })
                return
            }
            if (['single_choice', 'multi_choice'].includes(questions[i].question_type) && questions[i].options.filter(o => o.trim()).length < 2) {
                toast({ title: 'Not enough options', description: `Question ${i + 1} needs at least 2 options.`, variant: 'destructive' })
                return
            }
        }

        setIsSaving(true)
        const result = saveFn
            ? await saveFn(questions)
            : await saveRegistrationQuestions(eventId!, questions)
        setIsSaving(false)

        if (result.error) {
            toast({ title: 'Failed to save', description: result.error, variant: 'destructive' })
        } else {
            // Update local IDs from server response
            if (result.questions) setQuestions(result.questions)
            toast({ title: 'Questions saved', description: `${questions.length} question${questions.length !== 1 ? 's' : ''} saved.` })
        }
    }

    const needsOptions = (type: RegistrationQuestion['question_type']) =>
        type === 'single_choice' || type === 'multi_choice'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold">{heading ?? 'Registration Questions'}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {subheading ?? 'Attendees will answer these questions before completing their registration.'}
                    </p>
                </div>
                {!hideSave && (
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save Questions'}
                    </Button>
                )}
            </div>

            {questions.length === 0 ? (
                <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
                    <p className="text-muted-foreground mb-4">No questions yet. Add your first question below.</p>
                    <Button variant="outline" onClick={addQuestion}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Question
                    </Button>
                </Card>
            ) : (
                <div className="space-y-4">
                    {questions.map((q, index) => (
                        <Card key={index} className="p-5 space-y-4">
                            {/* Header row */}
                            <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-muted-foreground w-6 shrink-0">#{index + 1}</span>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs mb-1 block">Question</Label>
                                        <Input
                                            value={q.label}
                                            onChange={(e) => updateQuestion(index, { label: e.target.value })}
                                            placeholder="e.g. What's your job title?"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs mb-1 block">Type</Label>
                                        <Select
                                            value={q.question_type}
                                            onValueChange={(v) => updateQuestion(index, {
                                                question_type: v as RegistrationQuestion['question_type'],
                                                options: needsOptions(v as RegistrationQuestion['question_type']) ? (q.options.length ? q.options : ['', '']) : []
                                            })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Required toggle */}
                                <div className="flex flex-col items-center gap-1 shrink-0">
                                    <span className="text-xs text-muted-foreground">Required</span>
                                    <Switch
                                        checked={q.is_required}
                                        onCheckedChange={(checked) => updateQuestion(index, { is_required: checked })}
                                    />
                                </div>

                                {/* Move up/down */}
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" onClick={() => moveQuestion(index, 'up')} disabled={index === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ChevronUp className="h-3 w-3" />
                                    </button>
                                    <button type="button" onClick={() => moveQuestion(index, 'down')} disabled={index === questions.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ChevronDown className="h-3 w-3" />
                                    </button>
                                </div>

                                {/* Delete */}
                                <button
                                    type="button"
                                    onClick={() => removeQuestion(index)}
                                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Options for single/multi choice */}
                            {needsOptions(q.question_type) && (
                                <div className="ml-8 space-y-2">
                                    <Label className="text-xs text-muted-foreground">Options</Label>
                                    {(q.options || []).map((opt, oIndex) => (
                                        <div key={oIndex} className="flex items-center gap-2">
                                            <Input
                                                value={opt}
                                                onChange={(e) => updateOption(index, oIndex, e.target.value)}
                                                placeholder={`Option ${oIndex + 1}`}
                                                className="max-w-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeOption(index, oIndex)}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(index)}>
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Option
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ))}

                    <Button variant="outline" onClick={addQuestion} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Question
                    </Button>
                </div>
            )}
        </div>
    )
}
