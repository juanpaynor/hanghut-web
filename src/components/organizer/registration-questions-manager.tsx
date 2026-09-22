'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Loader2,
    Settings2, ImagePlus, X, GitBranch, Ticket, Rows3, Layers,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { saveRegistrationQuestions, uploadQuestionHelpImage } from '@/lib/organizer/registration-actions'
import { setRegistrationFormLayout } from '@/lib/organizer/registration-layout-actions'
import { cn } from '@/lib/utils'

export type QuestionType =
    | 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox'
    | 'social_profile' | 'url' | 'company' | 'file' | 'date'

export interface RegistrationQuestion {
    id?: string
    /** Client-stable identity. For a saved question this IS its id; for a new
     *  one it's a temporary uuid, so a sibling added in the same session can
     *  depend on it before either has been written. */
    key?: string
    label: string
    question_type: QuestionType
    options: string[]
    is_required: boolean
    display_order: number
    help_text?: string
    help_image_url?: string
    /** Key of the question that controls whether this one is shown. */
    depends_on_key?: string | null
    /** Answers to the controlling question that reveal this one. */
    depends_on_values?: string[]
    /** Ticket tiers this question applies to. Empty = everyone. */
    tier_ids?: string[]
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    short_text: 'Short Text',
    long_text: 'Long Text (paragraph)',
    single_choice: 'Single Choice',
    multi_choice: 'Multiple Choice',
    checkbox: 'Checkbox (Yes/No)',
    date: 'Date (birthday, etc.)',
    social_profile: 'Social Profile',
    url: 'URL',
    company: 'Company / Organization',
    file: 'File upload (ID, receipt, document)',
}

/** Question types whose answers are a fixed set, so another question can branch off them. */
const BRANCHABLE: QuestionType[] = ['single_choice', 'multi_choice', 'checkbox']

function newKey() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `q_${Math.random().toString(36).slice(2)}`
}

interface Tier { id: string; name: string; price?: number | string }

interface Props {
    eventId?: string
    initialQuestions: RegistrationQuestion[]
    /** Ticket tiers, so a question can be scoped to some of them. Omitted for
     *  experiences, which have no tiers — the scoping UI hides itself. */
    tiers?: Tier[]
    /** 'stepper' asks one question per screen; 'single' shows the whole form at once. */
    initialFormLayout?: 'stepper' | 'single'
    saveFn?: (questions: RegistrationQuestion[]) => Promise<{ error?: string; success?: boolean; questions?: RegistrationQuestion[] }>
    heading?: string
    subheading?: string
    savedNoun?: string
    onChange?: (questions: RegistrationQuestion[]) => void
    hideSave?: boolean
    /** Helper media, tier scoping and conditional rules. Off for experiences,
     *  whose table has none of those columns — a control that silently
     *  discards what you typed is worse than no control. */
    advanced?: boolean
}

export function RegistrationQuestionsManager({
    eventId, initialQuestions, tiers, initialFormLayout,
    saveFn, heading, subheading, onChange, hideSave, advanced = true,
}: Props) {
    const { toast } = useToast()
    const [questions, setQuestions] = useState<RegistrationQuestion[]>(
        () => initialQuestions.map(q => ({ ...q, key: q.key || q.id || newKey() }))
    )
    const [isSaving, setIsSaving] = useState(false)
    const [openAdvanced, setOpenAdvanced] = useState<Record<string, boolean>>({})
    const [layout, setLayout] = useState<'stepper' | 'single'>(initialFormLayout ?? 'stepper')

    useEffect(() => {
        if (onChange) onChange(questions)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questions])

    const addQuestion = () => {
        setQuestions(prev => [
            ...prev,
            {
                key: newKey(),
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
        setQuestions(prev => {
            const gone = prev[index].key
            return prev
                .filter((_, i) => i !== index)
                // Anything branching off the deleted question becomes unconditional
                // rather than invisible forever.
                .map(q => q.depends_on_key === gone
                    ? { ...q, depends_on_key: null, depends_on_values: [] }
                    : q)
                .map((q, i) => ({ ...q, display_order: i }))
        })
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
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i]
            if (!q.label.trim()) {
                toast({ title: 'Missing question text', description: `Question ${i + 1} needs a label.`, variant: 'destructive' })
                return
            }
            if (['single_choice', 'multi_choice'].includes(q.question_type) && q.options.filter(o => o.trim()).length < 2) {
                toast({ title: 'Not enough options', description: `Question ${i + 1} needs at least 2 options.`, variant: 'destructive' })
                return
            }
            if (q.depends_on_key && !(q.depends_on_values || []).length) {
                toast({
                    title: 'Incomplete rule',
                    description: `Question ${i + 1} only shows conditionally, but no triggering answer is picked.`,
                    variant: 'destructive',
                })
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
            if (result.questions) {
                setQuestions(result.questions.map(q => ({ ...q, key: q.key || q.id || newKey() })))
            }
            toast({ title: 'Questions saved', description: `${questions.length} question${questions.length !== 1 ? 's' : ''} saved.` })
        }
    }

    async function changeLayout(next: 'stepper' | 'single') {
        const previous = layout
        setLayout(next)
        if (!eventId) return
        const res = await setRegistrationFormLayout(eventId, next)
        if (res?.error) {
            setLayout(previous)
            toast({ title: 'Could not change the layout', description: res.error, variant: 'destructive' })
        }
    }

    const needsOptions = (type: QuestionType) =>
        type === 'single_choice' || type === 'multi_choice'

    /** Answers a question can branch on. */
    const answerValues = (q: RegistrationQuestion | undefined): string[] => {
        if (!q) return []
        if (q.question_type === 'checkbox') return ['true', 'false']
        return (q.options || []).map(o => o.trim()).filter(Boolean)
    }

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

            {/* How the form is presented to attendees. */}
            {eventId && questions.length > 0 && (
                <Card className="p-4">
                    <Label className="text-sm font-medium">How attendees see this form</Label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => changeLayout('single')}
                            className={cn(
                                'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors',
                                layout === 'single' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                            )}
                        >
                            <Rows3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>
                                <span className="block text-sm font-medium">One page</span>
                                <span className="block text-xs text-muted-foreground">
                                    Every question on a single scrolling form. Fastest to fill in.
                                </span>
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => changeLayout('stepper')}
                            className={cn(
                                'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors',
                                layout === 'stepper' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                            )}
                        >
                            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>
                                <span className="block text-sm font-medium">One question at a time</span>
                                <span className="block text-xs text-muted-foreground">
                                    Guided steps. Better for long consent text.
                                </span>
                            </span>
                        </button>
                    </div>
                </Card>
            )}

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
                    {questions.map((q, index) => {
                        const qKey = q.key || String(index)
                        // Only EARLIER questions can control this one — a later
                        // question hasn't been answered yet when this one renders.
                        const candidates = questions
                            .slice(0, index)
                            .filter(c => BRANCHABLE.includes(c.question_type) && c.label.trim())
                        const controller = questions.find(c => c.key === q.depends_on_key)
                        const scoped = (q.tier_ids || []).length > 0
                        const advancedOn = openAdvanced[qKey]
                            || !!q.depends_on_key || scoped || !!q.help_text || !!q.help_image_url

                        return (
                        <Card key={qKey} className="p-5 space-y-4">
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
                                                question_type: v as QuestionType,
                                                options: needsOptions(v as QuestionType) ? (q.options.length ? q.options : ['', '']) : []
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

                                <div className="flex flex-col items-center gap-1 shrink-0">
                                    <span className="text-xs text-muted-foreground">Required</span>
                                    <Switch
                                        checked={q.is_required}
                                        onCheckedChange={(checked) => updateQuestion(index, { is_required: checked })}
                                    />
                                </div>

                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" onClick={() => moveQuestion(index, 'up')} disabled={index === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ChevronUp className="h-3 w-3" />
                                    </button>
                                    <button type="button" onClick={() => moveQuestion(index, 'down')} disabled={index === questions.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ChevronDown className="h-3 w-3" />
                                    </button>
                                </div>

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

                            {/* Summary chips so a rule is visible without opening anything */}
                            {(scoped || q.depends_on_key) && !advancedOn && (
                                <div className="ml-8 flex flex-wrap gap-2 text-xs">
                                    {scoped && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                                            <Ticket className="h-3 w-3" /> Only some tiers
                                        </span>
                                    )}
                                    {q.depends_on_key && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                                            <GitBranch className="h-3 w-3" /> Conditional
                                        </span>
                                    )}
                                </div>
                            )}

                            {advanced && (
                            <div className="ml-8">
                                <button
                                    type="button"
                                    onClick={() => setOpenAdvanced(p => ({ ...p, [qKey]: !advancedOn }))}
                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <Settings2 className="h-3.5 w-3.5" />
                                    {advancedOn ? 'Hide options' : 'Help image, tiers & rules'}
                                </button>
                            </div>
                            )}

                            {advanced && advancedOn && (
                                <div className="ml-8 space-y-5 rounded-lg border bg-muted/20 p-4">
                                    {/* Helper text + image */}
                                    <div className="space-y-2">
                                        <Label className="text-xs">Helper text <span className="text-muted-foreground">(optional)</span></Label>
                                        <Input
                                            value={q.help_text ?? ''}
                                            onChange={(e) => updateQuestion(index, { help_text: e.target.value })}
                                            placeholder="e.g. Measure across the chest, laid flat."
                                        />
                                    </div>

                                    <HelpImageField
                                        eventId={eventId}
                                        url={q.help_image_url ?? ''}
                                        onChange={(url) => updateQuestion(index, { help_image_url: url })}
                                    />

                                    {/* Tier scoping */}
                                    {!!tiers?.length && (
                                        <div className="space-y-2">
                                            <Label className="text-xs flex items-center gap-1.5">
                                                <Ticket className="h-3.5 w-3.5" /> Only ask this for certain tickets
                                            </Label>
                                            <p className="text-[11px] text-muted-foreground">
                                                Leave all unticked to ask everyone. Tier-only questions are asked at
                                                checkout, once the buyer has picked their ticket.
                                            </p>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {tiers.map(t => {
                                                    const on = (q.tier_ids || []).includes(t.id)
                                                    return (
                                                        <button
                                                            key={t.id}
                                                            type="button"
                                                            onClick={() => updateQuestion(index, {
                                                                tier_ids: on
                                                                    ? (q.tier_ids || []).filter(id => id !== t.id)
                                                                    : [...(q.tier_ids || []), t.id],
                                                            })}
                                                            className={cn(
                                                                'rounded-full border px-3 py-1 text-xs transition-colors',
                                                                on ? 'border-primary bg-primary text-primary-foreground'
                                                                   : 'border-border hover:border-primary/40'
                                                            )}
                                                        >
                                                            {t.name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Conditional display */}
                                    <div className="space-y-2">
                                        <Label className="text-xs flex items-center gap-1.5">
                                            <GitBranch className="h-3.5 w-3.5" /> Only show this if…
                                        </Label>
                                        {candidates.length === 0 ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                Add a choice or yes/no question above this one to branch off it.
                                            </p>
                                        ) : (
                                            <>
                                                <Select
                                                    value={q.depends_on_key ?? 'none'}
                                                    onValueChange={(v) => updateQuestion(index, {
                                                        depends_on_key: v === 'none' ? null : v,
                                                        depends_on_values: [],
                                                    })}
                                                >
                                                    <SelectTrigger className="max-w-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Always show</SelectItem>
                                                        {candidates.map(c => (
                                                            <SelectItem key={c.key} value={c.key!}>
                                                                {c.label.slice(0, 60)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>

                                                {q.depends_on_key && (
                                                    <div className="space-y-1.5 pt-1">
                                                        <p className="text-[11px] text-muted-foreground">…is answered with any of:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {answerValues(controller).map(val => {
                                                                const on = (q.depends_on_values || []).includes(val)
                                                                return (
                                                                    <button
                                                                        key={val}
                                                                        type="button"
                                                                        onClick={() => updateQuestion(index, {
                                                                            depends_on_values: on
                                                                                ? (q.depends_on_values || []).filter(v => v !== val)
                                                                                : [...(q.depends_on_values || []), val],
                                                                        })}
                                                                        className={cn(
                                                                            'rounded-full border px-3 py-1 text-xs transition-colors',
                                                                            on ? 'border-primary bg-primary text-primary-foreground'
                                                                               : 'border-border hover:border-primary/40'
                                                                        )}
                                                                    >
                                                                        {controller?.question_type === 'checkbox'
                                                                            ? (val === 'true' ? 'Yes' : 'No')
                                                                            : val}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Card>
                        )
                    })}

                    <Button variant="outline" onClick={addQuestion} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Question
                    </Button>
                </div>
            )}
        </div>
    )
}

// ─── Helper image ────────────────────────────────────────────────────────────
// A size chart is the motivating case: "Finisher shirt size" is unanswerable
// without the chart sitting next to it.
function HelpImageField({ eventId, url, onChange }: {
    eventId?: string
    url: string
    onChange: (url: string) => void
}) {
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)

    if (!eventId) return null

    async function pick(file: File) {
        setBusy(true)
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadQuestionHelpImage(eventId!, fd)
        setBusy(false)
        if (res.error || !res.url) {
            toast({ title: 'Upload failed', description: res.error, variant: 'destructive' })
            return
        }
        onChange(res.url)
    }

    return (
        <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" /> Helper image <span className="text-muted-foreground">(size chart, sample ID…)</span>
            </Label>

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }}
            />

            {url ? (
                <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Helper" className="max-h-24 rounded-md border object-contain" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                        <X className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                </div>
            ) : (
                <Button
                    type="button" variant="outline" size="sm"
                    disabled={busy} onClick={() => inputRef.current?.click()}
                >
                    {busy
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
                        : <><ImagePlus className="h-3.5 w-3.5 mr-1.5" />Add image</>}
                </Button>
            )}
        </div>
    )
}
