'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import {
    Loader2, Save, Sparkles, Eye, ChevronDown, ChevronRight, Check,
} from 'lucide-react'
import { RichTextEditor } from './rich-text-editor'
import type { Automation, AutomationTrigger, AutomationStats } from '@/lib/marketing/automation-actions'
import type { TriggerMeta } from './automation-meta'
import { PREVIEW_TOKENS, formatPeso } from './automation-meta'

/**
 * One automation.
 *
 * The old card was a config form and nothing else — it looked identical whether
 * the automation had never run or had been quietly recovering carts for a week.
 * The three things it now answers, in order: is it on, is it working, and what
 * does the email actually look like when it arrives.
 */

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return (
        <div className="min-w-0">
            <div className={`text-sm font-semibold tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>{value}</div>
            <div className="text-[11px] text-muted-foreground truncate">{label}</div>
        </div>
    )
}

export function AutomationCard({
    type, meta, value, stats, businessName, saving, onPatch, onSave, onToggle,
}: {
    type: AutomationTrigger
    meta: TriggerMeta
    value: Automation
    stats?: AutomationStats
    businessName: string
    saving: boolean
    onPatch: (p: Partial<Automation>) => void
    onSave: () => void
    onToggle: (enabled: boolean) => void
}) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [aiOpen, setAiOpen] = useState(false)
    const [aiBrief, setAiBrief] = useState('')
    const [aiTone, setAiTone] = useState('friendly')
    const [aiBusy, setAiBusy] = useState(false)
    const [aiResult, setAiResult] = useState<{ subjects?: string[]; html?: string } | null>(null)
    const [aiSubject, setAiSubject] = useState('')
    // RichTextEditor seeds itself from `value` at mount; bump this to remount it
    // after AI writes, so it does not keep showing the previous draft.
    const [editorKey, setEditorKey] = useState(0)

    const Icon = meta.icon
    const perUnit = meta.offset?.unit === 'days' ? 1440 : 60
    const offsetValue = value.offset_minutes != null
        ? Math.round((value.offset_minutes / perUnit) * 10) / 10
        : ''

    const hasRun = (stats?.sent ?? 0) > 0
    const openRate = stats && stats.delivered > 0
        ? Math.round((stats.opened / stats.delivered) * 100)
        : null

    /** Fill {{tokens}} with example values so the preview reads like a real email. */
    function renderPreview(html: string) {
        let out = html || '<p class="text-muted-foreground">Nothing written yet.</p>'
        const tokens = { ...PREVIEW_TOKENS, '{{business_name}}': businessName || 'Your business' }
        for (const [k, v] of Object.entries(tokens)) {
            out = out.split(k).join(v)
        }
        return out
    }

    async function generate() {
        setAiBusy(true)
        setAiResult(null)
        try {
            const supabase = createClient()
            // The brief the model gets is the automation's own job plus whatever
            // the organizer adds — so "write this for me" works with an empty box.
            const brief = [meta.aiBrief, aiBrief.trim()].filter(Boolean).join(' ')
            const { data, error } = await supabase.functions.invoke('ai-marketing-copy', {
                body: { brief, tone: aiTone, business_name: businessName || undefined },
            })
            if (error) throw new Error(error.message || 'Failed to generate')
            if (data?.error) throw new Error(data.error)
            setAiResult(data)
            setAiSubject(data.subjects?.[0] || '')
        } catch (e: any) {
            toast({ title: 'Could not write it', description: e.message, variant: 'destructive' })
        } finally {
            setAiBusy(false)
        }
    }

    function applyAi() {
        if (!aiResult) return
        onPatch({
            subject: aiSubject || value.subject,
            html_content: aiResult.html || value.html_content,
        })
        // Remount the editor so it re-reads the new content and picks its tab
        // from it. The AI writes inline-styled, sometimes table-based email
        // HTML; dropping that into a live Visual editor is what stripped the
        // styling before this key existed.
        setEditorKey(k => k + 1)
        setAiOpen(false)
        setOpen(true)
        toast({ title: 'Draft added', description: 'Read it over, then Save to make it live.' })
    }

    return (
        <Card className={value.enabled ? 'border-primary/30' : ''}>
            {/* ── Summary row: state first, then evidence it works ───────────── */}
            <div className="flex items-start gap-3 p-4">
                <div className={`rounded-lg p-2 shrink-0 ${value.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{meta.title}</span>
                        {value.enabled
                            ? <Badge variant="secondary" className="text-[10px] h-5">On</Badge>
                            : <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Off</Badge>}
                        {value.enabled && !hasRun && (
                            <span className="text-[11px] text-muted-foreground">waiting for its first trigger</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>

                    {hasRun && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-3">
                            <Stat label="sent" value={String(stats!.sent)} />
                            <Stat label="opened" value={openRate != null ? `${openRate}%` : '—'} />
                            <Stat label={stats!.orders === 1 ? 'order' : 'orders'} value={String(stats!.orders)} />
                            <Stat
                                label="revenue"
                                value={formatPeso(stats!.revenue)}
                                muted={!stats!.revenue}
                            />
                        </div>
                    )}
                </div>

                <Switch
                    checked={value.enabled}
                    onCheckedChange={onToggle}
                    aria-label={`Turn ${meta.title} ${value.enabled ? 'off' : 'on'}`}
                />
            </div>

            {/* ── Actions ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 border-t px-3 py-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(v => !v)}>
                    {open ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
                    Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setAiBrief(''); setAiResult(null); setAiOpen(true) }}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Write with AI
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreviewOpen(true)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Preview
                </Button>
                {stats?.last_fired && (
                    <span className="ml-auto text-[11px] text-muted-foreground pr-1">
                        last sent {new Date(stats.last_fired).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </span>
                )}
            </div>

            {/* ── Editor ─────────────────────────────────────────────────────── */}
            {open && (
                <div className="space-y-3 border-t p-4">
                    {meta.offset && (
                        <div className="flex items-end gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">{meta.offset.label}</Label>
                                <Input
                                    type="number" min={0} step={meta.offset.unit === 'days' ? 1 : 0.5} className="w-32"
                                    value={offsetValue}
                                    onChange={(e) => onPatch({
                                        offset_minutes: e.target.value === ''
                                            ? null
                                            : Math.round(parseFloat(e.target.value) * perUnit),
                                    })}
                                />
                            </div>
                            <span className="text-xs text-muted-foreground pb-2.5">{meta.offset.hint}</span>
                        </div>
                    )}

                    <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input
                            value={value.subject || ''}
                            onChange={(e) => onPatch({ subject: e.target.value })}
                            placeholder={meta.subjectPlaceholder}
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Message</Label>
                        <RichTextEditor
                            key={editorKey}
                            value={value.html_content || ''}
                            onChange={(v) => onPatch({ html_content: v })}
                            disabled={saving}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Tokens:</span>
                        {meta.tokens.map(t => (
                            <code key={t} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{t}</code>
                        ))}
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={onSave} disabled={saving} size="sm">
                            {saving
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <Save className="h-4 w-4 mr-2" />}
                            Save
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Preview ────────────────────────────────────────────────────── */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{meta.title}</DialogTitle>
                        <DialogDescription>
                            Example values are filled in, so this is close to what a recipient sees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border">
                        <div className="border-b bg-muted/40 px-4 py-2.5">
                            <p className="text-xs text-muted-foreground">Subject</p>
                            <p className="text-sm font-medium">
                                {renderPreview(value.subject || '') || <span className="text-muted-foreground">No subject yet</span>}
                            </p>
                        </div>
                        <div
                            className="p-4 text-sm [&_a]:text-primary [&_img]:max-w-full"
                            dangerouslySetInnerHTML={{ __html: renderPreview(value.html_content || '') }}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── AI ─────────────────────────────────────────────────────────── */}
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Write the {meta.title.toLowerCase()}
                        </DialogTitle>
                        <DialogDescription>
                            It already knows what this automation is for. Add anything specific, or just hit Write.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Anything to include? (optional)</Label>
                            <Textarea
                                rows={3}
                                value={aiBrief}
                                onChange={(e) => setAiBrief(e.target.value)}
                                placeholder={meta.aiPlaceholder}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Tone</Label>
                            <Select value={aiTone} onValueChange={setAiTone}>
                                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="friendly">Friendly</SelectItem>
                                    <SelectItem value="playful">Playful</SelectItem>
                                    <SelectItem value="professional">Professional</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {aiResult && (
                            <div className="space-y-2 rounded-lg border p-3">
                                <Label className="text-xs">Subject</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {(aiResult.subjects || []).map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setAiSubject(s)}
                                            className={`text-xs rounded-full border px-2.5 py-1 text-left transition-colors ${
                                                aiSubject === s ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                                            }`}
                                        >
                                            {aiSubject === s && <Check className="inline h-3 w-3 mr-1" />}
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    className="mt-2 max-h-64 overflow-y-auto rounded border bg-background p-3 text-sm [&_img]:max-w-full"
                                    dangerouslySetInnerHTML={{ __html: renderPreview(aiResult.html || '') }}
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={generate} disabled={aiBusy}>
                            {aiBusy
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Writing…</>
                                : <><Sparkles className="h-4 w-4 mr-2" />{aiResult ? 'Try again' : 'Write'}</>}
                        </Button>
                        <Button onClick={applyAi} disabled={!aiResult || aiBusy}>Use this</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
