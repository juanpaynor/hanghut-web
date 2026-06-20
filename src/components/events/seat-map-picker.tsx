'use client'

/**
 * Buyer-facing seat picker. Renders the event's seat map (from the
 * get_event_seat_map RPC) in a customer-facing style: light theme, venue
 * overview with price-colored sections, tap a section to zoom into seats.
 *
 * Selection is optimistic — seats are validated and held server-side at
 * checkout (assign_seats_to_intent). A SEATS_UNAVAILABLE error there sends
 * the buyer back here with fresh availability.
 *
 * The Flutter app renders the same RPC payload with CustomPainter; this
 * component and that one share the JSON contract, not the rendering code.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Stage, Layer, Line, Circle, Text, Rect, Ellipse, Group } from 'react-konva'
import type Konva from 'konva'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loader2, Minus, Plus, RotateCcw, ArrowLeft, Armchair } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ─── RPC payload types (shared contract with the Flutter app) ───────────────

interface MapTier {
    id: string
    name: string
    price: number
    sort_order: number
}

interface MapSeat {
    id: string
    row: string
    seat: number
    label: string
    x: number
    y: number
    tier_id: string | null
    status: 'available' | 'held' | 'booked' | 'disabled'
}

interface MapSection {
    id: string
    label: string
    color: string
    section_type: string
    polygon_points: number[]
    tier_id: string | null
    row_tier_overrides: Record<string, string>
    available_count: number
    seats: MapSeat[]
}

interface MapBackgroundShape {
    id: string
    type: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'line' | 'polygon' | 'text' | 'image'
    x: number
    y: number
    width?: number
    height?: number
    radius?: number
    points?: number[]
    fill?: string
    stroke?: string
    strokeWidth?: number
    label?: string
    fontSize?: number
    fontColor?: string
    rotation?: number
    imageUrl?: string
    opacity?: number
    scale?: number
}

interface SeatMapData {
    event_id: string
    canvas_width: number
    canvas_height: number
    tiers: MapTier[]
    sections: MapSection[]
    background_shapes: MapBackgroundShape[]
}

interface SeatMapPickerProps {
    eventId: string
}

const TIER_PALETTE = [
    '#f59e0b', '#6366f1', '#22c55e', '#ec4899',
    '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6',
    '#f43f5e', '#3b82f6', '#84cc16', '#d946ef',
]

const TAKEN_COLOR = '#d1d5db'
const SELECTED_COLOR = '#0f172a'

export function SeatMapPicker({ eventId }: SeatMapPickerProps) {
    const router = useRouter()
    const { toast } = useToast()
    const containerRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<Konva.Stage>(null)

    const [mapData, setMapData] = useState<SeatMapData | null>(null)
    const [loading, setLoading] = useState(true)
    const [stageSize, setStageSize] = useState({ width: 100, height: 480 })
    const [activeSection, setActiveSection] = useState<string | null>(null)
    const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
    const [navigating, setNavigating] = useState(false)
    const [hoveredSeat, setHoveredSeat] = useState<{ seat: MapSeat; screenX: number; screenY: number } | null>(null)

    // ─── Data loading + periodic availability refresh ────────────────────
    const loadMap = useCallback(async () => {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('get_event_seat_map', { p_event_id: eventId })
        if (!error && data) setMapData(data as SeatMapData)
        setLoading(false)
    }, [eventId])

    useEffect(() => {
        loadMap()
        const interval = setInterval(loadMap, 30000)
        return () => clearInterval(interval)
    }, [loadMap])

    // Live updates: booked seats grey out as other buyers complete payment
    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(`seats-${eventId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'seats',
                filter: `event_id=eq.${eventId}`,
            }, (payload) => {
                const updated = payload.new as { id: string; status: string }
                setMapData(prev => prev ? {
                    ...prev,
                    sections: prev.sections.map(sec => ({
                        ...sec,
                        seats: sec.seats.map(s =>
                            s.id === updated.id
                                ? { ...s, status: (updated.status === 'available' ? 'available' : updated.status) as MapSeat['status'] }
                                : s
                        ),
                    })),
                } : prev)
                setSelectedSeatIds(prev => prev.filter(id => id !== updated.id || updated.status === 'available'))
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [eventId])

    // ─── Responsive stage ────────────────────────────────────────────────
    // Depends on mapData: while loading, the component early-returns a spinner
    // and the container ref is null, so this must re-run once the real map
    // container mounts — otherwise stageSize keeps its tiny initial value and
    // the canvas renders as a small box in the corner.
    useEffect(() => {
        if (!containerRef.current) return
        const update = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect()
                setStageSize({ width: rect.width, height: rect.height })
            }
        }
        update()
        const ro = new ResizeObserver(update)
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [mapData])

    // ─── Derived data ────────────────────────────────────────────────────
    const tierColors = useMemo(() => {
        const map = new Map<string, string>()
        mapData?.tiers.forEach((t, i) => map.set(t.id, TIER_PALETTE[i % TIER_PALETTE.length]))
        return map
    }, [mapData])

    const tierById = useMemo(
        () => new Map((mapData?.tiers ?? []).map(t => [t.id, t])),
        [mapData]
    )

    const allSeats = useMemo(() => {
        const map = new Map<string, MapSeat>()
        mapData?.sections.forEach(sec => sec.seats.forEach(s => map.set(s.id, s)))
        return map
    }, [mapData])

    const selectedSeats = selectedSeatIds.map(id => allSeats.get(id)).filter(Boolean) as MapSeat[]
    const selectedTierId = selectedSeats[0]?.tier_id ?? null
    const selectedTier = selectedTierId ? tierById.get(selectedTierId) : null
    const totalPrice = selectedTier ? Number(selectedTier.price) * selectedSeats.length : 0

    // Fit-to-content view for the overview. Fits the bounding box of the actual
    // sections (not the full canvas) — sections rarely fill the canvas, so fitting
    // canvas_width/height would render them as a tiny cluster in one corner.
    const fitOverview = useCallback(() => {
        if (!mapData || mapData.sections.length === 0) return
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        const extend = (x: number, y: number) => {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
        for (const sec of mapData.sections) {
            const pts = sec.polygon_points
            for (let i = 0; i < pts.length; i += 2) extend(pts[i], pts[i + 1])
        }
        // Include decor zones (stage, entrance, bars…) so they stay in frame.
        // Images are intentionally excluded — they're organizer tracing aids.
        for (const shape of mapData.background_shapes ?? []) {
            if (shape.type === 'image') continue
            const b = shapeBounds(shape)
            extend(b.minX, b.minY); extend(b.maxX, b.maxY)
        }
        if (!isFinite(minX)) return
        const pad = 40
        const contentW = maxX - minX
        const contentH = maxY - minY
        const scale = Math.min(
            stageSize.width / (contentW + pad * 2),
            stageSize.height / (contentH + pad * 2),
            3, // don't over-zoom a small layout
        )
        setView({
            scale,
            x: (stageSize.width - contentW * scale) / 2 - minX * scale,
            y: (stageSize.height - contentH * scale) / 2 - minY * scale,
        })
        setActiveSection(null)
    }, [mapData, stageSize])

    useEffect(() => { fitOverview() }, [fitOverview])

    // Zoom into one section's bounding box
    const zoomToSection = useCallback((section: MapSection) => {
        const pts = section.polygon_points
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let i = 0; i < pts.length; i += 2) {
            minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i])
            minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1])
        }
        const pad = 30
        const w = maxX - minX + pad * 2
        const h = maxY - minY + pad * 2
        const scale = Math.min(stageSize.width / w, stageSize.height / h, 4)
        setView({
            scale,
            x: stageSize.width / 2 - (minX + (maxX - minX) / 2) * scale,
            y: stageSize.height / 2 - (minY + (maxY - minY) / 2) * scale,
        })
        setActiveSection(section.id)
    }, [stageSize])

    // ─── Interactions ────────────────────────────────────────────────────
    const handleSeatTap = useCallback((seat: MapSeat) => {
        if (seat.status !== 'available' || !seat.tier_id) return

        setSelectedSeatIds(prev => {
            if (prev.includes(seat.id)) return prev.filter(id => id !== seat.id)

            const currentTier = prev.length > 0 ? allSeats.get(prev[0])?.tier_id : null
            if (currentTier && currentTier !== seat.tier_id) {
                toast({
                    title: 'One price category per order',
                    description: 'Finish this order first, or clear your selection to switch categories.',
                })
                return prev
            }
            if (prev.length >= 10) {
                toast({ title: 'Limit reached', description: 'Maximum of 10 seats per order.' })
                return prev
            }
            return [...prev, seat.id]
        })
    }, [allSeats, toast])

    const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault()
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const scaleBy = 1.06
        const oldScale = view.scale
        const newScale = Math.max(0.2, Math.min(5, e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy))
        const worldPos = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale }
        setView({
            scale: newScale,
            x: pointer.x - worldPos.x * newScale,
            y: pointer.y - worldPos.y * newScale,
        })
    }, [view])

    const zoomButton = useCallback((factor: number) => {
        const center = { x: stageSize.width / 2, y: stageSize.height / 2 }
        const newScale = Math.max(0.2, Math.min(5, view.scale * factor))
        const worldPos = { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale }
        setView({
            scale: newScale,
            x: center.x - worldPos.x * newScale,
            y: center.y - worldPos.y * newScale,
        })
    }, [view, stageSize])

    const handleContinue = () => {
        if (!selectedTierId || selectedSeats.length === 0) return
        setNavigating(true)
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', String(selectedSeats.length))
        params.set('tierId', selectedTierId)
        params.set('seatIds', selectedSeatIds.join(','))
        router.push(`/checkout?${params.toString()}`)
    }

    // Section fill: resolved tier color (price category) wins over builder color
    const sectionFill = (section: MapSection) =>
        (section.tier_id && tierColors.get(section.tier_id)) || section.color

    // Seat dot fill by status/selection
    const seatFill = (seat: MapSeat) => {
        if (selectedSeatIds.includes(seat.id)) return SELECTED_COLOR
        if (seat.status !== 'available') return TAKEN_COLOR
        return (seat.tier_id && tierColors.get(seat.tier_id)) || '#6366f1'
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[420px] rounded-2xl border bg-muted/20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!mapData || mapData.sections.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[300px] rounded-2xl border bg-muted/20 text-muted-foreground gap-2">
                <Armchair className="h-8 w-8 opacity-40" />
                <p className="text-sm">Seat map unavailable</p>
            </div>
        )
    }

    const activeSectionData = activeSection
        ? mapData.sections.find(s => s.id === activeSection)
        : null

    return (
        <div className="space-y-3 min-w-0">
            {/* Price legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {mapData.tiers.map(tier => (
                    <div key={tier.id} className="flex items-center gap-1.5 text-xs">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tierColors.get(tier.id) }} />
                        <span className="font-medium">{tier.name}</span>
                        <span className="text-muted-foreground">₱{Number(tier.price).toLocaleString()}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: TAKEN_COLOR }} />
                    <span className="text-muted-foreground">Taken</span>
                </div>
            </div>

            {/* Map canvas */}
            <div
                ref={containerRef}
                className="relative w-full h-[420px] sm:h-[480px] rounded-2xl border bg-white dark:bg-slate-100 overflow-hidden touch-none"
            >
                <Stage
                    ref={stageRef}
                    width={stageSize.width}
                    height={stageSize.height}
                    scaleX={view.scale}
                    scaleY={view.scale}
                    x={view.x}
                    y={view.y}
                    draggable
                    onWheel={handleWheel}
                    onDragEnd={(e) => setView(v => ({ ...v, x: e.target.x(), y: e.target.y() }))}
                >
                    <Layer>
                        {/* Decor zones (stage, entrance, bars…) — behind sections.
                            Images are skipped: they're organizer-only tracing aids. */}
                        {mapData.background_shapes?.filter(s => s.type !== 'image').map(shape => (
                            <BuyerBackgroundShape key={shape.id} shape={shape} />
                        ))}

                        {/* Section polygons */}
                        {mapData.sections.map(section => {
                            const isActive = section.id === activeSection
                            const soldOut = section.available_count === 0
                            const center = sectionCenter(section.polygon_points)
                            return (
                                <SectionShape
                                    key={section.id}
                                    section={section}
                                    fill={sectionFill(section)}
                                    isActive={isActive}
                                    soldOut={soldOut}
                                    center={center}
                                    showLabel={!activeSection || isActive}
                                    onTap={() => !soldOut && zoomToSection(section)}
                                />
                            )
                        })}

                        {/* Seats — only the active section's, drawn above polygons */}
                        {activeSectionData?.seats.map(seat => (
                            <Circle
                                key={seat.id}
                                x={seat.x}
                                y={seat.y}
                                radius={selectedSeatIds.includes(seat.id) ? 8 : 6}
                                fill={seatFill(seat)}
                                stroke={selectedSeatIds.includes(seat.id) ? '#ffffff' : undefined}
                                strokeWidth={2}
                                opacity={seat.status === 'available' ? 1 : 0.55}
                                onClick={() => handleSeatTap(seat)}
                                onTap={() => handleSeatTap(seat)}
                                hitStrokeWidth={10}
                                perfectDrawEnabled={false}
                                onMouseEnter={(e) => {
                                    const stage = e.target.getStage()
                                    const pos = stage?.getPointerPosition()
                                    if (pos) setHoveredSeat({ seat, screenX: pos.x, screenY: pos.y })
                                    const container = stage?.container()
                                    if (container) container.style.cursor = seat.status === 'available' ? 'pointer' : 'not-allowed'
                                }}
                                onMouseMove={(e) => {
                                    const stage = e.target.getStage()
                                    const pos = stage?.getPointerPosition()
                                    if (pos) setHoveredSeat(prev => prev ? { ...prev, screenX: pos.x, screenY: pos.y } : null)
                                }}
                                onMouseLeave={(e) => {
                                    setHoveredSeat(null)
                                    const container = e.target.getStage()?.container()
                                    if (container) container.style.cursor = 'default'
                                }}
                            />
                        ))}
                    </Layer>
                </Stage>

                {/* Seat hover tooltip */}
                {hoveredSeat && activeSectionData && (() => {
                    const { seat, screenX, screenY } = hoveredSeat
                    const tier = seat.tier_id
                        ? tierById.get(seat.tier_id)
                        : activeSectionData.tier_id
                        ? tierById.get(activeSectionData.tier_id)
                        : null
                    // Keep card within stage bounds
                    const cardW = 240
                    const cardH = 80
                    const left = Math.min(screenX + 12, stageSize.width - cardW - 8)
                    const top = screenY - cardH - 12 < 8 ? screenY + 12 : screenY - cardH - 12
                    return (
                        <div
                            className="absolute z-50 pointer-events-none select-none"
                            style={{ left, top, width: cardW }}
                        >
                            <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                                {/* Header bar — section color */}
                                <div
                                    className="px-3 py-1.5 text-white text-[11px] font-bold uppercase tracking-wide"
                                    style={{ backgroundColor: tier ? tierColors.get(tier.id) : activeSectionData.color }}
                                >
                                    {activeSectionData.label}
                                </div>
                                {/* Details grid */}
                                <div className="grid grid-cols-3 divide-x divide-gray-100 px-0">
                                    <div className="px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Row</div>
                                        <div className="text-sm font-bold text-gray-900">{seat.row}</div>
                                    </div>
                                    <div className="px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Seat</div>
                                        <div className="text-sm font-bold text-gray-900">{seat.seat}</div>
                                    </div>
                                    <div className="px-3 py-2 text-center">
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Price</div>
                                        <div className="text-sm font-bold text-gray-900">
                                            {tier ? `₱${Number(tier.price).toLocaleString()}` : '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })()}

                {/* Controls overlay */}
                <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                    <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={() => zoomButton(1.3)}>
                        <Plus className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={() => zoomButton(1 / 1.3)}>
                        <Minus className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={fitOverview}>
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>

                {activeSection && (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-3 left-3 shadow-sm"
                        onClick={fitOverview}
                    >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                        All sections
                    </Button>
                )}

                {!activeSection && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-sm pointer-events-none">
                        Tap a section to pick seats
                    </div>
                )}
            </div>

            {/* Selection bar */}
            <div className={cn(
                'rounded-2xl border p-4 transition-colors',
                selectedSeats.length > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/20'
            )}>
                {selectedSeats.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center">
                        No seats selected yet
                    </p>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                            {selectedSeats
                                .slice()
                                .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
                                .map(seat => (
                                    <button
                                        key={seat.id}
                                        onClick={() => handleSeatTap(seat)}
                                        className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-80 transition-opacity"
                                        title="Tap to remove"
                                    >
                                        {seat.label} ✕
                                    </button>
                                ))}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm">
                                <span className="font-semibold">{selectedSeats.length} seat{selectedSeats.length !== 1 ? 's' : ''}</span>
                                {selectedTier && (
                                    <span className="text-muted-foreground"> · {selectedTier.name}</span>
                                )}
                                <div className="font-bold text-lg">₱{totalPrice.toLocaleString()}</div>
                            </div>
                            <Button onClick={handleContinue} disabled={navigating} className="h-11 px-6 font-semibold">
                                {navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Section polygon + label ────────────────────────────────────────────────

function SectionShape({
    section,
    fill,
    isActive,
    soldOut,
    center,
    showLabel,
    onTap,
}: {
    section: MapSection
    fill: string
    isActive: boolean
    soldOut: boolean
    center: { x: number; y: number }
    showLabel: boolean
    onTap: () => void
}) {
    return (
        <>
            <Line
                points={section.polygon_points}
                closed
                fill={soldOut ? '#e5e7eb' : fill + (isActive ? '30' : '99')}
                stroke={soldOut ? '#9ca3af' : fill}
                strokeWidth={isActive ? 2.5 : 1.5}
                onClick={onTap}
                onTap={onTap}
                hitStrokeWidth={8}
                perfectDrawEnabled={false}
            />
            {showLabel && !isActive && (
                <>
                    <Text
                        x={center.x - 70}
                        y={center.y - 14}
                        width={140}
                        align="center"
                        text={section.label}
                        fontSize={15}
                        fontStyle="bold"
                        fill={soldOut ? '#6b7280' : '#1e293b'}
                        listening={false}
                        perfectDrawEnabled={false}
                    />
                    <Text
                        x={center.x - 70}
                        y={center.y + 4}
                        width={140}
                        align="center"
                        text={soldOut ? 'Sold out' : `${section.available_count} left`}
                        fontSize={11}
                        fill="#64748b"
                        listening={false}
                        perfectDrawEnabled={false}
                    />
                </>
            )}
        </>
    )
}

// ─── Background decor (read-only mirror of the builder's shapes) ─────────────

/** Axis-aligned bounds of a background shape, used for fit-to-content. */
function shapeBounds(shape: MapBackgroundShape): { minX: number; minY: number; maxX: number; maxY: number } {
    const sc = shape.scale ?? 1
    switch (shape.type) {
        case 'circle': {
            const r = shape.radius ?? 40
            return { minX: shape.x - r, minY: shape.y - r, maxX: shape.x + r, maxY: shape.y + r }
        }
        case 'line': {
            const pts = shape.points && shape.points.length >= 4 ? shape.points : [0, 0, 120, 0]
            let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
            for (let i = 0; i < pts.length; i += 2) {
                mnx = Math.min(mnx, pts[i]); mxx = Math.max(mxx, pts[i])
                mny = Math.min(mny, pts[i + 1]); mxy = Math.max(mxy, pts[i + 1])
            }
            return { minX: shape.x + mnx, minY: shape.y + mny, maxX: shape.x + mxx, maxY: shape.y + mxy }
        }
        case 'image': {
            const w = (shape.width ?? 0) * sc, h = (shape.height ?? 0) * sc
            return { minX: shape.x, minY: shape.y, maxX: shape.x + w, maxY: shape.y + h }
        }
        case 'text': {
            const fs = shape.fontSize ?? 16
            return { minX: shape.x, minY: shape.y, maxX: shape.x + (shape.label?.length ?? 4) * fs * 0.6, maxY: shape.y + fs }
        }
        default: { // rect, ellipse, triangle, polygon
            const w = shape.width ?? 100, h = shape.height ?? 60
            return { minX: shape.x, minY: shape.y, maxX: shape.x + w, maxY: shape.y + h }
        }
    }
}

/** Non-interactive render of a decorative zone (stage, entrance, bar, table, label…).
 *  Images are not rendered on the buyer side — they're organizer tracing aids. */
function BuyerBackgroundShape({ shape }: { shape: MapBackgroundShape }) {
    if (shape.type === 'image') return null

    const common = { rotation: shape.rotation || 0, listening: false as const, perfectDrawEnabled: false }
    const fill = shape.fill || '#e2e8f0'
    const stroke = shape.stroke || undefined
    const strokeWidth = shape.strokeWidth || 0
    const centeredLabel = (boxW: number, boxH: number) =>
        shape.label ? (
            <Text text={shape.label} fill={shape.fontColor || '#ffffff'} fontSize={shape.fontSize || 14} fontStyle="bold" width={boxW} y={boxH / 2 - (shape.fontSize || 14) / 2} align="center" listening={false} perfectDrawEnabled={false} />
        ) : null

    if (shape.type === 'rect' || shape.type === 'polygon') {
        const w = shape.width || 100, h = shape.height || 60
        return (
            <Group x={shape.x} y={shape.y} {...common}>
                <Rect width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} cornerRadius={4} listening={false} perfectDrawEnabled={false} />
                {centeredLabel(w, h)}
            </Group>
        )
    }
    if (shape.type === 'circle') {
        const r = shape.radius || 40
        return (
            <Group x={shape.x} y={shape.y} {...common}>
                <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} listening={false} perfectDrawEnabled={false} />
                {shape.label ? <Text text={shape.label} fill={shape.fontColor || '#ffffff'} fontSize={shape.fontSize || 14} fontStyle="bold" width={r * 2} x={-r} y={-(shape.fontSize || 14) / 2} align="center" listening={false} perfectDrawEnabled={false} /> : null}
            </Group>
        )
    }
    if (shape.type === 'ellipse') {
        const w = shape.width || 120, h = shape.height || 70
        return (
            <Group x={shape.x} y={shape.y} {...common}>
                <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} listening={false} perfectDrawEnabled={false} />
                {centeredLabel(w, h)}
            </Group>
        )
    }
    if (shape.type === 'triangle') {
        const w = shape.width || 100, h = shape.height || 90
        return (
            <Group x={shape.x} y={shape.y} {...common}>
                <Line points={[w / 2, 0, w, h, 0, h]} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} listening={false} perfectDrawEnabled={false} />
                {shape.label ? <Text text={shape.label} fill={shape.fontColor || '#ffffff'} fontSize={shape.fontSize || 14} fontStyle="bold" width={w} y={h * 0.55} align="center" listening={false} perfectDrawEnabled={false} /> : null}
            </Group>
        )
    }
    if (shape.type === 'line') {
        const pts = shape.points && shape.points.length >= 4 ? shape.points : [0, 0, 120, 0]
        return (
            <Group x={shape.x} y={shape.y} {...common}>
                <Line points={pts} stroke={shape.stroke || shape.fill || '#94a3b8'} strokeWidth={shape.strokeWidth || 3} lineCap="round" listening={false} perfectDrawEnabled={false} />
            </Group>
        )
    }
    if (shape.type === 'text') {
        return (
            <Text x={shape.x} y={shape.y} text={shape.label || 'Text'} fill={shape.fill || '#1e293b'} fontSize={shape.fontSize || 16} fontStyle="bold" rotation={shape.rotation || 0} listening={false} perfectDrawEnabled={false} />
        )
    }
    return null
}

function sectionCenter(points: number[]): { x: number; y: number } {
    let sumX = 0, sumY = 0
    const count = points.length / 2
    for (let i = 0; i < points.length; i += 2) {
        sumX += points[i]
        sumY += points[i + 1]
    }
    return { x: sumX / count, y: sumY / count }
}
