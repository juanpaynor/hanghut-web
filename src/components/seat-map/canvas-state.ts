'use client'

import { useReducer, useCallback, useRef, useEffect } from 'react'
import type {
  CanvasState,
  CanvasTool,
  SectionData,
  SeatData,
  SeatStatus,
  BackgroundShape,
  HistoryEntry,
  SeatShape,
} from './types'

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Bounding box of a section from its polygon points (falls back to seats). */
function sectionBounds(section: SectionData) {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < section.polygonPoints.length; i += 2) {
    xs.push(section.polygonPoints[i]); ys.push(section.polygonPoints[i + 1])
  }
  for (const s of section.seats) { xs.push(s.x); ys.push(s.y) }
  if (xs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

/**
 * Clone a section with fresh UUIDs for the section and EVERY seat (canvas id = DB
 * id, so reused ids would collide on save). Offsets a plain duplicate to the
 * lower-right; for a mirror, reflects geometry across the section's vertical axis
 * and drops the copy to the right, then renumbers each row left→right so it reads
 * naturally.
 */
function cloneSectionWithNewIds(section: SectionData, opts: { mirror: boolean }): SectionData {
  const b = sectionBounds(section)
  const shift = b.w + 40
  const reflectX = (x: number) => opts.mirror ? (2 * b.cx - x) + shift : x + 40
  const offY = (y: number) => opts.mirror ? y : y + 40

  const polygonPoints = section.polygonPoints.map((v, i) => (i % 2 === 0 ? reflectX(v) : offY(v)))

  let seats: SeatData[] = section.seats.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    x: reflectX(s.x),
    y: offY(s.y),
  }))

  // Mirror: renumber each row left→right so seat 1 starts on the left again.
  if (opts.mirror) {
    const byRow = new Map<string, SeatData[]>()
    for (const s of seats) { const a = byRow.get(s.rowLabel) ?? []; a.push(s); byRow.set(s.rowLabel, a) }
    for (const rowSeats of byRow.values()) {
      rowSeats.sort((a, b) => a.x - b.x)
      rowSeats.forEach((s, i) => { s.seatNumber = i + 1; s.label = `${s.rowLabel}${i + 1}` })
    }
  }

  let arcConfig = section.arcConfig
  if (arcConfig) {
    arcConfig = opts.mirror
      ? { ...arcConfig, cx: (2 * b.cx - arcConfig.cx) + shift, startAngle: 180 - arcConfig.endAngle, endAngle: 180 - arcConfig.startAngle }
      : { ...arcConfig, cx: arcConfig.cx + 40, cy: arcConfig.cy + 40 }
  }

  return {
    ...section,
    id: crypto.randomUUID(),
    label: `${section.label} copy`,
    polygonPoints,
    seats,
    arcConfig,
  }
}

/**
 * Reposition seats onto a single clean line and space them evenly.
 *  - 'straighten': fit to the seats' best-fit (PCA principal) axis, so an
 *    intentionally diagonal row stays diagonal but becomes perfectly straight.
 *  - 'flat': force the dominant axis (horizontal if wider than tall, else
 *    vertical) so a row meant to be dead-level snaps level.
 * In both cases the perpendicular wobble is removed and seats are distributed
 * at equal intervals between the two extreme points, preserving their order.
 */
function alignSeatsToLine(
  pts: { id: string; x: number; y: number }[],
  mode: 'straighten' | 'flat'
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  const n = pts.length
  if (n < 2) return out

  const mx = pts.reduce((a, p) => a + p.x, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n

  let dx: number, dy: number
  if (mode === 'flat') {
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y))
    if (maxX - minX >= maxY - minY) { dx = 1; dy = 0 } else { dx = 0; dy = 1 }
  } else {
    // PCA principal axis via covariance eigen-direction (handles vertical rows)
    let sxx = 0, syy = 0, sxy = 0
    for (const p of pts) {
      const ox = p.x - mx, oy = p.y - my
      sxx += ox * ox; syy += oy * oy; sxy += ox * oy
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    dx = Math.cos(theta); dy = Math.sin(theta)
  }

  // Project each point onto the axis (signed distance from centroid)
  const proj = pts.map((p) => ({ id: p.id, t: (p.x - mx) * dx + (p.y - my) * dy }))
  const ts = proj.map((p) => p.t)
  const tMin = Math.min(...ts), tMax = Math.max(...ts)
  const ordered = [...proj].sort((a, b) => a.t - b.t)
  const span = tMax - tMin

  ordered.forEach((p, i) => {
    const t = n === 1 ? 0 : tMin + (span * i) / (n - 1)
    out.set(p.id, { x: mx + t * dx, y: my + t * dy })
  })
  return out
}

/** Next row label: numeric rows increment as numbers, alpha rows as A→B…Z→AA. */
function incrementRowLabel(label: string): string {
  if (/^\d+$/.test(label)) return String(Number(label) + 1)
  const arr = (label || 'A').toUpperCase().split('')
  let i = arr.length - 1
  let carry = true
  while (i >= 0 && carry) {
    if (arr[i] === 'Z') { arr[i] = 'A'; i-- } else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); carry = false }
  }
  if (carry) arr.unshift('A')
  return arr.join('')
}

// ─── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_TOOL'; tool: CanvasTool }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_PAN'; offset: { x: number; y: number } }
  | { type: 'ADD_SECTION'; section: SectionData }
  | { type: 'UPDATE_SECTION'; id: string; updates: Partial<SectionData> }
  | { type: 'UPDATE_SECTIONS'; ids: string[]; updates: Partial<SectionData> }
  | { type: 'DELETE_SECTION'; id: string }
  | { type: 'DELETE_SECTIONS'; ids: string[] }
  | { type: 'ADD_SHAPE'; shape: BackgroundShape }
  | { type: 'UPDATE_SHAPE'; id: string; updates: Partial<BackgroundShape> }
  | { type: 'DELETE_SHAPE'; id: string }
  | { type: 'SELECT'; ids: string[] }
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'SELECT_SEAT'; seatId: string | null }
  | { type: 'SELECT_SEATS'; seatIds: string[] }
  | { type: 'TOGGLE_SELECT_SEAT'; seatId: string }
  | { type: 'DESELECT_ALL' }
  | { type: 'SET_DRAWING_POINTS'; points: number[] }
  | { type: 'ADD_DRAWING_POINT'; x: number; y: number }
  | { type: 'SET_IS_DRAWING'; isDrawing: boolean }
  | { type: 'LOAD_CANVAS'; sections: SectionData[]; backgroundShapes: BackgroundShape[]; width?: number; height?: number; seatRadius?: number; seatShape?: SeatShape }
  | { type: 'SET_DROP_ROW'; row: string }
  | { type: 'SET_DROP_SEAT_NUMBER'; num: number }
  | { type: 'DELETE_SEAT'; sectionId: string; seatId: string }
  | { type: 'SET_SEAT_RADIUS'; radius: number }
  | { type: 'SET_SEAT_SHAPE'; shape: SeatShape }
  | { type: 'SET_DRAG_SEAT_START'; point: { x: number; y: number } | null }
  | { type: 'DELETE_SEATS'; seatIds: string[] }
  | { type: 'ADD_SEATS'; seats: { sectionId: string; seat: SeatData }[] }
  | { type: 'ASSIGN_SEATS_TIER'; seatIds: string[]; tierId: string | null }
  | { type: 'RENUMBER_SEATS'; sectionId: string; seatIds: string[]; startRow: string; startNum: number; mode?: 'row' | 'grid' }
  | { type: 'MOVE_SEAT'; sectionId: string; seatId: string; x: number; y: number }
  | { type: 'MOVE_SEATS'; seatIds: string[]; dx: number; dy: number }
  | { type: 'SET_SEAT_STATUS'; seatIds: string[]; status: SeatStatus }
  | { type: 'SCALE_SEATS'; seatIds: string[]; factor: number }
  | { type: 'ALIGN_SEATS'; seatIds: string[]; mode: 'straighten' | 'flat' }
  | { type: 'DUPLICATE_SECTION'; id: string; mirror?: boolean }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_ALL' }

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState: CanvasState = {
  tool: 'select',
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  sections: [],
  backgroundShapes: [],
  selectedIds: [],
  selectedSeatId: null,
  selectedSeatIds: [],
  drawingPoints: [],
  isDrawing: false,
  canvasWidth: 1400,
  canvasHeight: 900,
  dropRow: 'A',
  dropSeatNumber: 1,
  seatRadius: 6,
  seatShape: 'circle',
  dragSeatStart: null,
}

// ─── Reducer ────────────────────────────────────────────────────────────────

function canvasReducer(state: CanvasState, action: Action): CanvasState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool, isDrawing: false, drawingPoints: [], selectedSeatId: null, selectedSeatIds: [], dragSeatStart: null }

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.1, Math.min(5, action.zoom)) }

    case 'SET_PAN':
      return { ...state, panOffset: action.offset }

    case 'ADD_SECTION':
      return { ...state, sections: [...state.sections, action.section] }

    case 'UPDATE_SECTION':
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.id ? { ...s, ...action.updates } : s
        ),
      }

    case 'UPDATE_SECTIONS': {
      const targets = new Set(action.ids)
      return {
        ...state,
        sections: state.sections.map((s) =>
          targets.has(s.id) ? { ...s, ...action.updates } : s
        ),
      }
    }

    case 'DELETE_SECTION':
      return {
        ...state,
        sections: state.sections.filter((s) => s.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
        selectedSeatId: null,
      }

    case 'DELETE_SECTIONS': {
      const targets = new Set(action.ids)
      return {
        ...state,
        sections: state.sections.filter((s) => !targets.has(s.id)),
        selectedIds: state.selectedIds.filter((id) => !targets.has(id)),
        selectedSeatId: null,
        selectedSeatIds: [],
      }
    }

    case 'ADD_SHAPE':
      return { ...state, backgroundShapes: [...state.backgroundShapes, action.shape] }

    case 'UPDATE_SHAPE':
      return {
        ...state,
        backgroundShapes: state.backgroundShapes.map((s) =>
          s.id === action.id ? { ...s, ...action.updates } : s
        ),
      }

    case 'DELETE_SHAPE':
      return {
        ...state,
        backgroundShapes: state.backgroundShapes.filter((s) => s.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
      }

    case 'SELECT':
      return { ...state, selectedIds: action.ids, selectedSeatId: null, selectedSeatIds: [] }

    case 'TOGGLE_SELECT': {
      const exists = state.selectedIds.includes(action.id)
      const ids = exists
        ? state.selectedIds.filter((id) => id !== action.id)
        : [...state.selectedIds, action.id]
      return { ...state, selectedIds: ids, selectedSeatId: null, selectedSeatIds: [] }
    }

    // Seat selection and section selection are mutually exclusive modes —
    // clear selectedIds so the properties panel never confuses a seat selection
    // for a section (which would hide the multi-seat tools like Straighten).
    case 'SELECT_SEAT':
      return { ...state, selectedIds: [], selectedSeatId: action.seatId, selectedSeatIds: action.seatId ? [action.seatId] : [] }

    case 'SELECT_SEATS':
      return { ...state, selectedIds: [], selectedSeatIds: action.seatIds, selectedSeatId: action.seatIds[0] ?? null }

    case 'TOGGLE_SELECT_SEAT': {
      const exists = state.selectedSeatIds.includes(action.seatId)
      const newIds = exists
        ? state.selectedSeatIds.filter(id => id !== action.seatId)
        : [...state.selectedSeatIds, action.seatId]
      return { ...state, selectedIds: [], selectedSeatIds: newIds, selectedSeatId: newIds[newIds.length - 1] ?? null }
    }

    case 'DESELECT_ALL':
      return { ...state, selectedIds: [], selectedSeatId: null, selectedSeatIds: [], dragSeatStart: null }

    case 'SET_DRAWING_POINTS':
      return { ...state, drawingPoints: action.points }

    case 'ADD_DRAWING_POINT':
      return {
        ...state,
        drawingPoints: [...state.drawingPoints, action.x, action.y],
        isDrawing: true,
      }

    case 'SET_IS_DRAWING':
      return { ...state, isDrawing: action.isDrawing }

    case 'SET_DROP_ROW':
      return { ...state, dropRow: action.row }

    case 'SET_DROP_SEAT_NUMBER':
      return { ...state, dropSeatNumber: action.num }

    case 'DELETE_SEAT': {
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? { ...s, seats: s.seats.filter((seat) => seat.id !== action.seatId) }
            : s
        ),
        selectedSeatId: state.selectedSeatId === action.seatId ? null : state.selectedSeatId,
      }
    }

    case 'DELETE_SEATS': {
      const toDelete = new Set(action.seatIds)
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.filter((seat) => !toDelete.has(seat.id)),
        })),
        selectedSeatId: null,
        selectedSeatIds: [],
      }
    }

    case 'ADD_SEATS': {
      // Paste: append seats to their target sections and select the new ones.
      const bySection = new Map<string, SeatData[]>()
      for (const { sectionId, seat } of action.seats) {
        const arr = bySection.get(sectionId) ?? []
        arr.push(seat)
        bySection.set(sectionId, arr)
      }
      const newIds = action.seats.map((a) => a.seat.id)
      return {
        ...state,
        sections: state.sections.map((s) =>
          bySection.has(s.id) ? { ...s, seats: [...s.seats, ...bySection.get(s.id)!] } : s
        ),
        selectedIds: [],
        selectedSeatIds: newIds,
        selectedSeatId: newIds[newIds.length - 1] ?? null,
      }
    }

    case 'ASSIGN_SEATS_TIER': {
      const targets = new Set(action.seatIds)
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) =>
            targets.has(seat.id) ? { ...seat, tierId: action.tierId } : seat
          ),
        })),
      }
    }

    case 'LOAD_CANVAS':
      return {
        ...state,
        sections: action.sections,
        backgroundShapes: action.backgroundShapes,
        canvasWidth: action.width ?? state.canvasWidth,
        canvasHeight: action.height ?? state.canvasHeight,
        seatRadius: action.seatRadius ?? state.seatRadius,
        seatShape: action.seatShape ?? state.seatShape,
      }

    case 'SET_SEAT_RADIUS':
      return { ...state, seatRadius: Math.max(2, Math.min(14, action.radius)) }

    case 'SET_SEAT_SHAPE':
      return { ...state, seatShape: action.shape }

    case 'SET_DRAG_SEAT_START':
      return { ...state, dragSeatStart: action.point }

    case 'RENUMBER_SEATS': {
      // 'row'  → all selected seats become one row, numbered left→right.
      // 'grid' → detect rows by vertical position; each row gets the next row
      //          label (A, B, C…) top→bottom, numbered left→right within the row.
      const mode = action.mode ?? 'row'
      const rowThreshold = state.seatRadius * 2.5
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id !== action.sectionId) return s
          const targetSet = new Set(action.seatIds)
          const updates = new Map<string, { rowLabel: string; seatNumber: number; label: string }>()

          if (mode === 'grid') {
            const sorted = s.seats.filter(seat => targetSet.has(seat.id)).sort((a, b) => a.y - b.y)
            // Cluster into rows by vertical proximity (running average)
            const rows: SeatData[][] = []
            let cur: SeatData[] = []
            let curAvgY = 0
            for (const seat of sorted) {
              if (cur.length === 0 || Math.abs(seat.y - curAvgY) <= rowThreshold) {
                cur.push(seat)
                curAvgY = cur.reduce((sum, x) => sum + x.y, 0) / cur.length
              } else {
                rows.push(cur); cur = [seat]; curAvgY = seat.y
              }
            }
            if (cur.length) rows.push(cur)

            let rowLabel = action.startRow
            for (const row of rows) {
              row.sort((a, b) => a.x - b.x)
              let num = action.startNum
              for (const seat of row) {
                updates.set(seat.id, { rowLabel, seatNumber: num, label: `${rowLabel}${num}` })
                num++
              }
              rowLabel = incrementRowLabel(rowLabel)
            }
          } else {
            const targetSeats = s.seats
              .filter(seat => targetSet.has(seat.id))
              .sort((a, b) => a.x - b.x || a.y - b.y)
            let num = action.startNum
            for (const seat of targetSeats) {
              updates.set(seat.id, { rowLabel: action.startRow, seatNumber: num, label: `${action.startRow}${num}` })
              num++
            }
          }

          return {
            ...s,
            seats: s.seats.map(seat => {
              const upd = updates.get(seat.id)
              return upd ? { ...seat, ...upd } : seat
            }),
          }
        }),
      }
    }

    case 'MOVE_SEAT':
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? { ...s, seats: s.seats.map((seat) => seat.id === action.seatId ? { ...seat, x: action.x, y: action.y } : seat) }
            : s
        ),
      }

    case 'MOVE_SEATS': {
      // Group drag: offset every selected seat by the same delta.
      const targets = new Set(action.seatIds)
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) =>
            targets.has(seat.id) ? { ...seat, x: seat.x + action.dx, y: seat.y + action.dy } : seat
          ),
        })),
      }
    }

    case 'SET_SEAT_STATUS': {
      const targets = new Set(action.seatIds)
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => targets.has(seat.id) ? { ...seat, status: action.status } : seat),
        })),
      }
    }

    case 'SCALE_SEATS': {
      // Spread/compress selected seats around their centroid (preserves nudges).
      const targets = new Set(action.seatIds)
      const pts = state.sections.flatMap((s) => s.seats.filter((seat) => targets.has(seat.id)))
      if (pts.length < 2) return state
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => targets.has(seat.id)
            ? { ...seat, x: cx + (seat.x - cx) * action.factor, y: cy + (seat.y - cy) * action.factor }
            : seat),
        })),
      }
    }

    case 'ALIGN_SEATS': {
      const targets = new Set(action.seatIds)
      // Group selected seats by section + row so that aligning a selection that
      // spans multiple sections (or multiple rows) straightens each row on its
      // own line instead of collapsing every seat onto one shared line.
      const groups = new Map<string, { id: string; x: number; y: number }[]>()
      for (const s of state.sections) {
        for (const seat of s.seats) {
          if (!targets.has(seat.id)) continue
          const key = `${s.id}::${seat.rowLabel}`
          const arr = groups.get(key) ?? []
          arr.push({ id: seat.id, x: seat.x, y: seat.y })
          groups.set(key, arr)
        }
      }
      const moved = new Map<string, { x: number; y: number }>()
      for (const pts of groups.values()) {
        if (pts.length < 2) continue
        for (const [id, pos] of alignSeatsToLine(pts, action.mode)) moved.set(id, pos)
      }
      if (moved.size === 0) return state
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => {
            const pos = moved.get(seat.id)
            return pos ? { ...seat, x: pos.x, y: pos.y } : seat
          }),
        })),
      }
    }

    case 'DUPLICATE_SECTION': {
      const src = state.sections.find((s) => s.id === action.id)
      if (!src) return state
      const maxSort = state.sections.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0)
      const clone = { ...cloneSectionWithNewIds(src, { mirror: !!action.mirror }), sortOrder: maxSort + 1 }
      return { ...state, sections: [...state.sections, clone], selectedIds: [clone.id], selectedSeatId: null, selectedSeatIds: [] }
    }

    case 'CLEAR_ALL':
      return {
        ...state,
        sections: [],
        backgroundShapes: [],
        selectedIds: [],
        selectedSeatId: null,
        drawingPoints: [],
        isDrawing: false,
      }

    // Undo/redo handled externally
    case 'UNDO':
    case 'REDO':
      return state

    default:
      return state
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50

export function useCanvasState() {
  const [state, dispatch] = useReducer(canvasReducer, initialState)

  // Undo/redo via past/future stacks. `stateRef` mirrors the latest committed
  // state so undo can snapshot the CURRENT state into the future stack —
  // without it, the most recent change would be unrecoverable.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const pastRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])

  const snapshot = (s: CanvasState): HistoryEntry => ({
    sections: JSON.parse(JSON.stringify(s.sections)),
    backgroundShapes: JSON.parse(JSON.stringify(s.backgroundShapes)),
  })

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    futureRef.current.push(snapshot(stateRef.current))
    dispatch({
      type: 'LOAD_CANVAS',
      sections: prev.sections,
      backgroundShapes: prev.backgroundShapes,
    })
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push(snapshot(stateRef.current))
    dispatch({
      type: 'LOAD_CANVAS',
      sections: next.sections,
      backgroundShapes: next.backgroundShapes,
    })
  }, [])

  // Dispatch an undoable action: snapshot the state before it, clear redo branch
  const dispatchWithHistory = useCallback((action: Action) => {
    pastRef.current.push(snapshot(stateRef.current))
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift()
    futureRef.current = []
    dispatch(action)
  }, [])

  return {
    state,
    dispatch,
    dispatchWithHistory,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  }
}
