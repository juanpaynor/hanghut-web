'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Library, PenTool, Save, ArrowLeft, Eye, Upload, History, Trash2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { getUsableVenueTemplates, getVenueTemplateCanvas, saveVenueTemplate, updateSeatingSettings } from '@/lib/seat-map/seat-map-actions'
import {
    getSeatMapWorkspace, saveSeatMapDraft, discardSeatMapDraft, previewSeatMapPublish, publishSeatMap,
    restoreSeatMapVersion, getSeatMapPreviewBundle,
    type SeatMapWorkspace, type PublishPreview, type PreviewBundle,
} from '@/lib/seat-map/draft-actions'
import { createTicketTier } from '@/lib/organizer/tier-actions'
import type { CanvasData, TierInfo } from '@/components/seat-map/types'
import { TIER_PALETTE } from '@/components/seat-map/types'
import { regenerateCanvasIds } from '@/components/seat-map/canvas-state'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

const CanvasBuilder = dynamic(
    () => import('@/components/seat-map/canvas-builder').then((mod) => mod.CanvasBuilder),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-slate-950 rounded-xl min-h-[600px]">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Loading canvas...</p>
                </div>
            </div>
        ),
    }
)

// The organizer's preview IS the buyer picker, fed a bundle built from the draft.
const SeatMapPicker = dynamic(
    () => import('@/components/events/seat-map-picker').then((m) => m.SeatMapPicker),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-[420px]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> }
)

function relative(iso: string | null | undefined): string {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.round(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m} min ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`
    const d = Math.round(h / 24)
    if (d < 14) return `${d} day${d > 1 ? 's' : ''} ago`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface SeatMapTabProps {
    eventId: string
    event: any
}

type TabView = 'choose' | 'templates' | 'builder'

export function SeatMapTab({ eventId, event }: SeatMapTabProps) {
    const { toast } = useToast()
    const [view, setView] = useState<TabView>('choose')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [workspace, setWorkspace] = useState<SeatMapWorkspace | null>(null)
    const [canvasData, setCanvasData] = useState<CanvasData | null>(null)
    const [templates, setTemplates] = useState<any[]>([])
    const [tiers, setTiers] = useState<TierInfo[]>([])

    // The draft version this editor loaded — the optimistic-lock token for
    // every save. null = no draft existed when we loaded (first save inserts).
    const draftVersionRef = useRef<number | null>(null)
    const [draftMeta, setDraftMeta] = useState<{ version: number; updatedAt: string; updatedBy: string | null } | null>(null)
    const [builderDirty, setBuilderDirty] = useState(false)
    // Resolves when the in-flight save settles — Publish awaits it.
    const pendingSaveRef = useRef<Promise<boolean> | null>(null)
    const [conflict, setConflict] = useState<{ version: number; updatedAt: string; updatedBy: string | null; data: CanvasData } | null>(null)

    // Remount the builder when the canvas is swapped from outside (reload after
    // a conflict, restore, discard) — it only reads initialData once.
    const [builderKey, setBuilderKey] = useState(0)

    const hasMap = !!(workspace?.live || workspace?.draft)

    const loadWorkspace = useCallback(async (opts?: { keepView?: boolean }) => {
        const ws = await getSeatMapWorkspace(eventId)
        if ('error' in ws) {
            toast({ title: 'Could not load seat map', description: ws.error, variant: 'destructive' })
            return null
        }
        setWorkspace(ws)
        const canvas = ws.draft?.canvas ?? ws.live?.canvas ?? null
        setCanvasData(canvas)
        draftVersionRef.current = ws.draft?.version ?? null
        setDraftMeta(ws.draft ? { version: ws.draft.version, updatedAt: ws.draft.updatedAt, updatedBy: ws.draft.updatedBy } : null)
        setBuilderKey((k) => k + 1)
        if (!opts?.keepView) setView(canvas ? 'builder' : 'choose')
        return ws
    }, [eventId, toast])

    // Load workspace (live + draft + history) and the event's ticket tiers.
    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const supabase = createClient()
                const [, tiersRes] = await Promise.all([
                    loadWorkspace(),
                    supabase
                        .from('ticket_tiers')
                        .select('id, name, price, sort_order, quantity_total')
                        .eq('event_id', eventId)
                        .eq('is_active', true)
                        .order('sort_order', { ascending: true }),
                ])
                setTiers(
                    (tiersRes.data ?? []).map((t, i) => ({
                        id: t.id,
                        name: t.name,
                        price: Number(t.price),
                        color: TIER_PALETTE[i % TIER_PALETTE.length],
                        quantityTotal: t.quantity_total ?? undefined,
                    }))
                )
            } catch (err) {
                console.error('Failed to load seat map:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [eventId, loadWorkspace])

    // Create a price category (ticket tier) without leaving the editor. Inventory
    // starts at 0 — the seat-map save syncs it from the seats assigned to it.
    const handleCreateTier = useCallback(async (name: string, price: number): Promise<TierInfo | null> => {
        try {
            const res = await createTicketTier(eventId, {
                name: name.trim().slice(0, 100),
                description: '',
                price: Math.max(0, price || 0),
                quantity_total: 0,
                is_active: true,
                sort_order: tiers.length,
            })
            if ('error' in res && res.error) {
                toast({ title: 'Could not create category', description: res.error, variant: 'destructive' })
                return null
            }
            const tier = (res as any).tier
            const info: TierInfo = {
                id: tier.id,
                name: tier.name,
                price: Number(tier.price),
                color: TIER_PALETTE[tiers.length % TIER_PALETTE.length],
                quantityTotal: 0,
            }
            setTiers((prev) => [...prev, info])
            toast({ title: 'Price category created', description: `${info.name} — ₱${info.price.toLocaleString()}. Assign seats to it to set how many sell.` })
            return info
        } catch (err: any) {
            toast({ title: 'Could not create category', description: err?.message || 'Please try again.', variant: 'destructive' })
            return null
        }
    }, [eventId, tiers.length, toast])

    // Upload floor-plan images to Storage so canvas_data stays small
    const handleUploadImageFile = useCallback(async (file: File): Promise<string | null> => {
        try {
            const supabase = createClient()
            const ext = file.name.split('.').pop() || 'png'
            const path = `seat-maps/${eventId}/${Date.now()}.${ext}`
            const { data, error } = await supabase.storage
                .from('event-images')
                .upload(path, file, { upsert: false })
            if (error || !data) {
                console.error('Floor plan upload failed:', error)
                return null
            }
            const { data: { publicUrl } } = supabase.storage
                .from('event-images')
                .getPublicUrl(data.path)
            return publicUrl
        } catch (err) {
            console.error('Floor plan upload failed:', err)
            return null
        }
    }, [eventId])

    // Load available templates (admin-published + the organizer's own saved layouts)
    const loadTemplates = useCallback(async () => {
        try {
            const data = await getUsableVenueTemplates()
            setTemplates(data || [])
        } catch (err) {
            console.error('Failed to load templates:', err)
        }
    }, [])

    // Save the current (last-saved) layout as a reusable private template.
    // Strips sale state — statuses, price categories, per-seat prices — so the
    // template is pure geometry + labels, safe to apply to any future event.
    const [savingTemplate, setSavingTemplate] = useState(false)
    const handleSaveAsTemplate = async () => {
        if (!canvasData) return
        const name = window.prompt('Template name (e.g. "Skydome — standard setup"):')
        if (!name?.trim()) return
        setSavingTemplate(true)
        try {
            const stripped: CanvasData = {
                ...canvasData,
                sections: canvasData.sections.map(s => ({
                    ...s,
                    tierId: null,
                    rowTierOverrides: {},
                    seats: s.seats.map(seat => ({
                        ...seat,
                        status: 'available' as const,
                        tierId: null,
                        customPrice: null,
                    })),
                })),
            }
            await saveVenueTemplate(null, {
                name: name.trim(),
                venue_name: event?.venue_name || name.trim(),
                canvas_data: stripped,
                is_published: false,
            })
            toast({ title: 'Template saved', description: 'You can reuse this layout when setting up future events.' })
        } catch (err: any) {
            console.error('Failed to save template:', err)
            toast({ title: 'Error', description: err?.message || 'Failed to save template.', variant: 'destructive' })
        } finally {
            setSavingTemplate(false)
        }
    }

    const handleChooseTemplate = async () => {
        await loadTemplates()
        setView('templates')
    }

    // Canvas_data isn't in the list payload (kept light) — fetch it on pick.
    const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null)
    const handleSelectTemplate = async (template: any) => {
        setApplyingTemplate(template.id)
        try {
            const canvas = await getVenueTemplateCanvas(template.id)
            if (!canvas) {
                toast({ title: 'Empty template', description: 'This template has no layout.', variant: 'destructive' })
                return
            }
            // Fresh ids for THIS event — a template carries its source event's
            // section/seat ids, and reusing them collides with that event's rows
            // on save (RLS "USING expression" error / cross-event overwrite).
            setCanvasData(regenerateCanvasIds(canvas as CanvasData))
            setView('builder')
        } catch (err: any) {
            console.error('Failed to load template:', err)
            toast({ title: 'Could not load template', description: err?.message || 'Please try again.', variant: 'destructive' })
        } finally {
            setApplyingTemplate(null)
        }
    }

    // Save = write the DRAFT. Never touches what buyers see.
    const handleSave = useCallback(async (data: CanvasData, opts?: { auto?: boolean }): Promise<boolean> => {
        const run = (async () => {
            setSaving(true)
            try {
                const res = await saveSeatMapDraft(eventId, data, draftVersionRef.current)
                if ('conflict' in res) {
                    setConflict({ version: res.version, updatedAt: res.updatedAt, updatedBy: res.updatedBy, data })
                    return false
                }
                if ('error' in res) {
                    toast({ title: 'Draft not saved', description: res.error, variant: 'destructive' })
                    return false
                }
                draftVersionRef.current = res.version
                setDraftMeta({ version: res.version, updatedAt: res.updatedAt, updatedBy: null })
                setCanvasData(data)
                setWorkspace((ws) => ws ? { ...ws, draft: { canvas: data, version: res.version, basePublishedVersion: ws.live?.publishedVersion ?? 0, updatedAt: res.updatedAt, updatedBy: null } } : ws)
                if (!opts?.auto) {
                    toast({
                        title: 'Draft saved',
                        description: `${data.sections.reduce((sum, s) => sum + s.seats.length, 0)} seats · buyers still see the published map until you publish.`,
                    })
                }
                return true
            } catch (err: any) {
                console.error('Failed to save draft:', err)
                toast({ title: 'Draft not saved', description: err?.message || 'Please try again.', variant: 'destructive' })
                return false
            } finally {
                setSaving(false)
            }
        })()
        pendingSaveRef.current = run
        return run
    }, [eventId, toast])

    // Conflict resolution: someone else saved a newer draft while we edited.
    const resolveConflict = async (choice: 'theirs' | 'mine') => {
        const c = conflict
        setConflict(null)
        if (!c) return
        if (choice === 'theirs') {
            await loadWorkspace({ keepView: true })
            toast({ title: 'Loaded the newer draft', description: `Saved ${relative(c.updatedAt)}${c.updatedBy ? ` by ${c.updatedBy}` : ''}. Your unsaved edits were discarded.` })
            return
        }
        draftVersionRef.current = c.version
        await handleSave(c.data)
    }

    // ── Publish ───────────────────────────────────────────────────────────
    const [publishState, setPublishState] = useState<{ open: boolean; loading: boolean; preview: PublishPreview | null; error: string | null; busy: boolean }>({ open: false, loading: false, preview: null, error: null, busy: false })

    const openPublish = async () => {
        setPublishState({ open: true, loading: true, preview: null, error: null, busy: false })
        // Unsaved edits become part of the publish — save first.
        if (builderDirty) {
            document.dispatchEvent(new CustomEvent('canvas:requestSave'))
            await new Promise((r) => setTimeout(r, 0))
            const ok = await (pendingSaveRef.current ?? Promise.resolve(true))
            if (!ok) { setPublishState((p) => ({ ...p, open: false })); return }
        }
        const res = await previewSeatMapPublish(eventId)
        if ('error' in res) setPublishState({ open: true, loading: false, preview: null, error: res.error, busy: false })
        else setPublishState({ open: true, loading: false, preview: res, error: null, busy: false })
    }

    const confirmPublish = async () => {
        const pv = publishState.preview
        if (!pv) return
        setPublishState((p) => ({ ...p, busy: true }))
        const res = await publishSeatMap(eventId, pv.draftVersion)
        if ('error' in res) {
            setPublishState((p) => ({ ...p, busy: false, error: [res.error, ...(res.blockers ?? [])].join(' ') }))
            return
        }
        setPublishState({ open: false, loading: false, preview: null, error: null, busy: false })
        toast({ title: `Published v${res.version}`, description: 'Buyers now see this map.' })
        await loadWorkspace({ keepView: true })
    }

    // ── Discard / History / Preview ──────────────────────────────────────
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const discardDraft = async () => {
        setConfirmDiscard(false)
        const res = await discardSeatMapDraft(eventId)
        if ('error' in res) { toast({ title: 'Could not discard', description: res.error, variant: 'destructive' }); return }
        toast({ title: 'Draft discarded', description: 'The editor now shows the published map.' })
        await loadWorkspace()
    }

    const [historyOpen, setHistoryOpen] = useState(false)
    const [restoring, setRestoring] = useState<number | null>(null)
    const restoreVersion = async (version: number) => {
        setRestoring(version)
        const res = await restoreSeatMapVersion(eventId, version)
        setRestoring(null)
        if ('error' in res) { toast({ title: 'Could not restore', description: res.error, variant: 'destructive' }); return }
        setHistoryOpen(false)
        toast({ title: `v${version} restored to draft`, description: 'Review it, then publish to make it live.' })
        await loadWorkspace({ keepView: true })
    }

    const [previewState, setPreviewState] = useState<{ open: boolean; bundle: PreviewBundle | null; loading: boolean }>({ open: false, bundle: null, loading: false })
    const openPreview = async () => {
        setPreviewState({ open: true, bundle: null, loading: true })
        if (builderDirty) {
            document.dispatchEvent(new CustomEvent('canvas:requestSave'))
            await new Promise((r) => setTimeout(r, 0))
            await (pendingSaveRef.current ?? Promise.resolve(true))
        }
        const res = await getSeatMapPreviewBundle(eventId)
        if ('error' in res) {
            toast({ title: 'Nothing to preview', description: res.error, variant: 'destructive' })
            setPreviewState({ open: false, bundle: null, loading: false })
            return
        }
        setPreviewState({ open: true, bundle: res, loading: false })
    }

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )
        }

        // ── Choose mode: template or custom ──────────────────────────────────
        if (view === 'choose') {
            return (
                <div className="max-w-2xl mx-auto py-12">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold">Configure Seat Map</h2>
                        <p className="text-muted-foreground mt-1">
                            Choose how you&apos;d like to set up your venue layout
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <Card
                            className="p-8 text-center cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
                            onClick={handleChooseTemplate}
                        >
                            <Library className="w-12 h-12 mx-auto mb-4 text-indigo-500 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg font-semibold mb-2">Use a Template</h3>
                            <p className="text-sm text-muted-foreground">
                                Pick from pre-built venue layouts for popular PH arenas
                            </p>
                        </Card>

                        <Card
                            className="p-8 text-center cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
                            onClick={() => setView('builder')}
                        >
                            <PenTool className="w-12 h-12 mx-auto mb-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg font-semibold mb-2">Build Custom</h3>
                            <p className="text-sm text-muted-foreground">
                                Draw your own sections and configure seats from scratch
                            </p>
                        </Card>
                    </div>
                </div>
            )
        }

        // ── Template browser ─────────────────────────────────────────────────
        if (view === 'templates') {
            return (
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center gap-3 mb-6">
                        <Button variant="ghost" size="sm" onClick={() => setView('choose')}>
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <h2 className="text-xl font-bold">Choose a Venue Template</h2>
                    </div>

                    {templates.length === 0 ? (
                        <Card className="p-12 text-center">
                            <p className="text-muted-foreground">
                                No templates available yet. Build a custom map instead.
                            </p>
                            <Button
                                className="mt-4"
                                onClick={() => setView('builder')}
                            >
                                Build Custom
                            </Button>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {templates.map((template) => (
                                <Card
                                    key={template.id}
                                    className={`overflow-hidden transition-all ${applyingTemplate ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:border-primary/50 hover:shadow-lg'}`}
                                    onClick={() => handleSelectTemplate(template)}
                                >
                                    <div className="h-36 bg-slate-100 flex items-center justify-center relative">
                                        {applyingTemplate === template.id && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                            </div>
                                        )}
                                        {template.thumbnail_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={template.thumbnail_url}
                                                alt={template.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-slate-400 text-sm">No preview</span>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-semibold text-sm flex items-center gap-1.5">
                                            {template.name}
                                            {!template.is_published && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500">Mine</span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">{template.venue_name}</p>
                                        {template.total_capacity && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {template.total_capacity.toLocaleString()} seats
                                            </p>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )
        }

        // ── Canvas builder ───────────────────────────────────────────────────
        const live = workspace?.live ?? null
        const draft = draftMeta
        const seatCount = canvasData ? canvasData.sections.reduce((sum, s) => sum + s.seats.length, 0) : 0
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button variant="ghost" size="sm" onClick={() => setView('choose')}>
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <h2 className="text-xl font-bold">Seat Map Editor</h2>
                        <span className="text-sm text-muted-foreground">{seatCount} seats</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {saving && (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving draft</span>
                        )}
                        {canvasData && (
                            <Button variant="outline" size="sm" onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                                {savingTemplate ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                                Save as template
                            </Button>
                        )}
                    </div>
                </div>

                {/* Draft / live status strip */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                        {live ? (
                            <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span><span className="font-medium">Live v{live.publishedVersion}</span> <span className="text-muted-foreground">· published {relative(live.publishedAt)}</span></span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                <span><span className="font-medium">Not published</span> <span className="text-muted-foreground">· buyers can&apos;t see this map yet</span></span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                        {draft ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2.5 py-0.5 text-xs font-medium">
                                Draft{builderDirty ? ' · unsaved edits' : ` · saved ${relative(draft.updatedAt)}${draft.updatedBy ? ` by ${draft.updatedBy}` : ''}`}
                            </span>
                        ) : builderDirty ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2.5 py-0.5 text-xs font-medium">Unsaved edits</span>
                        ) : live ? (
                            <span className="text-xs text-muted-foreground">No unpublished changes</span>
                        ) : null}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={openPreview} disabled={!canvasData}>
                            <Eye className="w-4 h-4 mr-1.5" />Preview as buyer
                        </Button>
                        {live && (
                            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
                                <History className="w-4 h-4 mr-1.5" />History
                            </Button>
                        )}
                        {draft && (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} className="text-muted-foreground">
                                <Trash2 className="w-4 h-4 mr-1.5" />Discard draft
                            </Button>
                        )}
                        <Button size="sm" onClick={openPublish} disabled={!draft && !builderDirty}>
                            <Upload className="w-4 h-4 mr-1.5" />Publish
                        </Button>
                    </div>
                </div>

                <div className="h-[calc(100vh-200px)] min-h-[700px]">
                    <CanvasBuilder
                        key={builderKey}
                        initialData={canvasData}
                        onSave={handleSave}
                        onDirtyChange={setBuilderDirty}
                        autosaveMs={8000}
                        mode="organizer"
                        tiers={tiers}
                        onCreateTier={handleCreateTier}
                        onUploadImageFile={handleUploadImageFile}
                    />
                </div>
            </div>
        )
    }

    const pv = publishState.preview
    const counts = pv?.diff.counts
    const changeLines: string[] = []
    if (counts) {
        const add = (n: number, one: string, many: string) => { if (n > 0) changeLines.push(`${n} ${n === 1 ? one : many}`) }
        add(counts.sections_added, 'section added', 'sections added')
        add(counts.sections_removed, 'section removed', 'sections removed')
        add(counts.sections_renamed, 'section renamed', 'sections renamed')
        add(counts.seats_added, 'seat added', 'seats added')
        add(counts.seats_removed, 'seat removed', 'seats removed')
        add(counts.seats_moved, 'seat moved', 'seats moved')
        add(counts.seats_relabelled, 'seat relabelled', 'seats relabelled')
        add(counts.seats_repriced, 'seat re-priced', 'seats re-priced')
        add(counts.seats_blocked, 'seat blocked', 'seats blocked')
        add(counts.seats_unblocked, 'seat unblocked', 'seats unblocked')
    }

    return (
        <>
            {!loading && hasMap && (
                <SeatingSettingsCard
                    eventId={eventId}
                    initialMode={event?.seat_selection_mode ?? 'both'}
                    initialAvoidOrphans={event?.avoid_orphan_seats ?? true}
                />
            )}
            {renderContent()}

            {/* Save conflict */}
            <Dialog open={!!conflict} onOpenChange={(o) => { if (!o) setConflict(null) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" />Someone else saved a newer draft</DialogTitle>
                        <DialogDescription className="pt-2">
                            {conflict?.updatedBy ? `${conflict.updatedBy} saved` : 'A newer draft was saved'} {relative(conflict?.updatedAt)}. Your edits weren&apos;t written.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" onClick={() => resolveConflict('theirs')}>Load their draft</Button>
                        <Button variant="destructive" onClick={() => resolveConflict('mine')}>Overwrite with mine</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Publish */}
            <Dialog open={publishState.open} onOpenChange={(o) => { if (!o && !publishState.busy) setPublishState((p) => ({ ...p, open: false })) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{pv ? `Publish v${pv.nextVersion}` : 'Publish seat map'}</DialogTitle>
                        <DialogDescription>
                            {workspace?.live ? 'Replaces the map buyers see right now. Sold seats are never touched.' : 'Makes this map visible to buyers for the first time.'}
                        </DialogDescription>
                    </DialogHeader>
                    {publishState.loading ? (
                        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : publishState.error && !pv ? (
                        <p className="text-sm text-destructive">{publishState.error}</p>
                    ) : pv ? (
                        <div className="space-y-4 text-sm">
                            <div className="rounded-lg border p-3">
                                <p className="font-medium mb-1">{pv.diff.totalBefore.toLocaleString()} → {pv.diff.totalAfter.toLocaleString()} seats</p>
                                {changeLines.length > 0 ? (
                                    <p className="text-muted-foreground">{changeLines.join(' · ')}</p>
                                ) : (
                                    <p className="text-muted-foreground">{pv.diff.cosmeticOnly ? 'Only visual changes (colours, decor, positions) — nothing sellable moves.' : 'No changes detected.'}</p>
                                )}
                                {pv.diff.tierInventory.length > 0 && (
                                    <ul className="mt-2 space-y-0.5 text-muted-foreground">
                                        {pv.diff.tierInventory.map((t) => (
                                            <li key={t.tierId}><span className="text-foreground">{t.name}</span>: {t.before} → {t.after} seats</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {pv.staleBase && (
                                <p className="text-xs text-muted-foreground">This draft was started from an older version than the one currently live (v{pv.nextVersion - 1}). Publishing replaces v{pv.nextVersion - 1} entirely.</p>
                            )}
                            {pv.warnings.length > 0 && (
                                <ul className="space-y-1.5">
                                    {pv.warnings.map((w, i) => (
                                        <li key={i} className="flex gap-2 text-amber-800 dark:text-amber-200"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{w}</span></li>
                                    ))}
                                </ul>
                            )}
                            {pv.blockers.length > 0 && (
                                <ul className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                                    {pv.blockers.map((b, i) => (
                                        <li key={i} className="text-destructive">{b}</li>
                                    ))}
                                </ul>
                            )}
                            {publishState.error && <p className="text-sm text-destructive">{publishState.error}</p>}
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishState((p) => ({ ...p, open: false }))} disabled={publishState.busy}>Cancel</Button>
                        <Button onClick={confirmPublish} disabled={!pv || pv.blockers.length > 0 || publishState.busy}>
                            {publishState.busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                            {pv ? `Publish v${pv.nextVersion}` : 'Publish'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Discard draft */}
            <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Discard this draft?</DialogTitle>
                        <DialogDescription>Every unpublished edit is thrown away. The published map is not affected.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
                        <Button variant="destructive" onClick={discardDraft}>Discard draft</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* History */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Published versions</DialogTitle>
                        <DialogDescription>Restore copies a version into your draft — nothing goes live until you publish it.</DialogDescription>
                    </DialogHeader>
                    <ul className="divide-y max-h-[60vh] overflow-y-auto -mx-1">
                        {(workspace?.versions ?? []).map((v) => {
                            const sm: any = v.summary ?? {}
                            const isLive = v.version === workspace?.live?.publishedVersion
                            const bits: string[] = []
                            if (typeof sm.total_seats === 'number') bits.push(`${Number(sm.total_seats).toLocaleString()} seats`)
                            if (sm.seats_added) bits.push(`+${sm.seats_added}`)
                            if (sm.seats_removed) bits.push(`−${sm.seats_removed}`)
                            if (sm.seats_repriced) bits.push(`${sm.seats_repriced} re-priced`)
                            return (
                                <li key={v.version} className="flex items-center gap-3 px-1 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium">v{v.version}{isLive && <span className="ml-2 text-xs font-normal text-emerald-600">live</span>}</p>
                                        <p className="text-xs text-muted-foreground">{relative(v.publishedAt)}{v.publishedBy ? ` · ${v.publishedBy}` : ''}{bits.length ? ` · ${bits.join(' · ')}` : ''}</p>
                                    </div>
                                    {!isLive && (
                                        <Button variant="outline" size="sm" onClick={() => restoreVersion(v.version)} disabled={restoring !== null}>
                                            {restoring === v.version ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Restore</>}
                                        </Button>
                                    )}
                                </li>
                            )
                        })}
                        {(workspace?.versions ?? []).length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No published versions yet.</li>}
                    </ul>
                </DialogContent>
            </Dialog>

            {/* Preview as buyer */}
            <Dialog open={previewState.open} onOpenChange={(o) => { if (!o) setPreviewState({ open: false, bundle: null, loading: false }) }}>
                <DialogContent className="max-w-4xl w-[95vw] h-[92vh] flex flex-col gap-3 overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Choose Your Seats</DialogTitle>
                        <DialogDescription>Exactly what buyers see on the event page{previewState.bundle?.source === 'draft' ? ' — built from your draft' : ''}.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 flex flex-col min-w-0">
                        {previewState.loading || !previewState.bundle ? (
                            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : (
                            <SeatMapPicker eventId={eventId} maxPerOrder={event?.max_seats_per_order ?? 10} preview={previewState.bundle} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

// ─── How buyers choose seats (event-level) ───────────────────────────────────
function SeatingSettingsCard({
    eventId,
    initialMode,
    initialAvoidOrphans,
}: {
    eventId: string
    initialMode: 'best_available' | 'pick' | 'both'
    initialAvoidOrphans: boolean
}) {
    const { toast } = useToast()
    const [mode, setMode] = useState<'best_available' | 'pick' | 'both'>(initialMode)
    const [avoidOrphans, setAvoidOrphans] = useState(initialAvoidOrphans)
    const [saving, setSaving] = useState(false)

    const save = async (next: { seatSelectionMode?: 'best_available' | 'pick' | 'both'; avoidOrphanSeats?: boolean }) => {
        setSaving(true)
        const res = await updateSeatingSettings(eventId, next)
        setSaving(false)
        if ('error' in res && res.error) {
            toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
            return false
        }
        return true
    }

    const MODES: { value: 'best_available' | 'pick' | 'both'; label: string; hint: string }[] = [
        { value: 'both', label: 'Best available + pick', hint: 'Tap a section, we pick seats together; "pick my own" one tap away. Recommended.' },
        { value: 'best_available', label: 'Best available only', hint: 'Fastest on mobile. Buyers choose a section and how many; we assign.' },
        { value: 'pick', label: 'Pick only', hint: 'Buyers click every seat themselves. Full control, more abandoned carts.' },
    ]

    return (
        <Card className="p-5 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="font-semibold">How buyers choose seats</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Best available sells faster on mobile; pick-only gives buyers full control but more abandoned carts.
                    </p>
                </div>
                {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving</span>}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {MODES.map(m => (
                    <button
                        key={m.value}
                        type="button"
                        onClick={async () => { const prev = mode; setMode(m.value); if (!(await save({ seatSelectionMode: m.value }))) setMode(prev) }}
                        className={`rounded-xl border p-3 text-left transition-colors ${mode === m.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                        <span className="block text-sm font-medium">{m.label}</span>
                        <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">{m.hint}</span>
                    </button>
                ))}
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={avoidOrphans}
                    disabled={mode === 'pick'}
                    onChange={async (e) => { const v = e.target.checked; setAvoidOrphans(v); if (!(await save({ avoidOrphanSeats: v }))) setAvoidOrphans(!v) }}
                    className="mt-0.5 h-4 w-4"
                />
                <span>
                    <span className="block text-sm font-medium">Avoid leaving single seats</span>
                    <span className="block text-xs text-muted-foreground">When auto-assigning, don&apos;t strand one lonely seat at the end of a block — it rarely sells.</span>
                </span>
            </label>
        </Card>
    )
}
