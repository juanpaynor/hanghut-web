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
import { Loader2, Minus, Plus, RotateCcw, ArrowLeft, Armchair, Map as MapIcon, List, Sparkles, Shuffle, ArrowRight } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { sectionChannel } from '@/lib/seat-map/realtime'
import { useSeatHoldTimer, SeatHoldTimer } from '@/components/events/seat-hold-timer'
import type { PreviewBundle } from '@/lib/seat-map/preview-bundle'

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
    /** Longest run of free, unheld, same-priced seats in one physical row (status endpoint). */
    largest_block?: number
    /** Per price category inside the section (a section can mix prices via row overrides). */
    by_tier?: { tier_id: string; available_count: number; largest_block: number }[]
    /** False when none of the section's price categories is currently on sale. */
    on_sale?: boolean
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
    /** Organizer's choice: best-available sheet, hand-pick only, or both (default). */
    selection_mode?: 'best_available' | 'pick' | 'both'
    /** events.max_seats_per_order, authoritative from the status endpoint. */
    max_per_order?: number
}

interface SeatMapPickerProps {
    eventId: string
    /** Event's max tickets per order (events.max_seats_per_order); defaults to 10. */
    maxPerOrder?: number
    /**
     * Organizer preview: render THIS bundle (built from the draft) instead of
     * fetching the live map. No holds, no polling, no realtime, no checkout —
     * seat taps toggle locally so the organizer can feel the flow. Everything
     * else is the real picker, so what they see is what buyers get.
     */
    preview?: PreviewBundle | null
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

export function SeatMapPicker({ eventId, maxPerOrder = 10, preview = null }: SeatMapPickerProps) {
    const isPreview = !!preview
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
    // ── Camera ───────────────────────────────────────────────────────────
    // Every programmatic move (tap a section, back to overview, re-frame on
    // resize) is a short tween: the scale eases geometrically and the world
    // point under the stage centre eases linearly, so the target stays pinned
    // while the map "flies" to it. Wheel and drag stay instant and cancel any
    // tween in flight.
    type View = { scale: number; x: number; y: number }
    const viewRef = useRef(view)
    useEffect(() => { viewRef.current = view }, [view])
    const animRef = useRef<number | null>(null)
    const cancelCamera = useCallback(() => {
        if (animRef.current != null) { cancelAnimationFrame(animRef.current); animRef.current = null }
    }, [])
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const flyTo = useCallback((to: View, duration = 420) => {
        cancelCamera()
        const from = viewRef.current
        if (duration <= 0 || reducedMotion || !isFinite(from.scale) || from.scale <= 0) { setView(to); return }
        const W = stageSize.width, H = stageSize.height
        const c0 = { x: (W / 2 - from.x) / from.scale, y: (H / 2 - from.y) / from.scale }
        const c1 = { x: (W / 2 - to.x) / to.scale, y: (H / 2 - to.y) / to.scale }
        const ratio = to.scale / from.scale
        const start = performance.now()
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            const e = 1 - Math.pow(1 - t, 3)   // ease-out cubic
            const scale = from.scale * Math.pow(ratio, e)
            const cx = c0.x + (c1.x - c0.x) * e
            const cy = c0.y + (c1.y - c0.y) * e
            setView({ scale, x: W / 2 - cx * scale, y: H / 2 - cy * scale })
            if (t < 1) animRef.current = requestAnimationFrame(step)
            else animRef.current = null
        }
        animRef.current = requestAnimationFrame(step)
    }, [stageSize, cancelCamera, reducedMotion])
    useEffect(() => cancelCamera, [cancelCamera])

    // The section the buyer is "in": the sheet is open for it (best-available
    // or GA) even though no seats are on screen yet. The camera frames it, it
    // is drawn emphasised, and a resize (the sheet opening below the map)
    // re-frames IT — never the whole overview.
    const [focusSectionId, setFocusSectionId] = useState<string | null>(null)
    const focusSectionRef = useRef<string | null>(null)
    useEffect(() => { focusSectionRef.current = focusSectionId }, [focusSectionId])
    const [navigating, setNavigating] = useState(false)
    const [hoveredSeat, setHoveredSeat] = useState<{ seat: MapSeat; screenX: number; screenY: number } | null>(null)
    // GA (general admission) purchase sheet: tapping a GA zone picks a quantity,
    // not seats. gaSection is the zone being bought from.
    const [gaSection, setGaSection] = useState<MapSection | null>(null)
    const gaSectionRef = useRef<MapSection | null>(null)
    useEffect(() => { gaSectionRef.current = gaSection }, [gaSection])
    const [gaQty, setGaQty] = useState(1)

    // ── Best available ("buy by section") ────────────────────────────────
    // Party size is the first question; the map answers it (sections that can't
    // seat N together fade, price pills show the cheapest option for N).
    const [partySize, setPartySizeState] = useState(2)
    useEffect(() => {
        try {
            const saved = Number(sessionStorage.getItem(`hh_party_${eventId}`))
            if (saved >= 1 && saved <= 20) setPartySizeState(saved)
        } catch { /* private mode etc. */ }
    }, [eventId])
    const setPartySize = useCallback((n: number) => {
        setPartySizeState(n)
        try { sessionStorage.setItem(`hh_party_${eventId}`, String(n)) } catch { /* noop */ }
    }, [eventId])
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
    // The section sheet. `result` = seats the server picked AND holds for us.
    type AutoResult = { seats: { seat_id: string; row: string; seat: number; label: string }[]; together: string; split: number[] }
    const [autoSheet, setAutoSheet] = useState<{
        section: MapSection
        tierId: string | null
        qty: number
        phase: 'choose' | 'working' | 'result' | 'split' | 'gone'
        result?: AutoResult
        proposal?: AutoResult
        message?: string
    } | null>(null)
    const autoSheetRef = useRef(autoSheet)
    useEffect(() => { autoSheetRef.current = autoSheet }, [autoSheet])

    // Browsing-session id for seat holds. Persisted per-tab so checkout (same tab)
    // can release these holds right before assign_seats_to_intent takes its own —
    // a foreign-session hold would otherwise block the buyer's OWN checkout.
    const sessionIdRef = useRef('')
    // Mirrored into state as well: the hold countdown is a hook, and a ref
    // mutation would not re-render it into existence on first mount.
    const [sessionId, setSessionId] = useState<string | null>(null)
    useEffect(() => {
        let sid = sessionStorage.getItem('hh_seat_session')
        if (!sid) {
            sid = crypto.randomUUID()
            sessionStorage.setItem('hh_seat_session', sid)
        }
        sessionIdRef.current = sid
        setSessionId(sid)
    }, [])

    // Per-TAB tag used only to recognise and discard our own broadcast echoes.
    // Deliberately NOT the session id: that is the credential for releasing a
    // hold and must never go over a public channel. This confers nothing, and it
    // is per tab so two tabs of the same buyer still correctly inform each other.
    const originRef = useRef<string>('')
    if (!originRef.current && typeof crypto !== 'undefined') {
        originRef.current = crypto.randomUUID()
    }

    // Release held seats when the picker closes WITHOUT continuing to checkout
    // (abandoned holds would otherwise block other buyers for the 12-min TTL).
    const selectedIdsRef = useRef<string[]>([])
    useEffect(() => { selectedIdsRef.current = selectedSeatIds }, [selectedSeatIds])
    const continuingRef = useRef(false)
    useEffect(() => () => {
        if (isPreview || continuingRef.current || selectedIdsRef.current.length === 0) return
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
        const statusBySection = new Map<string, any>(
            (status?.sections ?? []).map((s: any) => [s.id as string, s])
        )
        return {
            ...geo,
            selection_mode: status?.selection_mode ?? 'both',
            max_per_order: status?.max_per_order ?? undefined,
            sections: (geo.sections ?? []).map((sec: any) => ({
                ...sec,
                available_count: statusBySection.get(sec.id)?.available_count ?? 0,
                largest_block: statusBySection.get(sec.id)?.largest_block ?? 0,
                by_tier: statusBySection.get(sec.id)?.by_tier ?? [],
                on_sale: statusBySection.get(sec.id)?.on_sale ?? true,
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
        if (preview) return preview.status
        try {
            const res = await fetch(`/api/seat-map/status?eventId=${eventId}`, { cache: 'no-store' })
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [eventId, preview])

    const fetchGeometry = useCallback(async (version: number): Promise<any | null> => {
        if (preview) return preview.geometry
        try {
            // Version-keyed URL → immutable CDN cache; a new save = new URL.
            const res = await fetch(`/api/seat-map/geometry?eventId=${eventId}&v=${version}`)
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [eventId, preview])

    const fetchSectionSeats = useCallback(async (sectionId: string, version: number): Promise<any[] | null> => {
        if (preview) return preview.sectionSeats[sectionId] ?? []
        try {
            const res = await fetch(`/api/seat-map/section?sectionId=${sectionId}&v=${version}`)
            if (!res.ok) return null
            return await res.json()
        } catch { return null }
    }, [preview])

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
        if (isPreview) return   // a draft has no live state to poll for
        const interval = setInterval(refreshStatus, 12000)
        return () => clearInterval(interval)
    }, [loadAll, refreshStatus, isPreview])

    // Live updates: booked seats grey out as other buyers complete payment
    // ── Live hold updates (Ably, per active section) ─────────────────────────
    // The postgres_changes subscription below covers `seats` status, which only
    // moves when a seat is BOOKED — the rarest event here. Holds are the frequent,
    // contended thing and produce no row change worth fanning out event-wide, so
    // they ride a per-section Ably channel instead.
    //
    // This is advisory. Every path stays correct if a message is lost, duplicated
    // or late: the 3s poll reconciles, and Postgres decides the winner at
    // UNIQUE(seat_id) regardless. So failures here are swallowed and the picker
    // simply refreshes at poll speed instead of instantly.
    useEffect(() => {
        if (!activeSection || isPreview) return   // overview shows counts, not individual seats
        let cancelled = false
        let realtime: EventSource | null = null

        void (async () => {
            try {
                // Native EventSource against Ably's SSE endpoint, NOT the Ably SDK.
                // The SDK ships prebuilt bundles that Next's SWC loader cannot
                // parse ("'super' keyword outside a method"), and we would be
                // pulling in a websocket client, presence, history and encryption
                // to receive a two-field message. EventSource costs no bundle,
                // reconnects on its own, and cannot publish even in principle —
                // so subscribe-only becomes a property of the transport rather
                // than only of the token's capability.
                const tokenRes = await fetch(`/api/seat-map/realtime-token?eventId=${eventId}`)
                if (!tokenRes.ok || cancelled) return
                const { token } = await tokenRes.json()
                if (!token || cancelled) return

                const channelName = sectionChannel(eventId, activeSection)
                const url = `https://realtime.ably.io/sse?v=1.2`
                    + `&channels=${encodeURIComponent(channelName)}`
                    + `&accessToken=${encodeURIComponent(token)}`
                realtime = new EventSource(url)

                const applySeat = (seatId: string, status: 'held' | 'available' | 'booked') => {
                    const prev = statusRef.current
                    if (!prev) return
                    const taken = (prev.taken ?? []).filter((t: any) => t.id !== seatId)
                    if (status !== 'available') taken.push({ id: seatId, status })
                    statusRef.current = { ...prev, taken }
                    remerge()
                }

                realtime.onmessage = (ev: MessageEvent) => {
                    try {
                        const envelope = JSON.parse(ev.data)
                        // Ably SSE wraps the message; `data` is the published
                        // payload, itself JSON-encoded.
                        const payload = typeof envelope.data === 'string'
                            ? JSON.parse(envelope.data)
                            : envelope.data
                        const id = payload?.seatId
                        if (!id) return

                        // Discard our OWN echo. Every publisher is also a
                        // subscriber, so taking a seat broadcasts "held" back to
                        // us. The previous check — "is it in my selection?" — was
                        // timing-dependent: unpick fast enough and the echo landed
                        // after the selection was gone, so we greyed out a seat we
                        // had just freed and could not pick it again.
                        if (payload.origin && payload.origin === originRef.current) return

                        if (envelope.name === 'held') {
                            applySeat(id, 'held')
                        } else if (envelope.name === 'released') {
                            applySeat(id, 'available')
                        } else if (envelope.name === 'booked') {
                            applySeat(id, 'booked')
                        }
                    } catch { /* malformed frame: the poll still reconciles */ }
                }
            } catch {
                /* advisory transport: fall back to the poll */
            }
        })()

        return () => {
            cancelled = true
            try { realtime?.close() } catch { /* noop */ }
        }
    }, [eventId, activeSection, remerge])

    useEffect(() => {
        if (isPreview) return
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
    }, [eventId, isPreview])

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

    const selectionMode = mapData?.selection_mode ?? 'both'
    const effectiveMaxPerOrder = mapData?.max_per_order ?? maxPerOrder
    useEffect(() => {
        if (partySize > effectiveMaxPerOrder) setPartySize(effectiveMaxPerOrder)
    }, [partySize, effectiveMaxPerOrder, setPartySize])

    // Price groups inside a seated section, cheapest first. A section with row
    // overrides can hold two prices; the sheet lets the buyer choose.
    type Offer = { tier: MapTier; available: number; largestBlock: number }
    const sectionOffers = useCallback((section: MapSection): Offer[] => {
        const rows = section.by_tier ?? []
        return rows
            .map(r => ({ tier: tierById.get(r.tier_id), available: r.available_count, largestBlock: r.largest_block }))
            .filter((o): o is Offer => !!o.tier)
            .sort((a, b) => Number(a.tier.price) - Number(b.tier.price))
    }, [tierById])

    // What the overview pill says for this section at the current party size.
    const sectionPill = useCallback((section: MapSection): { price: number; split: boolean } | null => {
        const offers = sectionOffers(section)
        const together = offers.find(o => o.largestBlock >= partySize)
        if (together) return { price: Number(together.tier.price), split: false }
        const anyFit = offers.find(o => o.available >= partySize)
        if (anyFit) return { price: Number(anyFit.tier.price), split: true }
        return null
    }, [sectionOffers, partySize])

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

    // Seats THIS buyer is holding, counted per section.
    //
    // get_event_seat_status takes no session id on purpose — it carries no user
    // context so the CDN can serve one shared copy during an on-sale. The cost is
    // that it subtracts EVERY live hold from available_count, including our own.
    // A section where the buyer holds the last seat therefore comes back as 0,
    // renders "Sold out", greys out, and stops accepting taps — locking them out
    // of a seat they are currently holding. Credit our own holds back locally,
    // where we know which ones are ours.
    const ownHeldBySection = useMemo(() => {
        const counts = new Map<string, number>()
        if (!mapData || selectedSeatIds.length === 0) return counts
        const mine = new Set(selectedSeatIds)
        mapData.sections.forEach(sec => {
            const n = sec.seats.reduce((acc, seat) => acc + (mine.has(seat.id) ? 1 : 0), 0)
            if (n > 0) counts.set(sec.id, n)
        })
        return counts
    }, [mapData, selectedSeatIds])

    const selectedSeats = selectedSeatIds.map(id => allSeats.get(id)).filter(Boolean) as MapSeat[]
    const selectedTierId = selectedSeats[0]?.tier_id ?? null
    const selectedTier = selectedTierId ? tierById.get(selectedTierId) : null
    const totalPrice = selectedTier ? Number(selectedTier.price) * selectedSeats.length : 0

    // Fit-to-content view for the overview. Fits the bounding box of the actual
    // sections (not the full canvas) — sections rarely fill the canvas, so fitting
    // canvas_width/height would render them as a tiny cluster in one corner.
    const fitOverview = useCallback((animate = true) => {
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
        flyTo({
            scale,
            x: (stageSize.width - contentW * scale) / 2 - minX * scale,
            y: (stageSize.height - contentH * scale) / 2 - minY * scale,
        }, animate ? 420 : 0)
        setActiveSection(null)
        // "All sections" with no sheet open = the buyer let go of that section.
        if (!autoSheetRef.current && !gaSectionRef.current) setFocusSectionId(null)
    }, [mapData, stageSize, flyTo])

    // Frame one section with room around it — the "I tapped this" camera. The
    // section fills roughly half the stage so its neighbours stay in view for
    // context; it never zooms OUT relative to the overview.
    const frameSection = useCallback((section: MapSection, animate = true) => {
        const pts = section.polygon_points
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let i = 0; i < pts.length; i += 2) {
            minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i])
            minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1])
        }
        if (!isFinite(minX)) return
        const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY)
        const scale = Math.max(
            viewRef.current.scale,
            Math.min(stageSize.width * 0.55 / w, stageSize.height * 0.6 / h, 4),
        )
        flyTo({
            scale,
            x: stageSize.width / 2 - (minX + w / 2) * scale,
            y: stageSize.height / 2 - (minY + h / 2) * scale,
        }, animate ? 420 : 0)
    }, [stageSize, flyTo])

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
            lastFitKeyRef.current = fitKey
            // The map just changed size (the section sheet opened or closed
            // below it). Keep the buyer's section in frame — this used to
            // re-fit the whole overview, which read as "I tapped a section
            // and the map shrank".
            const focused = focusSectionRef.current
                ? mapData.sections.find(s => s.id === focusSectionRef.current)
                : null
            if (focused) { frameSection(focused); return }
            fitOverview()
            return
        }
        didInitialFitRef.current = true
        lastFitKeyRef.current = fitKey
        fitOverview(false)
    }, [fitOverview, frameSection, mapData, stageSize])

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
        flyTo({
            scale,
            x: stageSize.width / 2 - (minX + (maxX - minX) / 2) * scale,
            y: stageSize.height / 2 - (minY + (maxY - minY) / 2) * scale,
        }, 480)
        setActiveSection(section.id)
    }, [stageSize, flyTo])

    // ─── Interactions ────────────────────────────────────────────────────
    // Seated sections lazily load their seats, then zoom to them; GA zones open
    // the quantity sheet (no seats to load).
    const openAutoSheet = useCallback((section: MapSection, tierId?: string | null) => {
        const offers = sectionOffers(section)
        const pill = sectionPill(section)
        const preferred = tierId
            ?? (offers.length === 1 ? offers[0].tier.id : null)
            ?? (pill ? (offers.find(o => Number(o.tier.price) === pill.price)?.tier.id ?? null) : null)
        const cap = Math.max(1, Math.min(effectiveMaxPerOrder, Math.max(...offers.map(o => o.available), 1)))
        setGaSection(null)
        setAutoSheet({ section, tierId: preferred, qty: Math.max(1, Math.min(partySize, cap)), phase: 'choose' })
        setFocusSectionId(section.id)
        frameSection(section)
        // Warm the seats so the result can zoom in instantly.
        void loadSection(section.id, true)
    }, [sectionOffers, sectionPill, effectiveMaxPerOrder, partySize, loadSection, frameSection])

    // Leaving a sheet without picking: drop the focus and ease back out to the
    // overview (unless the buyer is already zoomed into seats).
    const leaveSheet = useCallback(() => {
        setAutoSheet(null)
        setGaSection(null)
        setFocusSectionId(null)
        if (activeSectionRef.current === null) fitOverview()
    }, [fitOverview])

    const handleSectionTap = useCallback(async (section: MapSection) => {
        if (isGASection(section)) {
            setAutoSheet(null)
            setGaSection(section)
            setGaQty(1)
            setFocusSectionId(section.id)
            frameSection(section)
            return
        }
        if (selectionMode !== 'pick' && !isPreview) {
            openAutoSheet(section)
            return
        }
        await loadSection(section.id)
        // Zoom using the freshly-loaded section (geometryRef is updated synchronously
        // before remerge), so we fit the seats, not the polygon.
        const loaded = geometryRef.current?.sections.find((s: any) => s.id === section.id)
        zoomToSection(loaded ?? section)
    }, [loadSection, zoomToSection, selectionMode, openAutoSheet, isPreview, frameSection])

    // "Pick my own seats" from the sheet → the hand-pick flow, unchanged.
    const pickManually = useCallback(async (section: MapSection) => {
        setAutoSheet(null)
        await loadSection(section.id)
        const loaded = geometryRef.current?.sections.find((s: any) => s.id === section.id)
        zoomToSection(loaded ?? section)
    }, [loadSection, zoomToSection])

    // Seats with a hold request in flight. Rendered as pending so the tap feels
    // answered, WITHOUT claiming the seat is the buyer's before the server says
    // so. Doubles as the value fed to useSeatHoldTimer, which must not read a
    // missing hold as an expiry while one is still being written.
    const [pendingSeatIds, setPendingSeatIds] = useState<string[]>([])

    // Hold countdown. On expiry the server has already released the seats (every
    // availability check filters on expires_at > now()), so the UI's job is only
    // to stop showing a selection the buyer no longer owns.
    const handleHoldExpired = useCallback(() => {
        if (selectedIdsRef.current.length === 0) return
        setSelectedSeatIds([])
        setAutoSheet(prev => prev && prev.phase === 'result'
            ? { ...prev, phase: 'gone', result: undefined, message: 'Your seat hold expired — the seats are back on sale.' }
            : prev)
        void refreshStatus()
        toast({
            title: 'Seat hold expired',
            description: 'Your seats were released and are available to other buyers again. Please pick your seats once more.',
            variant: 'destructive',
        })
    }, [refreshStatus, toast])

    // Preview holds nothing server-side, so the timer must see NO selection —
    // fed a selection with no hold it would (rightly, for a buyer) call that an
    // expiry and clear the seats on the first tap.
    const { secondsLeft: holdSecondsLeft } = useSeatHoldTimer(
        isPreview ? null : sessionId,
        isPreview ? 0 : selectedSeatIds.length,
        isPreview ? undefined : handleHoldExpired,
        isPreview ? 0 : pendingSeatIds.length,
    )

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
            // Via the ROUTE, not the RPC directly. The raw RPC frees the hold in
            // Postgres but announces nothing, so every other buyer kept seeing the
            // seat as taken until their next poll — the release half of the pair
            // was silent. The route publishes 'released'.
            if (!isPreview) {
                void fetch('/api/seat-map/release', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sid, seatIds: [seat.id], origin: originRef.current }),
                }).catch(() => { /* advisory; the TTL and the poll both still cover us */ })
            }
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

        // Preview: nothing to hold — the seat is selected locally, same rules.
        if (isPreview) {
            setSelectedSeatIds(prev => prev.includes(seat.id) ? prev : [...prev, seat.id])
            return
        }

        // ── The tap is a REQUEST, not a state change. ────────────────────────
        // We do NOT select optimistically. Seat selection is inherently
        // CONTENDED — you may genuinely not get it — so guessing creates a
        // shadow copy of hold state that then has to be reconciled with the
        // server, and every reconciliation bug this system has had came from
        // exactly that: the phantom "your seats were released" on a first tap,
        // and a section reading "sold out" because of the buyer's own hold.
        //
        // Selecting only AFTER the server confirms means selectedSeatIds can
        // never describe a hold that does not exist. There is nothing left to
        // reconcile, so the race cannot occur rather than being defended against.
        //
        // The cost is one round trip before the seat fills in; the seat renders
        // as pending meanwhile, which reads as responsive and — unlike an
        // optimistic fill — is honest about the fact that it is not yours yet.
        if (pendingSeatIds.includes(seat.id)) return   // ignore double taps
        setPendingSeatIds(prev => [...prev, seat.id])

        void (async () => {
            try {
                const res = await fetch('/api/seat-map/hold', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ seatId: seat.id, sessionId: sid, origin: originRef.current }),
                })
                const data = await res.json().catch(() => null)

                if (!res.ok || !data?.held) {
                    // hold_seat returns false for "already held" AND for "at the
                    // per-order cap" — both mean the buyer did not get it.
                    toast({ title: 'Seat just taken', description: `${seat.label} was grabbed by another buyer.` })
                    refreshStatus()
                    return
                }
                setSelectedSeatIds(prev => prev.includes(seat.id) ? prev : [...prev, seat.id])
            } catch {
                toast({ title: "Couldn't hold that seat", description: 'Check your connection and try again.' })
            } finally {
                setPendingSeatIds(prev => prev.filter(id => id !== seat.id))
            }
        })()
    }, [selectedSeatIds, pendingSeatIds, allSeats, toast, maxPerOrder, refreshStatus, remerge, isPreview])

    const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault()
        cancelCamera()
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
    }, [view, cancelCamera])

    const zoomButton = useCallback((factor: number) => {
        const center = { x: stageSize.width / 2, y: stageSize.height / 2 }
        const newScale = Math.max(0.2, Math.min(5, view.scale * factor))
        const worldPos = { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale }
        flyTo({
            scale: newScale,
            x: center.x - worldPos.x * newScale,
            y: center.y - worldPos.y * newScale,
        }, 220)
    }, [view, stageSize, flyTo])

    // Ask the server for the best N seats in a section and hold them. From here
    // on it is the hand-picked flow: the seats land in selectedSeatIds (same
    // session, same timer, same release-on-close, same checkout URL).
    const requestBestAvailable = useCallback(async (allowSplit: boolean, exclude?: string[]) => {
        const sheet = autoSheetRef.current
        if (!sheet || !sheet.tierId) return
        const sid = sessionIdRef.current
        setAutoSheet(prev => prev ? { ...prev, phase: 'working' } : prev)

        // Hand-picked seats from before would fight the one-tier rule and the
        // cap; a best-available request starts from a clean selection.
        const previous = selectedIdsRef.current
        if (previous.length > 0) {
            setSelectedSeatIds([])
            try {
                await fetch('/api/seat-map/release', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sid, seatIds: previous, origin: originRef.current }),
                })
            } catch { /* TTL backstops it */ }
        }

        try {
            const res = await fetch('/api/seat-map/best-available', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId, sectionId: sheet.section.id, tierId: sheet.tierId, quantity: sheet.qty,
                    sessionId: sid, allowSplit, exclude: exclude && exclude.length > 0 ? exclude : undefined,
                    origin: originRef.current,
                }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok || !data) throw new Error('bad response')

            if (data.ok) {
                const result: AutoResult = { seats: data.seats ?? [], together: data.together, split: data.split ?? [] }
                const ids = result.seats.map(x => x.seat_id)
                // Our own holds come back as 'held' from the next status poll —
                // selectedSeatIds masks that, same as hand-picked seats.
                setSelectedSeatIds(ids)
                setAutoSheet(prev => prev ? { ...prev, phase: 'result', result, proposal: undefined } : prev)
                await loadSection(sheet.section.id)
                const loaded = geometryRef.current?.sections.find((x: any) => x.id === sheet.section.id)
                if (loaded) zoomToSection(loaded)
                return
            }

            switch (data.code) {
                case 'SPLIT_REQUIRED': {
                    const pr = data.proposal
                    const proposal: AutoResult | undefined = pr?.ok
                        ? { seats: pr.seats ?? [], together: pr.together, split: pr.split ?? [] }
                        : undefined
                    setAutoSheet(prev => prev ? { ...prev, phase: proposal ? 'split' : 'gone', proposal, message: proposal ? undefined : 'Not enough seats left in this section.' } : prev)
                    return
                }
                case 'NOT_ENOUGH':
                    void refreshStatus()
                    setAutoSheet(prev => prev ? { ...prev, phase: 'gone', message: 'Those seats just went to another buyer.' } : prev)
                    return
                case 'MAX_PER_ORDER':
                    setAutoSheet(prev => prev ? { ...prev, phase: 'choose', qty: Math.max(1, Math.min(prev.qty, Number(data.max) || 1)) } : prev)
                    toast({ title: 'Limit reached', description: `Maximum of ${data.max ?? effectiveMaxPerOrder} seats per order.` })
                    return
                case 'SECTION_NOT_ON_SALE':
                case 'EVENT_NOT_ON_SALE':
                    setAutoSheet(prev => prev ? { ...prev, phase: 'gone', message: 'Tickets for this section are not on sale right now.' } : prev)
                    return
                case 'AUTO_DISABLED':
                    setAutoSheet(null)
                    void pickManually(sheet.section)
                    return
                default:
                    throw new Error(data.code || 'unknown')
            }
        } catch {
            setAutoSheet(prev => prev ? { ...prev, phase: 'choose' } : prev)
            toast({ title: "Couldn't get seats", description: 'Check your connection and try again.' })
        }
    }, [eventId, loadSection, zoomToSection, refreshStatus, toast, effectiveMaxPerOrder, pickManually])

    const handleContinue = () => {
        if (!selectedTierId || selectedSeats.length === 0) return
        if (isPreview) {
            toast({ title: 'This is a preview', description: `Buyers would continue to checkout with ${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} here.` })
            return
        }
        continuingRef.current = true // keep holds alive — checkout releases + re-holds them
        setNavigating(true)
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', String(selectedSeats.length))
        params.set('tierId', selectedTierId)
        params.set('seatIds', selectedSeatIds.join(','))
        // Tell checkout how the seats sit so its summary can say "together" /
        // "2 + 2" without re-deriving it.
        const r = autoSheetRef.current?.result
        if (r && r.seats.length === selectedSeatIds.length) {
            params.set('together', r.together)
            if (r.split.length > 1) params.set('split', r.split.join(','))
        }
        router.push(`/checkout?${params.toString()}`)
    }

    // GA checkout = the existing quantity flow (tier + quantity, NO seatIds);
    // tickets get seat_info = null, which the scanner already handles.
    const handleGAContinue = () => {
        if (!gaSection?.tier_id || gaQty < 1) return
        if (isPreview) {
            toast({ title: 'This is a preview', description: `Buyers would continue to checkout with ${gaQty} ticket${gaQty > 1 ? 's' : ''} here.` })
            return
        }
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

    // Seat dot fill by status/selection. A seat with a hold request in flight
    // takes the SELECTED colour but stays dimmed and un-grown below — it reads as
    // "claiming this", not as "yours", because it may still be lost to another
    // buyer. Showing it as fully selected would be the optimistic lie all over
    // again, just in paint instead of state.
    const seatFill = (seat: MapSeat) => {
        if (selectedSeatIds.includes(seat.id) || pendingSeatIds.includes(seat.id)) return SELECTED_COLOR
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
    // A section sheet (best-available or GA) is open below the map.
    const sheetOpen = !!autoSheet || !!gaSection

    return (
        <div className="flex flex-col min-h-0 h-full gap-3 min-w-0">
            {isPreview && (
                <div className="shrink-0 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-1.5 text-xs dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="font-semibold uppercase tracking-wide">Preview</span>
                    <span>
                        {preview?.source === 'draft' ? 'Your unpublished draft, as buyers would see it.' : 'The published map, as buyers see it.'}
                        {' '}Seats can be tapped but nothing is held; best-available picks run only on the published map.
                    </span>
                </div>
            )}
            {/* Party size + view toggle — the first question, then the map answers it */}
            {selectionMode !== 'pick' && (
                <div className="flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Tickets</span>
                        <div className="inline-flex items-center rounded-full border bg-background">
                            <button type="button" aria-label="Fewer tickets" disabled={partySize <= 1}
                                onClick={() => setPartySize(Math.max(1, partySize - 1))}
                                className="h-8 w-8 flex items-center justify-center rounded-l-full hover:bg-muted disabled:opacity-40">
                                <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold tabular-nums">{partySize}</span>
                            <button type="button" aria-label="More tickets" disabled={partySize >= effectiveMaxPerOrder}
                                onClick={() => setPartySize(Math.min(effectiveMaxPerOrder, partySize + 1))}
                                className="h-8 w-8 flex items-center justify-center rounded-r-full hover:bg-muted disabled:opacity-40">
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="inline-flex rounded-full border bg-background p-0.5">
                        <button type="button" onClick={() => setViewMode('map')}
                            className={cn('h-7 px-3 rounded-full text-xs font-medium flex items-center gap-1.5', viewMode === 'map' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                            <MapIcon className="h-3.5 w-3.5" /> Map
                        </button>
                        <button type="button" onClick={() => setViewMode('list')}
                            className={cn('h-7 px-3 rounded-full text-xs font-medium flex items-center gap-1.5', viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                            <List className="h-3.5 w-3.5" /> List
                        </button>
                    </div>
                </div>
            )}

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
            {viewMode === 'list' && selectionMode !== 'pick' && (() => {
                type Row = { section: MapSection; offer: Offer; together: boolean }
                const rows: Row[] = []
                for (const section of mapData.sections) {
                    if (isGASection(section)) continue
                    for (const offer of sectionOffers(section)) {
                        if (offer.available < partySize) continue
                        rows.push({ section, offer, together: offer.largestBlock >= partySize })
                    }
                }
                rows.sort((a, b) => Number(a.together) !== Number(b.together)
                    ? Number(b.together) - Number(a.together)
                    : Number(a.offer.tier.price) - Number(b.offer.tier.price))
                const firstSplit = rows.findIndex(r => !r.together)
                return (
                    <div className="flex-1 min-h-[240px] overflow-y-auto rounded-2xl border bg-background divide-y">
                        {rows.length === 0 && (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                Nothing left for {partySize} {partySize === 1 ? 'ticket' : 'tickets'}. Try a smaller party.
                            </div>
                        )}
                        {rows.map((r, i) => (
                            <div key={`${r.section.id}:${r.offer.tier.id}`}>
                                {i === firstSplit && firstSplit > 0 && (
                                    <div className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">Split seats only</div>
                                )}
                                <button type="button" onClick={() => openAutoSheet(r.section, r.offer.tier.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tierColors.get(r.offer.tier.id) }} />
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-semibold truncate">{r.section.label}
                                            {sectionOffers(r.section).length > 1 && <span className="font-normal text-muted-foreground"> · {r.offer.tier.name}</span>}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {r.together ? `${partySize} together` : `split only`} · {r.offer.available} left
                                        </span>
                                    </span>
                                    <span className="text-right shrink-0">
                                        <span className="block font-bold tabular-nums">₱{Number(r.offer.tier.price).toLocaleString()}</span>
                                        <span className="block text-[11px] text-muted-foreground">each</span>
                                    </span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            </div>
                        ))}
                    </div>
                )
            })()}

            <div
                ref={containerRef}
                className={cn('relative w-full flex-1 min-h-[240px] rounded-2xl border bg-white dark:bg-slate-100 overflow-hidden touch-none',
                    viewMode === 'list' && selectionMode !== 'pick' && 'hidden')}
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
                    onDragStart={cancelCamera}
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
                            // Our own holds are ours to take back, so they count as available.
                            const availableCount =
                                section.available_count + (ownHeldBySection.get(section.id) ?? 0)
                            const soldOut = availableCount === 0
                            const center = sectionCenter(section.polygon_points)
                            const ga = isGASection(section)
                            const pill = !ga && selectionMode !== 'pick' ? sectionPill(section) : null
                            const cantSeatParty = !ga && selectionMode !== 'pick' && !soldOut && availableCount < partySize
                            return (
                                <SectionShape
                                    key={section.id}
                                    section={section}
                                    fill={sectionFill(section)}
                                    isActive={isActive}
                                    soldOut={soldOut}
                                    availableCount={availableCount}
                                    center={center}
                                    showLabel={!activeSection || isActive}
                                    pill={pill ? `₱${pill.price.toLocaleString()}${pill.split ? ' · split' : ''}` : (cantSeatParty ? `Not for ${partySize}` : null)}
                                    dimmed={cantSeatParty || (!!pill && pill.split)}
                                    focused={focusSectionId === section.id && (sheetOpen || isActive)}
                                    faded={sheetOpen && !!focusSectionId && focusSectionId !== section.id && !activeSection}
                                    onTap={() => !soldOut && handleSectionTap(section)}
                                />
                            )
                        })}

                        {/* Seats — only the active section's, drawn above polygons.
                            Radius comes from the section's real spacing; seat numbers
                            appear once the dots are big enough on screen to fit them. */}
                        {activeSectionData?.seats.map(seat => {
                            const isSel = selectedSeatIds.includes(seat.id)
                            const isPending = pendingSeatIds.includes(seat.id)
                            const r = isSel ? activeSeatRadius * 1.15 : activeSeatRadius
                            return (
                                <Group key={seat.id} x={seat.x} y={seat.y}>
                                    <Circle
                                        radius={r}
                                        fill={seatFill(seat)}
                                        stroke="#ffffff"
                                        strokeWidth={Math.max(0.75, activeSeatRadius * (isSel ? 0.3 : 0.16))}
                                        opacity={isPending ? 0.55 : (seat.status === 'available' || isSel ? 1 : 0.5)}
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
                                            if (container) container.style.cursor = isPending ? 'progress' : (seat.status === 'available' || isSel ? 'pointer' : 'not-allowed')
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
                    <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={() => fitOverview()}>
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>

                {activeSection && (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-3 left-3 shadow-sm"
                        onClick={() => fitOverview()}
                    >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                        All sections
                    </Button>
                )}

                {!activeSection && !autoSheet && !gaSection && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-sm pointer-events-none">
                        {selectionMode === 'pick' ? 'Tap a section to pick seats' : `Tap a section for the best ${partySize} ${partySize === 1 ? 'seat' : 'seats'}`}
                    </div>
                )}
            </div>

            {/* Best-available sheet — tap a seated section, choose how many, we pick */}
            {autoSheet && (() => {
                const sh = autoSheet
                const offers = sectionOffers(sh.section)
                const offer = offers.find(o => o.tier.id === sh.tierId) ?? null
                const capForOffer = offer ? Math.max(1, Math.min(offer.available, effectiveMaxPerOrder)) : 1
                const total = offer ? Number(offer.tier.price) * sh.qty : 0
                const willSplit = !!offer && sh.qty > offer.largestBlock
                const groupByRow = (r: AutoResult) => {
                    const m = new Map<string, number[]>()
                    r.seats.forEach(x => { const a = m.get(x.row) ?? []; a.push(x.seat); m.set(x.row, a) })
                    return [...m.entries()].map(([row, nums]) => `Row ${row} · ${nums.length === 1 ? 'seat' : 'seats'} ${nums.sort((a, b) => a - b).join(', ')}`)
                }
                const togetherCopy = (r: AutoResult) =>
                    r.together === 'row' ? 'Seats are together'
                    : r.together === 'split_row' ? `Same row, in ${r.split.join(' + ')}`
                    : r.together === 'stacked' ? `${r.split.join(' + ')}, one row in front of the other`
                    : 'Best seats available, not together'
                const close = leaveSheet
                return (
                    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3 shrink-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold">{sh.section.label}</p>
                                {sh.phase === 'choose' && offer && (
                                    <p className="text-sm text-muted-foreground">
                                        {offer.available} left · {offer.largestBlock >= 2 ? `up to ${Math.min(offer.largestBlock, effectiveMaxPerOrder)} together` : 'single seats only'}
                                    </p>
                                )}
                                {sh.phase === 'result' && sh.result && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" />{togetherCopy(sh.result)}</p>
                                )}
                            </div>
                            <button onClick={close} className="text-muted-foreground hover:text-foreground text-sm px-1" aria-label="Close">✕</button>
                        </div>

                        {sh.phase === 'choose' && (
                            <>
                                {offers.length > 1 && (
                                    <div className="space-y-1.5">
                                        {offers.map(o => (
                                            <button key={o.tier.id} type="button" onClick={() => setAutoSheet(prev => prev ? { ...prev, tierId: o.tier.id, qty: Math.max(1, Math.min(prev.qty, Math.min(o.available, effectiveMaxPerOrder))) } : prev)}
                                                className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm text-left',
                                                    o.tier.id === sh.tierId ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/40')}>
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tierColors.get(o.tier.id) }} />
                                                    <span className="truncate">{o.tier.name}</span>
                                                    <span className="text-xs text-muted-foreground shrink-0">{o.available} left</span>
                                                </span>
                                                <span className="font-semibold tabular-nums">₱{Number(o.tier.price).toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!offer && <p className="text-sm text-muted-foreground">This section has no tickets on sale.</p>}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Button size="icon" variant="outline" className="h-9 w-9" disabled={sh.qty <= 1}
                                            onClick={() => setAutoSheet(prev => prev ? { ...prev, qty: Math.max(1, prev.qty - 1) } : prev)}>
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className="w-8 text-center font-bold text-lg tabular-nums">{sh.qty}</span>
                                        <Button size="icon" variant="outline" className="h-9 w-9" disabled={!offer || sh.qty >= capForOffer}
                                            onClick={() => setAutoSheet(prev => prev ? { ...prev, qty: Math.min(capForOffer, prev.qty + 1) } : prev)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="font-bold text-lg tabular-nums">₱{total.toLocaleString()}</div>
                                </div>
                                <Button className="w-full h-11 font-semibold" disabled={!offer || navigating}
                                    onClick={() => { setPartySize(sh.qty); void requestBestAvailable(false) }}>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Get {sh.qty} best {sh.qty === 1 ? 'seat' : 'seats'}{willSplit ? ' (may be split)' : ''}
                                </Button>
                                {selectionMode === 'both' && (
                                    <button type="button" onClick={() => void pickManually(sh.section)}
                                        className="block w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
                                        Pick my own seats instead
                                    </button>
                                )}
                            </>
                        )}

                        {sh.phase === 'working' && (
                            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Finding your seats…
                            </div>
                        )}

                        {sh.phase === 'result' && sh.result && offer && (
                            <>
                                <SeatHoldTimer secondsLeft={holdSecondsLeft} />
                                <div className="rounded-xl bg-background border p-3 space-y-1">
                                    {groupByRow(sh.result).map(line => (
                                        <p key={line} className="text-sm font-semibold">{line}</p>
                                    ))}
                                    <p className="text-xs text-muted-foreground">{offer.tier.name} · ₱{Number(offer.tier.price).toLocaleString()} each</p>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-bold text-lg tabular-nums">₱{total.toLocaleString()}</div>
                                    <Button onClick={handleContinue} disabled={navigating || selectedSeatIds.length !== sh.qty} className="h-11 px-6 font-semibold">
                                        {navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue to checkout'}
                                    </Button>
                                </div>
                                <div className="flex items-center justify-center gap-4 text-sm">
                                    <button type="button" onClick={() => void requestBestAvailable(sh.result?.together !== 'row', sh.result?.seats.map(x => x.seat_id))}
                                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground flex items-center gap-1">
                                        <Shuffle className="h-3.5 w-3.5" /> Try different seats
                                    </button>
                                    {selectionMode === 'both' && (
                                        <button type="button" onClick={close}
                                            className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                                            Adjust on the map
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        {sh.phase === 'split' && sh.proposal && (
                            <>
                                <p className="text-sm font-medium">We can&apos;t seat {sh.qty} together in this section.</p>
                                <div className="rounded-xl bg-background border p-3 space-y-1">
                                    <p className="text-xs text-muted-foreground">{togetherCopy(sh.proposal)}</p>
                                    {groupByRow(sh.proposal).map(line => (
                                        <p key={line} className="text-sm font-semibold">{line}</p>
                                    ))}
                                </div>
                                <Button className="w-full h-11 font-semibold" onClick={() => void requestBestAvailable(true)} disabled={navigating}>
                                    Take these seats · ₱{total.toLocaleString()}
                                </Button>
                                <div className="flex items-center justify-center gap-4 text-sm">
                                    <button type="button" onClick={() => setAutoSheet(prev => prev ? { ...prev, phase: 'choose', proposal: undefined } : prev)}
                                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground">Change quantity</button>
                                    <button type="button" onClick={close}
                                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground">Try another section</button>
                                </div>
                            </>
                        )}

                        {sh.phase === 'gone' && (
                            <>
                                <p className="text-sm font-medium">{sh.message ?? 'Those seats are no longer available.'}</p>
                                <div className="flex items-center justify-center gap-4 text-sm">
                                    <button type="button" onClick={() => { void refreshStatus(); setAutoSheet(prev => prev ? { ...prev, phase: 'choose', message: undefined } : prev) }}
                                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground">Try again</button>
                                    <button type="button" onClick={close}
                                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground">Try another section</button>
                                </div>
                            </>
                        )}
                    </div>
                )
            })()}

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
                                onClick={leaveSheet}
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
                so "Continue" is always in view; no scrolling to reach it. Hidden
                while the best-available sheet is open — it carries its own. */}
            {!autoSheet && <div className={cn(
                'rounded-2xl border p-4 transition-colors shrink-0',
                selectedSeats.length > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/20'
            )}>
                {selectedSeats.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center">
                        No seats selected yet
                    </p>
                ) : (
                    <div className="space-y-3">
                        <SeatHoldTimer secondsLeft={holdSecondsLeft} />
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
            </div>}
        </div>
    )
}

// ─── Section polygon + label ────────────────────────────────────────────────

function SectionShape({
    section,
    fill,
    isActive,
    soldOut,
    availableCount,
    center,
    showLabel,
    pill = null,
    dimmed = false,
    focused = false,
    faded = false,
    onTap,
}: {
    section: MapSection
    fill: string
    isActive: boolean
    soldOut: boolean
    /** available_count with the buyer's OWN holds credited back — not section.available_count. */
    availableCount: number
    center: { x: number; y: number }
    showLabel: boolean
    /** Price pill for the current party size ("₱1,800", "₱1,800 · split") or a reason. */
    pill?: string | null
    /** Can't seat the party together — draw faded but keep it tappable. */
    dimmed?: boolean
    /** The sheet is open for this section — outlined and lifted. */
    focused?: boolean
    /** Another section has the focus — recede so the focused one reads. */
    faded?: boolean
    onTap: () => void
}) {
    return (
        <Group opacity={faded ? 0.38 : 1}>
            <Line
                points={section.polygon_points}
                closed
                fill={soldOut ? '#e5e7eb' : fill + (isActive ? '30' : dimmed ? '40' : focused ? 'cc' : '99')}
                stroke={focused ? '#0f172a' : soldOut ? '#9ca3af' : fill}
                strokeWidth={focused ? 3 : isActive ? 2.5 : 1.5}
                shadowColor={focused ? '#0f172a' : undefined}
                shadowBlur={focused ? 18 : 0}
                shadowOpacity={focused ? 0.35 : 0}
                shadowForStrokeEnabled={false}
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
                        text={soldOut ? (section.on_sale === false ? 'Not on sale' : 'Sold out') : `${availableCount} left`}
                        fontSize={11}
                        fill="#64748b"
                        listening={false}
                        perfectDrawEnabled={false}
                    />
                    {!soldOut && pill && (
                        <Text
                            x={center.x - 70}
                            y={center.y + 18}
                            width={140}
                            align="center"
                            text={pill}
                            fontSize={12}
                            fontStyle="bold"
                            fill={dimmed ? '#94a3b8' : '#0f172a'}
                            listening={false}
                            perfectDrawEnabled={false}
                        />
                    )}
                </>
            )}
        </Group>
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
