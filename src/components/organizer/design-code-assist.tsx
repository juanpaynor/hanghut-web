'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
    Sparkles, Loader2, ChevronDown, Plus, X, WandSparkles, Check, RotateCcw,
} from 'lucide-react'
import {
    CSS_SNIPPETS, CSS_PRESETS, HTML_BLOCKS, STARTER_CSS, HTML_STARTER,
    STYLE_TARGETS, STYLE_VARIABLES, HTML_RULES,
    type CodeSnippet,
} from '@/lib/design-code-library'

/**
 * The shared scaffolding around the two free-text code boxes (Custom CSS and
 * the About-section HTML).
 *
 * Both used to be a naked <textarea>. An organizer opening one had no way to
 * discover that [data-hh-card] or var(--hh-accent) exist, so the realistic
 * options were "paste something from the internet that silently does nothing"
 * or "close the tab". This gives them three ladders of increasing effort:
 *
 *   1. Describe it in a sentence and let the AI write it.
 *   2. Click a snippet that does one specific thing.
 *   3. Read the list of what's targetable and write it themselves.
 *
 * Deliberately NOT a visual builder — the people who open an "Advanced" panel
 * marked Custom CSS want the code. They just want to know what to aim it at.
 */

type Mode = 'css' | 'html'

const COPY: Record<Mode, {
    aiPlaceholder: string
    aiExamples: string[]
    snippetsLabel: string
    starterLabel: string
    starter: string
    snippets: CodeSnippet[]
    /** Whole-page skins. These REPLACE the box; snippets above only add to it. */
    presets: CodeSnippet[]
}> = {
    css: {
        aiPlaceholder: 'e.g. dark and moody with gold headings, rounded everything',
        aiExamples: [
            'Dark and moody with gold headings',
            'Clean and minimal, lots of white space',
            'Bold street-poster look, huge uppercase title',
        ],
        snippetsLabel: 'Or click a one-liner',
        starterLabel: 'Load a commented starter',
        starter: STARTER_CSS,
        snippets: CSS_SNIPPETS,
        presets: CSS_PRESETS,
    },
    html: {
        aiPlaceholder: 'e.g. a run of show, house rules, and a short FAQ about parking',
        aiExamples: [
            'What to expect, plus house rules',
            'A short FAQ: parking, age limit, refunds',
            'Run of show from doors to last call',
        ],
        snippetsLabel: 'Or drop in a ready-made block',
        starterLabel: 'Load a starter',
        starter: HTML_STARTER,
        snippets: HTML_BLOCKS,
        presets: [],
    },
}

export function DesignCodeAssist({
    mode,
    value,
    onChange,
    eventId,
    placeholder,
    minHeight = 'min-h-[260px]',
}: {
    mode: Mode
    value: string
    onChange: (next: string) => void
    eventId?: string
    placeholder?: string
    minHeight?: string
}) {
    const copy = COPY[mode]
    const { toast } = useToast()
    const supabase = createClient()
    const taRef = useRef<HTMLTextAreaElement>(null)

    const [brief, setBrief] = useState('')
    const [generating, setGenerating] = useState(false)
    const [result, setResult] = useState<{ code: string; notes: string } | null>(null)
    // Kept so "Undo" after applying AI output is one click, not a re-type.
    const [undoTo, setUndoTo] = useState<string | null>(null)
    const [refOpen, setRefOpen] = useState(false)

    /** Append rather than replace: someone who already wrote something should
     *  never lose it by clicking a snippet to see what it does. */
    const append = (code: string) => {
        const next = value.trim() ? `${value.replace(/\s+$/, '')}\n\n${code}\n` : `${code}\n`
        onChange(next)
        requestAnimationFrame(() => {
            const ta = taRef.current
            if (!ta) return
            ta.focus()
            ta.selectionStart = ta.selectionEnd = ta.value.length
            ta.scrollTop = ta.scrollHeight
        })
    }

    const generate = async () => {
        if (!brief.trim()) {
            toast({ title: 'Describe what you want first', description: copy.aiPlaceholder, variant: 'destructive' })
            return
        }
        setGenerating(true)
        setResult(null)
        try {
            const { data, error } = await supabase.functions.invoke('ai-page-design', {
                // `current` lets a follow-up like "now make it darker" edit what
                // is there instead of starting from nothing.
                body: { mode, brief: brief.trim(), event_id: eventId, current: value || undefined },
            })
            if (error) throw new Error(error.message || 'Could not reach the AI assistant.')
            if (data?.error) throw new Error(data.error)
            if (!data?.code) throw new Error('The AI returned nothing usable.')
            setResult({ code: data.code as string, notes: (data.notes as string) || '' })
        } catch (err) {
            toast({
                title: 'Could not generate',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'destructive',
            })
        } finally {
            setGenerating(false)
        }
    }

    const applyResult = (how: 'replace' | 'append') => {
        if (!result) return
        setUndoTo(value)
        if (how === 'replace') onChange(result.code.trim() + '\n')
        else append(result.code.trim())
        setResult(null)
        setBrief('')
    }

    return (
        <div className="space-y-4">
            {/* ── 1. Say it in a sentence ─────────────────────────────────── */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <WandSparkles className="h-4 w-4 text-primary" />
                    Describe it and we&apos;ll write it
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generate() } }}
                        placeholder={copy.aiPlaceholder}
                        disabled={generating}
                        className="bg-background"
                    />
                    <Button type="button" onClick={generate} disabled={generating} className="shrink-0">
                        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {generating ? 'Writing…' : 'Generate'}
                    </Button>
                </div>
                {!result && !generating && (
                    <div className="flex flex-wrap gap-1.5">
                        {copy.aiExamples.map(ex => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setBrief(ex)}
                                className="text-xs rounded-full border bg-background px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                                {ex}
                            </button>
                        ))}
                    </div>
                )}

                {/* Never auto-apply: the organizer sees it before it lands in the box. */}
                {result && (
                    <div className="rounded-md border bg-background p-3 space-y-2">
                        {result.notes && <p className="text-sm">{result.notes}</p>}
                        <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
                            {result.code}
                        </pre>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => applyResult('replace')}>
                                <Check className="mr-2 h-4 w-4" />
                                {value.trim() ? 'Replace what I have' : 'Use this'}
                            </Button>
                            {value.trim() && (
                                <Button type="button" size="sm" variant="outline" onClick={() => applyResult('append')}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add to the end
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)}>
                                Discard
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 2. Starters and snippets ────────────────────────────────── */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => append(copy.starter)}>
                        <Plus className="mr-2 h-4 w-4" />
                        {copy.starterLabel}
                    </Button>
                    {copy.presets.map(p => (
                        <Button
                            key={p.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            title={p.blurb}
                            onClick={() => { setUndoTo(value); onChange(p.code) }}
                        >
                            <Sparkles className="mr-2 h-4 w-4" />
                            {p.label}
                        </Button>
                    ))}
                    {undoTo !== null && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { onChange(undoTo); setUndoTo(null) }}
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Undo
                        </Button>
                    )}
                    {value.trim() && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setUndoTo(value); onChange('') }}>
                            <X className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                    )}
                </div>

                <p className="text-xs text-muted-foreground">{copy.snippetsLabel}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                    {copy.snippets.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => append(s.code)}
                            title={s.blurb}
                            className="text-left rounded-md border bg-background px-3 py-2 hover:border-foreground/30 hover:bg-muted/60 transition-colors"
                        >
                            <span className="block text-sm font-medium">{s.label}</span>
                            <span className="block text-xs text-muted-foreground">{s.blurb}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── 3. The editor itself ────────────────────────────────────── */}
            <Textarea
                ref={taRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                spellCheck={false}
                className={cn('font-mono text-xs leading-relaxed', minHeight)}
            />

            {/* ── 4. What you can actually aim at ─────────────────────────── */}
            <Collapsible open={refOpen} onOpenChange={setRefOpen}>
                <CollapsibleTrigger asChild>
                    <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', refOpen && 'rotate-180')} />
                        {mode === 'css' ? 'What you can target on this page' : 'What you can put in here'}
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                    {mode === 'css' ? (
                        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground">
                                Click one to drop it into the editor. Anything you write only ever affects this
                                event page.
                            </p>
                            <ul className="space-y-1">
                                {STYLE_TARGETS.map(t => (
                                    <li key={t.selector}>
                                        <button
                                            type="button"
                                            onClick={() => append(`${t.selector} {\n  /* ${t.label} */\n}`)}
                                            className="w-full text-left rounded px-2 py-1.5 hover:bg-background transition-colors"
                                        >
                                            <code className="text-[11px] font-mono text-primary">{t.selector}</code>
                                            <span className="block text-xs"><b>{t.label}</b> — {t.hint}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <div className="border-t pt-2">
                                <p className="text-xs font-medium mb-1">Values that follow your settings above</p>
                                <ul className="space-y-0.5">
                                    {STYLE_VARIABLES.map(v => (
                                        <li key={v.selector} className="text-xs">
                                            <code className="text-[11px] font-mono text-primary">{v.selector}</code>
                                            {' — '}{v.hint}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                            {HTML_RULES.map(r => <li key={r}>• {r}</li>)}
                        </ul>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
