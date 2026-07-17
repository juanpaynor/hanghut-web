'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Library, PenTool, Save, ArrowLeft, AlertTriangle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { getEventSeatMap, saveEventSeatMap, getUsableVenueTemplates, getVenueTemplateCanvas, saveVenueTemplate } from '@/lib/seat-map/seat-map-actions'
import { createTicketTier } from '@/lib/organizer/tier-actions'
import type { CanvasData, TierInfo } from '@/components/seat-map/types'
import { TIER_PALETTE } from '@/components/seat-map/types'
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
    const [existingMap, setExistingMap] = useState<any>(null)
    const [canvasData, setCanvasData] = useState<CanvasData | null>(null)
    const [templates, setTemplates] = useState<any[]>([])
    const [showWarning, setShowWarning] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('hanghut_seatmap_warning_dismissed') !== 'true'
        }
        return true
    })

    const dismissWarning = () => {
        setShowWarning(false)
        if (typeof window !== 'undefined') {
            localStorage.setItem('hanghut_seatmap_warning_dismissed', 'true')
        }
    }

    const [tiers, setTiers] = useState<TierInfo[]>([])

    // Load existing seat map + the event's ticket tiers (price categories)
    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const supabase = createClient()
                const [map, tiersRes] = await Promise.all([
                    getEventSeatMap(eventId),
                    supabase
                        .from('ticket_tiers')
                        .select('id, name, price, sort_order, quantity_total')
                        .eq('event_id', eventId)
                        .eq('is_active', true)
                        .order('sort_order', { ascending: true }),
                ])
                if (map) {
                    setExistingMap(map)
                    setCanvasData(map.canvas_data as unknown as CanvasData)
                    setView('builder')
                }
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
    }, [eventId])

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
            setCanvasData(canvas as CanvasData)
            setView('builder')
        } catch (err: any) {
            console.error('Failed to load template:', err)
            toast({ title: 'Could not load template', description: err?.message || 'Please try again.', variant: 'destructive' })
        } finally {
            setApplyingTemplate(null)
        }
    }

    const handleSave = async (data: CanvasData) => {
        setSaving(true)
        try {
            await saveEventSeatMap(eventId, data)
            setCanvasData(data)
            toast({
                title: 'Seat map saved',
                description: `${data.sections.reduce((sum, s) => sum + s.seats.length, 0)} seats configured`,
            })
        } catch (err) {
            console.error('Failed to save seat map:', err)
            toast({
                title: 'Error',
                description: 'Failed to save seat map. Please try again.',
                variant: 'destructive',
            })
        } finally {
            setSaving(false)
        }
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
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setView('choose')}>
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <h2 className="text-xl font-bold">Seat Map Editor</h2>
                        {canvasData && (
                            <span className="text-sm text-muted-foreground">
                                {canvasData.sections.reduce((sum, s) => sum + s.seats.length, 0)} seats configured
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {saving && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </div>
                        )}
                        {canvasData && (
                            <Button variant="outline" size="sm" onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                                {savingTemplate
                                    ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                    : <Save className="w-4 h-4 mr-1.5" />}
                                Save as template
                            </Button>
                        )}
                    </div>
                </div>

                <div className="h-[calc(100vh-140px)] min-h-[700px]">
                    <CanvasBuilder
                        initialData={canvasData}
                        onSave={handleSave}
                        mode="organizer"
                        tiers={tiers}
                        onCreateTier={handleCreateTier}
                        onUploadImageFile={handleUploadImageFile}
                    />
                </div>
            </div>
        )
    }

    return (
        <>
            {renderContent()}

            <Dialog open={showWarning} onOpenChange={setShowWarning}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-500">
                            <AlertTriangle className="w-5 h-5" />
                            Seat Map in Development
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-base">
                            The advanced seat map builder is currently in active development. Please refrain from using it to configure live events.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <p className="text-sm text-muted-foreground">
                            Data structures and behaviors may change without notice, which could break your ticketing setup. Feel free to explore it safely on test events.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={dismissWarning}>
                            I Understand
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
