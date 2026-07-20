'use client'

/**
 * Buyer-facing seat picker. Customer-facing style: light theme, venue overview
 * with price-colored sections, tap a section to zoom into seats.
 *
 * Data is fetched as two halves for scale (geometry/status split):
 *  - GEOMETRY (/api/seat-map/geometry) — sections, seat coords, prices. Immutable
 *    per version token, served from the CDN. Fetched once; costs the DB ~nothing
 *    under load.
 *  - STATUS (/api/seat-map/status) — which seats are taken + remaining counts.
 *    Tiny, micro-cached, polled every ~12s (Realtime patches bookings sooner).
 * They're merged back into one SeatMapData so the render is unchanged.
 *
 * Selection is optimistic — seats are validated and held server-side at
 * checkout (assign_seats_to_intent). A SEATS_UNAVAILABLE error there sends the
 * buyer back here with fresh availability.
 *
 * NOTE: the Flutter app still consumes the single get_event_seat_map RPC (kept
 * intact). It can migrate to the split endpoints later — see team_comms.
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
    /** 'ga' = general admission (no seats, buy by quantity); price/capacity from tier_id */
    sales_mode?: 'seated' | 'ga'
    /** Total seats in this section (from overview geometry). Present before the
     *  seats themselves are lazily loaded, so seated sections aren't mistaken for GA. */
    seat_count?: number
    /** Empty until the section is opened (Phase 2 lazy load). */
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
    /** Organizer's chosen seat dot size (world units) from the editor. */
    seat_radius?: number | null
    seat_shape?: string | null
}

interface SeatMapPickerProps {
    eventId: string
    /** Event's max tickets per order (events.max_seats_per_order); defaults to 10. */
    maxPerOrder?: number
}

/** GA = buy by quantity, no seat dots. Uses `sales_mode` (authoritative from the
 *  geometry RPC) with a seat_count fallback — NOT seats.length, which is 0 for a
 *  seated section whose seats haven't been lazily loaded yet. */
function isGASection(section: MapSection): boolean {
    return section.sales_mode === 'ga'
        || ((section.seat_count ?? section.seats.length) === 0 && !!section.tier_id)
}

const TIER_PALETTE = [
    '#f59e0b', '#6366f1', '#22c55e', '#ec4899',
    '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6',
    '#f43f5e', '#3b82f6', '#84cc16', '#d946ef',
]

const TAKEN_COLOR = '#d1d5db'
const SELECTED_COLOR = '#0f172a'

// Below this many seats, prefetch every section's seats in the background right
// after the overview loads, so section taps are instant (covers ~all real
// events). Above it — a true arena — stay lazy: only load sections on tap so the
// initial payload stays tiny.
const PREFETCH_SEAT_LIMIT = 6000

export function SeatMapPicker({ eventId, maxPerOrder = 10 }: SeatMapPickerProps) {
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
    // GA (general admission) purchase sheet: tapping a GA zone picks a quantity,
    // not seats. gaSection is the zone being bought from.
    const [gaSection, setGaSection] = useState<MapSection | null>(null)
    const [gaQty, setGaQty] = useState(1)

    // Browsing-session id for seat holds. Persisted per-tab so checkout (same tab)
    // can release these holds right before assign_seats_to_intent takes its own —
    // a foreign-session hold would otherwise block the buyer's OWN checkout.
    const sessionIdRef = useRef('')
    useEffect(() => {
        let sid = sessionStorage.getItem('hh_seat_session')
        if (!sid) {
            sid = crypto.randomUUID()
            sessionStorage.setItem('hh_seat_session', sid)
        }
        sessionIdRef.current = sid
    }, [])

    // Release held seats when the picker closes WITHOUT continuing to checkout
    // (abandoned holds would otherwise block other buyers for the 12-min TTL).
    const selectedIdsRef = useRef<string[]>([])
    useEffect(() => { selectedIdsRef.current = selectedSeatIds }, [selectedSeatIds])
    const continuingRef = useRef(false)
    useEffect(() => () => {
        if (continuingRef.current || selectedIdsRef.current.length === 0) return
        // sendBeacon reliably fires during teardown (dialog close, navigation, tab
        // close) — a supabase-js rpc here is lazy AND can be cancelled mid-flight,
        // which is why abandoned holds were sticking until the 12-min TTL.
        try {
            const payload = JSON.stringify({ sessionId: sessionIdRef.current, seatIds: selectedIdsRef.current })
            navigator.sendBeacon('/api/seat-map/release', new Blob([payload], { type: 'application/json' }))
        } catch { /* best-effort */ }
    }, [])

    // ─── Data loading: overview geometry (cached) + status + lazy seats ──
    // Fetched in pieces for scale:
    //  - GEOMETRY = section polygons + counts ONLY (no seat arrays); keyed by a
    //    version token, CDN-cached. Tiny even for a huge arena.
    //  - Each section's SEATS are loaded on demand when the buyer zooms in
    //    (also version-keyed + CDN-cached).
    //  - STATUS = which seats are taken + remaining counts; small, polled.
    // We merge them into `mapData` so the render/selection code is unchanged.
    const geometryRef = useRef<any>(null)
    const statusRef = useRef<any>(null)
    const versionRef = useRef<number | null>(null)
    // Sections whose seats have been fetched into geometryRef (+ ones in flight).
    const loadedSectionsRef = useRef<Set<string>>(new Set())
    const inflightRef = useRef<Set<string>>(new Set())
    const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null)

    const mergeStatus = useCallback((geo: any, status: any): SeatMapData => {
        const takenMap = new Map<string, MapSeat['status']>(
            (status?.taken ?? []).map((t: any) => [t.id as string, t.status as MapSeat['status']])
        )
        const countMap = new Map<string, number>(
            (status?.sections ?? []).map((s: any) => [s.id as string, s.available_count as number])
        )
        return {
            ...geo,
            sections: (geo.sections ?? []).map((sec: any) => ({
                ...sec,
                available_count: countMap.get(sec.id) ?? 0,
                // seats is absent until the section is opened (lazy) → [] for now.
                seats: (sec.seats ?? []).map((s: any) => ({
                    ...s,
                    status: takenMap.get(s.id) ?? 'available',
                })),
            })),
        } as SeatMapData
    }, [])

    // Re-project current geometry + status into mapData (call after either changes).
    const remerge = useCallback(() => {
        if (geometryRef.current && statusRef.current) {
            setMapData(mergeStatus(geometryRef.current, statusRef.current))
        }
    }, [mergeStatus])

    const fetchStatus = useCallback(async (): Promise<any | null> => {
        try {
            const res = await fetch(`/api/seat-map/status?eventId=${eventId}`, { cache: 'no-store' })
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [eventId])

    const fetchGeometry = useCallback(async (version: number): Promise<any | null> => {
        try {
            // Version-keyed URL → immutable CDN cache; a new save = new URL.
            const res = await fetch(`/api/seat-map/geometry?eventId=${eventId}&v=${version}`)
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [eventId])

    const fetchSectionSeats = useCallback(async (sectionId: string, version: number): Promise<any[] | null> => {
        try {
            const res = await fetch(`/api/seat-map/section?sectionId=${sectionId}&v=${version}`)
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [])

    // Load one section's seats into geometryRef (once), then remerge so they
    // render. `background` skips the spinner (used by prefetch). Parallel-safe:
    // the write reads the LATEST geometryRef so concurrent loads don't clobber
    // each other, and a version guard drops results from a stale map.
    const loadSection = useCallback(async (sectionId: string, background = false) => {
        if (loadedSectionsRef.current.has(sectionId) || inflightRef.current.has(sectionId)) return
        const startVersion = versionRef.current
        if (startVersion == null || !geometryRef.current) return
        inflightRef.current.add(sectionId)
        if (!background) setLoadingSectionId(sectionId)
        try {
            const seats = await fetchSectionSeats(sectionId, startVersion)
            const cur = geometryRef.current
            if (seats && cur && versionRef.current === startVersion) {
                geometryRef.current = {
                    ...cur,
                    sections: cur.sections.map((sec: any) => sec.id === sectionId ? { ...sec, seats } : sec),
                }
                loadedSectionsRef.current.add(sectionId)
                remerge()
            }
        } finally {
            inflightRef.current.delete(sectionId)
            if (!background) setLoadingSectionId(null)
        }
    }, [fetchSectionSeats, remerge])

    // For normal-size maps, warm every section in the background so taps are
    // instant. A true arena (over the limit) stays lazy — sections load on tap.
    const maybePrefetch = useCallback(() => {
        const geo = geometryRef.current
        if (!geo) return
        const seated = (geo.sections ?? []).filter((s: any) => (s.seat_count ?? 0) > 0)
        const total = seated.reduce((n: number, s: any) => n + (s.seat_count ?? 0), 0)
        if (total === 0 || total > PREFETCH_SEAT_LIMIT) return
        // Gentle: a few at a time, in overview order.
        ;(async () => {
            const queue = [...seated]
            const worker = async () => { while (queue.length) { const s = queue.shift(); if (s) await loadSection(s.id, true) } }
            await Promise.all([worker(), worker(), worker()])
        })()
    }, [loadSection])

    // Initial load: status first (carries the version) → overview geometry → merge.
    const loadAll = useCallback(async () => {
        const status = await fetchStatus()
        if (!status) { setLoading(false); return }
        statusRef.current = status
        versionRef.current = status.version
        const geo = await fetchGeometry(status.version)
        if (geo) {
            geometryRef.current = geo
            loadedSectionsRef.current = new Set()
            remerge()
            maybePrefetch()
        }
        setLoading(false)
    }, [fetchStatus, fetchGeometry, remerge, maybePrefetch])

    // Cheap refresh: re-pull status only. If the version moved (organizer re-saved
    // mid-sale — rare), re-fetch the overview geometry (loaded seats reset).
    const refreshStatus = useCallback(async () => {
        const status = await fetchStatus()
        if (!status) return
        statusRef.current = status
        if (status.version !== versionRef.current) {
            versionRef.current = status.version
            const geo = await fetchGeometry(status.version)
            if (geo) { geometryRef.current = geo; loadedSectionsRef.current = new Set(); remerge(); maybePrefetch() }
        }
        remerge()
    }, [fetchStatus, fetchGeometry, remerge, maybePrefetch])

    useEffect(() => {
        loadAll()
        const interval = setInterval(refreshStatus, 12000)
        return () => clearInterval(interval)
    }, [loadAll, refreshStatus])

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

    // Seat dot size (world units). Respect the organizer's chosen size from the
    // editor (canvas_data.seatRadius) so the picker matches the builder exactly;
    // only fall back to a spacing-derived size for legacy maps that never stored
    // one (guarantees no overlap either way).
    const activeSeatRadius = useMemo(() => {
        if (!activeSection || !mapData) return 6
        if (mapData.seat_radius && mapData.seat_radius > 0) return Number(mapData.seat_radius)
        const sec = mapData.sections.find(s => s.id === activeSection)
        return sec ? computeSeatRadius(sec.seats) : 6
    }, [activeSection, mapData])

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

    // Auto-fit ONLY on the first map load and on a real resize while still in the
    // overview — NEVER while zoomed into a section, and never on a data refresh.
    // Three things used to fight the buyer's view:
    //   1. lazy seat loads + the 12s status poll each mint a new mapData object
    //      (→ "I tap a section and it zooms out"; kick-out every 12s), and
    //   2. picking a seat grows the selection bar, which shrinks the flex map
    //      container → a stageSize change (→ "I pick a seat and it zooms out").
    // Keying on event_id + stage size skips (1); the activeSection guard skips (2)
    // and any other resize once the buyer has drilled into a section.
    const activeSectionRef = useRef<string | null>(null)
    useEffect(() => { activeSectionRef.current = activeSection }, [activeSection])
    const didInitialFitRef = useRef(false)
    const lastFitKeyRef = useRef('')
    useEffect(() => {
        if (!mapData) return
        const fitKey = `${mapData.event_id}:${Math.round(stageSize.width)}x${Math.round(stageSize.height)}`
        if (didInitialFitRef.current) {
            if (activeSectionRef.current !== null) return   // zoomed into a section → leave view alone
            if (fitKey === lastFitKeyRef.current) return    // data-only change in overview → keep view
        }
        didInitialFitRef.current = true
        lastFitKeyRef.current = fitKey
        fitOverview()
    }, [fitOverview, mapData, stageSize])

    // Zoom into a section. Fit to the SEATS' bounds, not the polygon — a section
    // outline is often far larger than its seated area (see the huge empty lower
    // two-thirds on dense maps), so fitting the polygon buries the seats up top.
    const zoomToSection = useCallback((section: MapSection) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        const extend = (x: number, y: number) => {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
        if (section.seats.length > 0) {
            for (const s of section.seats) extend(s.x, s.y)
        } else {
            const pts = section.polygon_points
            for (let i = 0; i < pts.length; i += 2) extend(pts[i], pts[i + 1])
        }
        if (!isFinite(minX)) return
        // Pad by a few seat-widths so edge seats + their labels aren't clipped.
        const r = section.seats.length > 0 ? computeSeatRadius(section.seats) : 20
        const pad = r * 3 + 24
        const w = maxX - minX + pad * 2
        const h = maxY - minY + pad * 2
        const scale = Math.min(stageSize.width / w, stageSize.height / h, 6)
        setView({
            scale,
            x: stageSize.width / 2 - (minX + (maxX - minX) / 2) * scale,
            y: stageSize.height / 2 - (minY + (maxY - minY) / 2) * scale,
        })
        setActiveSection(section.id)
    }, [stageSize])

    // ─── Interactions ────────────────────────────────────────────────────
    // Seated sections lazily load their seats, then zoom to them; GA zones open
    // the quantity sheet (no seats to load).
    const handleSectionTap = useCallback(async (section: MapSection) => {
        if (isGASection(section)) {
            setGaSection(section)
            setGaQty(1)
            return
        }
        await loadSection(section.id)
        // Zoom using the freshly-loaded section (geometryRef is updated synchronously
        // before remerge), so we fit the seats, not the polygon.
        const loaded = geometryRef.current?.sections.find((s: any) => s.id === section.id)
        zoomToSection(loaded ?? section)
    }, [loadSection, zoomToSection])

    const handleSeatTap = useCallback((seat: MapSeat) => {
        const supabase = createClient()
        const sid = sessionIdRef.current

        // Deselect FIRST — must run before the availability guard below. Once a
        // seat is selected we hold it server-side, so the next map poll returns
        // it as status 'held' (our OWN hold); if the guard ran first, tapping to
        // cancel would be rejected and the seat would be stuck selected.
        if (selectedSeatIds.includes(seat.id)) {
            setSelectedSeatIds(prev => prev.filter(id => id !== seat.id))
            // The last status poll returned this seat as 'held' (our OWN hold).
            // While selected, selectedSeatIds masked that; once deselected it would
            // render by its stale 'held' status = grey/taken until the next poll.
            // Optimistically drop it from the local taken set + remerge so it shows
            // available again instantly (we're releasing our own hold below).
            if (statusRef.current?.taken) {
                statusRef.current = {
                    ...statusRef.current,
                    taken: statusRef.current.taken.filter((t: any) => t.id !== seat.id),
                }
                remerge()
            }
            // .then() is required — the supabase builder is lazy, so `void rpc(...)`
            // never sent the request and the hold lingered until its TTL.
            supabase.rpc('release_seat_hold', { p_seat_id: seat.id, p_session_id: sid }).then(undefined, () => {})
            return
        }

        // Not selected yet → only selectable if actually available + priced.
        if (seat.status !== 'available' || !seat.tier_id) return

        const currentTier = selectedSeatIds.length > 0 ? allSeats.get(selectedSeatIds[0])?.tier_id : null
        if (currentTier && currentTier !== seat.tier_id) {
            toast({
                title: 'One price category per order',
                description: 'Finish this order first, or clear your selection to switch categories.',
            })
            return
        }
        if (selectedSeatIds.length >= maxPerOrder) {
            toast({ title: 'Limit reached', description: `Maximum of ${maxPerOrder} seats per order.` })
            return
        }

        // Optimistic select, then take a server-side hold; roll back if another
        // buyer beat us to it (hold_seat returns false when already held/taken).
        setSelectedSeatIds(prev => [...prev, seat.id])
        supabase.rpc('hold_seat', { p_seat_id: seat.id, p_session_id: sid }).then(({ data, error }) => {
            if (error || data !== true) {
                setSelectedSeatIds(prev => prev.filter(id => id !== seat.id))
                toast({ title: 'Seat just taken', description: `${seat.label} was grabbed by another buyer.` })
                refreshStatus()
            }
        })
    }, [selectedSeatIds, allSeats, toast, maxPerOrder, refreshStatus, remerge])

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
        continuingRef.current = true // keep holds alive — checkout releases + re-holds them
        setNavigating(true)
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', String(selectedSeats.length))
        params.set('tierId', selectedTierId)
        params.set('seatIds', selectedSeatIds.join(','))
        router.push(`/checkout?${params.toString()}`)
    }

    // GA checkout = the existing quantity flow (tier + quantity, NO seatIds);
    // tickets get seat_info = null, which the scanner already handles.
    const handleGAContinue = () => {
        if (!gaSection?.tier_id || gaQty < 1) return
        setNavigating(true)
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', String(gaQty))
        params.set('tierId', gaSection.tier_id)
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

    // Show seat numbers only once a dot is big enough on screen to fit the text.
    const showSeatLabels = activeSeatRadius * view.scale >= 11

    return (
        <div className="flex flex-col min-h-0 h-full gap-3 min-w-0">
            {/* Price legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 shrink-0">
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

            {/* Map canvas — flexes to fill the modal so the selection bar below
                stays visible without scrolling. Min height keeps it usable on
                short screens; the ResizeObserver feeds the real px height to the
                Konva stage. */}
            <div
                ref={containerRef}
                className="relative w-full flex-1 min-h-[240px] rounded-2xl border bg-white dark:bg-slate-100 overflow-hidden touch-none"
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
                                    onTap={() => !soldOut && handleSectionTap(section)}
                                />
                            )
                        })}

                        {/* Seats — only the active section's, drawn above polygons.
                            Radius comes from the section's real spacing; seat numbers
                            appear once the dots are big enough on screen to fit them. */}
                        {activeSectionData?.seats.map(seat => {
                            const isSel = selectedSeatIds.includes(seat.id)
                            const r = isSel ? activeSeatRadius * 1.15 : activeSeatRadius
                            return (
                                <Group key={seat.id} x={seat.x} y={seat.y}>
                                    <Circle
                                        radius={r}
                                        fill={seatFill(seat)}
                                        stroke="#ffffff"
                                        strokeWidth={Math.max(0.75, activeSeatRadius * (isSel ? 0.3 : 0.16))}
                                        opacity={seat.status === 'available' || isSel ? 1 : 0.5}
                                        shadowColor={isSel ? '#0f172a' : undefined}
                                        shadowBlur={isSel ? activeSeatRadius * 0.8 : 0}
                                        shadowOpacity={isSel ? 0.5 : 0}
                                        onClick={() => handleSeatTap(seat)}
                                        onTap={() => handleSeatTap(seat)}
                                        hitStrokeWidth={Math.max(8, activeSeatRadius)}
                                        perfectDrawEnabled={false}
                                        onMouseEnter={(e) => {
                                            const stage = e.target.getStage()
                                            const pos = stage?.getPointerPosition()
                                            if (pos) setHoveredSeat({ seat, screenX: pos.x, screenY: pos.y })
                                            const container = stage?.container()
                                            if (container) container.style.cursor = seat.status === 'available' || isSel ? 'pointer' : 'not-allowed'
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
                                    {showSeatLabels && (
                                        <Text
                                            text={String(seat.seat)}
                                            fontSize={activeSeatRadius}
                                            fontStyle="bold"
                                            fill={seat.status === 'available' || isSel ? '#ffffff' : '#9ca3af'}
                                            width={activeSeatRadius * 2}
                                            height={activeSeatRadius * 2}
                                            offsetX={activeSeatRadius}
                                            offsetY={activeSeatRadius}
                                            align="center"
                                            verticalAlign="middle"
                                            listening={false}
                                            perfectDrawEnabled={false}
                                        />
                                    )}
                                </Group>
                            )
                        })}
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

                {/* Loading a section's seats (Phase 2 lazy load) */}
                {loadingSectionId && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
                        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md border text-sm text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading seats…
                        </div>
                    </div>
                )}

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

            {/* GA quantity sheet — tapping a standing/GA zone buys by quantity */}
            {gaSection && (() => {
                const gaTier = gaSection.tier_id ? tierById.get(gaSection.tier_id) : null
                const gaMax = Math.max(1, Math.min(gaSection.available_count, maxPerOrder))
                const gaTotal = gaTier ? Number(gaTier.price) * gaQty : 0
                return (
                    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3 shrink-0">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold">{gaSection.label}</p>
                                <p className="text-sm text-muted-foreground">
                                    {gaTier ? `${gaTier.name} · ₱${Number(gaTier.price).toLocaleString()} each` : 'General admission'}
                                    {' · '}{gaSection.available_count} left
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    General admission — no assigned seat, first come first served.
                                </p>
                            </div>
                            <button
                                onClick={() => setGaSection(null)}
                                className="text-muted-foreground hover:text-foreground text-sm px-1"
                                aria-label="Close"
                            >✕</button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="outline" className="h-9 w-9"
                                    disabled={gaQty <= 1}
                                    onClick={() => setGaQty(q => Math.max(1, q - 1))}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-bold text-lg">{gaQty}</span>
                                <Button size="icon" variant="outline" className="h-9 w-9"
                                    disabled={gaQty >= gaMax}
                                    onClick={() => setGaQty(q => Math.min(gaMax, q + 1))}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="font-bold text-lg">₱{gaTotal.toLocaleString()}</div>
                                <Button onClick={handleGAContinue} disabled={navigating || !gaTier} className="h-11 px-6 font-semibold">
                                    {navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Selection bar — pinned (shrink-0) at the bottom of the flex column
                so "Continue" is always in view; no scrolling to reach it. */}
            <div className={cn(
                'rounded-2xl border p-4 transition-colors shrink-0',
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

/**
 * Pick a seat dot radius (world units) from the section's real seat spacing so
 * dots always have a gap — a fixed radius blobs up tightly-packed maps. Uses the
 * 10th percentile of nearest-neighbor distances (robust to a few outlier-tight
 * pairs) and leaves ~12% clearance between adjacent seats. Caps the O(n²) scan
 * by sampling for very large sections.
 */
function computeSeatRadius(seats: { x: number; y: number }[]): number {
    const n = seats.length
    if (n < 2) return 8
    const sampleStep = Math.max(1, Math.floor(n / 400))
    const nn: number[] = []
    for (let i = 0; i < n; i += sampleStep) {
        let best = Infinity
        for (let j = 0; j < n; j++) {
            if (i === j) continue
            const dx = seats[i].x - seats[j].x
            const dy = seats[i].y - seats[j].y
            const d2 = dx * dx + dy * dy
            if (d2 < best) best = d2
        }
        if (isFinite(best)) nn.push(Math.sqrt(best))
    }
    if (nn.length === 0) return 8
    nn.sort((a, b) => a - b)
    const spacing = nn[Math.floor(nn.length * 0.1)]
    return Math.max(3, Math.min(22, spacing * 0.44))
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
