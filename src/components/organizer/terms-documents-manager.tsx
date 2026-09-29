'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, FileSignature } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getEventTermsDocuments, saveEventTermsDocuments } from '@/lib/organizer/terms-actions'
import {
    SUGGESTED_TERMS_TITLES, TERMS_BODY_MAX, TERMS_TITLE_MAX,
    type TermsDocument,
} from '@/lib/legal/terms-documents'

/**
 * Editor for the additional, separately-accepted Terms & Conditions documents
 * on an event.
 *
 * Each document gets its own checkbox at checkout. That is the whole point of
 * the feature: a participant waiver bundled under one generic "I accept the
 * terms" tick is a weaker record than one the buyer affirmed on its own.
 */

interface Props {
    /** Absent while creating — the parent form carries the documents instead. */
    eventId?: string
    initialDocuments?: TermsDocument[]
    onChange?: (docs: TermsDocument[]) => void
    /** Create flow saves through the event form, so no Save button here. */
    hideSave?: boolean
}

export function TermsDocumentsManager({ eventId, initialDocuments = [], onChange, hideSave }: Props) {
    const { toast } = useToast()
    const [documents, setDocuments] = useState<TermsDocument[]>(initialDocuments)
    const [saving, setSaving] = useState(false)
    const [openIndex, setOpenIndex] = useState<number | null>(initialDocuments.length ? 0 : null)
    const loadedRef = useRef(false)

    // Editing an existing event: pull the saved documents rather than making
    // every mount point thread them through. Runs once, and only when the
    // parent did not already supply them.
    useEffect(() => {
        if (!eventId || initialDocuments.length > 0 || loadedRef.current) return
        loadedRef.current = true
        getEventTermsDocuments(eventId).then(res => {
            if (res.data && res.data.length > 0) {
                setDocuments(res.data)
                onChange?.(res.data)
                setOpenIndex(null)
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId])

    const update = (next: TermsDocument[]) => {
        setDocuments(next)
        onChange?.(next)
    }

    const addDocument = (title = '') => {
        const next = [...documents, { title, body: '', is_required: true, display_order: documents.length }]
        update(next)
        setOpenIndex(next.length - 1)
    }

    const patch = (i: number, fields: Partial<TermsDocument>) => {
        update(documents.map((d, idx) => (idx === i ? { ...d, ...fields } : d)))
    }

    const remove = (i: number) => {
        update(documents.filter((_, idx) => idx !== i))
        setOpenIndex(null)
    }

    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir
        if (j < 0 || j >= documents.length) return
        const next = [...documents]
        ;[next[i], next[j]] = [next[j], next[i]]
        update(next)
        setOpenIndex(j)
    }

    const save = async () => {
        if (!eventId) return
        setSaving(true)
        const result = await saveEventTermsDocuments(eventId, documents)
        setSaving(false)
        if (result.error) {
            toast({ title: 'Could not save', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: 'Saved', description: 'Your terms documents are live on this event.' })
    }

    // Titles not already used, so the shortcuts stop offering duplicates.
    const unusedSuggestions = SUGGESTED_TERMS_TITLES.filter(
        s => !documents.some(d => d.title.trim().toLowerCase() === s.toLowerCase()),
    )

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <FileSignature className="h-5 w-5" />
                        Additional documents
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        Each document gets its own checkbox at checkout, so a waiver or a privacy
                        consent is agreed to on its own rather than bundled into the terms above.
                        Use these for a participant waiver, a fitness declaration, or a data privacy
                        consent.
                    </p>
                </div>
                {!hideSave && eventId && (
                    <Button type="button" onClick={save} disabled={saving} className="shrink-0">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save documents
                    </Button>
                )}
            </div>

            {documents.length === 0 && (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4">
                    No additional documents. Buyers will only see your general terms above.
                </p>
            )}

            <div className="space-y-3">
                {documents.map((doc, i) => {
                    const open = openIndex === i
                    return (
                        <div key={doc.id ?? `new-${i}`} className="rounded-lg border bg-background">
                            <div className="flex items-center gap-2 p-3">
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(open ? null : i)}
                                    className="flex-1 text-left"
                                >
                                    <span className="font-medium">
                                        {doc.title.trim() || <span className="text-muted-foreground">Untitled document</span>}
                                    </span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        {doc.is_required ? 'Required' : 'Optional'} · {doc.body.length.toLocaleString()} characters
                                    </span>
                                </button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                                    <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === documents.length - 1}>
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>

                            {open && (
                                <div className="border-t p-4 space-y-4">
                                    <div>
                                        <Label htmlFor={`terms-title-${i}`}>Document title</Label>
                                        <Input
                                            id={`terms-title-${i}`}
                                            value={doc.title}
                                            onChange={e => patch(i, { title: e.target.value })}
                                            placeholder="e.g. Declaration of Fitness & Participant Waiver"
                                            maxLength={TERMS_TITLE_MAX}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Buyers see this next to the checkbox: “I accept {doc.title.trim() || '…'}”.
                                        </p>
                                    </div>

                                    <div>
                                        <Label htmlFor={`terms-body-${i}`}>Full text</Label>
                                        <Textarea
                                            id={`terms-body-${i}`}
                                            value={doc.body}
                                            onChange={e => patch(i, { body: e.target.value })}
                                            rows={12}
                                            maxLength={TERMS_BODY_MAX}
                                            placeholder="Paste the complete document. Line breaks are preserved."
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {doc.body.length.toLocaleString()} / {TERMS_BODY_MAX.toLocaleString()} characters
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                            <p className="text-sm font-medium">Require acceptance</p>
                                            <p className="text-xs text-muted-foreground">
                                                On, buyers cannot pay without ticking this. Off, it is shown for
                                                reference only.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={doc.is_required}
                                            onCheckedChange={v => patch(i, { is_required: v })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addDocument()}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add document
                </Button>
                {unusedSuggestions.map(title => (
                    <Button
                        key={title}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => addDocument(title)}
                    >
                        <Plus className="mr-1 h-3.5 w-3.5" /> {title}
                    </Button>
                ))}
            </div>
        </div>
    )
}
