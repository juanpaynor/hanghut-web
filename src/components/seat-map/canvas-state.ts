'use client'

import { useReducer, useCallback, useRef, useEffect } from 'react'
import { ensureRows, applyRowLayout, transformRows } from '@/lib/seat-map/rows'
import {
  sectionBounds,
  groupBounds,
  rotateSection,
  rotateShape,
  shapeBoundsForGroup,
  translateSection,
  alignSectionDeltas,
} from '@/lib/seat-map/transform'
import type { AlignMode } from '@/lib/seat-map/transform'
import {
  chairTarget, stageCenter, stagePolygon, audienceCenter, seatFacing, normaliseDegrees,
} from '@/lib/seat-map/chair'
export type { AlignMode }
import type {
  RowData,
  CanvasState,
  CanvasTool,
  CanvasData,
  SectionData,
  SeatData,
  SeatStatus,
  BackgroundShape,
  HistoryEntry,
  SeatShape,
} from './types'

/**
 * Give every section and seat a FRESH id (and reset seat statuses to available).
 *
 * Templates and copied maps store their source event's section/seat ids inside
 * canvas_data. Applying one verbatim would upsert event_sections/seats rows with
 * ids that already belong to another event — which trips that table's owner-only
 * RLS ("new row violates row-level security policy (USING expression)") or, for
 * same-owner ids, silently overwrites the other event's rows. Regenerating ids on
 * apply makes the applied layout brand-new geometry for THIS event. Geometry,
 * labels, tiers, colours and layout prefs are preserved; only ids/status change.
 */
export function regenerateCanvasIds(canvas: CanvasData): CanvasData {
  return {
    ...canvas,
    backgroundShapes: (canvas.backgroundShapes ?? []).map((shape) => ({
      ...shape,
      id: crypto.randomUUID(),
    })),
    sections: (canvas.sections ?? []).map((section) => {
      // Rows get fresh ids too; seats follow their row through the map.
      const rowIdMap = new Map<string, string>()
      const rows = (section.rows ?? []).map((row) => {
        const id = crypto.randomUUID()
        rowIdMap.set(row.id, id)
        return { ...row, id }
      })
      return {
        ...section,
        id: crypto.randomUUID(),
        rows,
        seats: (section.seats ?? []).map((seat) => ({
          ...seat,
          id: crypto.randomUUID(),
          rowId: seat.rowId ? rowIdMap.get(seat.rowId) ?? null : null,
          status: 'available' as SeatStatus,
        })),
      }
    }),
  }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Bounding box of a section from its polygon points (falls back to seats). */
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

  // Rows follow the same transform; seats keep their row through the id map.
  const rowIdMap = new Map<string, string>()
  const rows = transformRows(section.rows, (p) => ({ x: reflectX(p.x), y: offY(p.y) }))?.map((r) => {
    const id = crypto.randomUUID()
    rowIdMap.set(r.id, id)
    // A mirrored row reads right-to-left now; flip its numbering so the
    // renumbered seats above still describe it.
    return { ...r, id, numberingDirection: opts.mirror ? (r.numberingDirection === 'ltr' ? 'rtl' : 'ltr') as 'ltr' | 'rtl' : r.numberingDirection }
  })
  seats = seats.map((s) => ({ ...s, rowId: s.rowId ? rowIdMap.get(s.rowId) ?? null : null }))

  return {
    ...section,
    id: crypto.randomUUID(),
    label: `${section.label} copy`,
    polygonPoints,
    seats,
    arcConfig,
    rows,
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
  /** Everything unlocked on the map — sections and decor both. */
  | { type: 'SELECT_ALL' }
  | { type: 'SET_DRAWING_POINTS'; points: number[] }
  | { type: 'ADD_DRAWING_POINT'; x: number; y: number }
  | { type: 'SET_IS_DRAWING'; isDrawing: boolean }
  | { type: 'LOAD_CANVAS'; sections: SectionData[]; backgroundShapes: BackgroundShape[]; width?: number; height?: number; seatRadius?: number; seatShape?: SeatShape; canvasBackground?: string | null }
  | { type: 'SET_DROP_ROW'; row: string }
  | { type: 'SET_DROP_SEAT_NUMBER'; num: number }
  | { type: 'DELETE_SEAT'; sectionId: string; seatId: string }
  | { type: 'SET_SEAT_RADIUS'; radius: number }
  | { type: 'SET_CANVAS_BACKGROUND'; color: string | null }
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
  | { type: 'ROTATE_SEATS'; seatIds: string[]; degrees: number }
  | { type: 'SET_SEAT_FACING'; seatIds: string[]; facing: number | null }
  | { type: 'SET_SEAT_FACINGS'; facings: { id: string; facing: number }[] }
  | { type: 'ORBIT_SEATS'; seatIds: string[]; degrees: number }
  | { type: 'SET_SEAT_POSITIONS'; positions: { id: string; x: number; y: number }[] }
  | { type: 'ALIGN_SEATS'; seatIds: string[]; mode: 'straighten' | 'flat' }
  | { type: 'DUPLICATE_SECTION'; id: string; mirror?: boolean }
  /** Rotate whole sections. One section turns about its own centre; several turn
   *  together about the centre of the selection, which is what keeps a rotated
   *  cluster of booths in the same arrangement. */
  | { type: 'ROTATE_SECTIONS'; ids: string[]; degrees: number }
  | { type: 'ALIGN_SECTIONS'; ids: string[]; mode: AlignMode }
  // ── Rows ──
  | { type: 'SELECT_ROW'; rowId: string | null }
  /** Replace a row's definition and re-lay its seats (ids preserved). */
  | { type: 'UPDATE_ROW'; sectionId: string; rowId: string; updates: Partial<RowData>; relayout?: boolean }
  /** Add a row + its generated seats to a section. */
  | { type: 'ADD_ROW'; sectionId: string; row: RowData }
  /** Remove a row and its (unsold) seats. */
  | { type: 'DELETE_ROW'; sectionId: string; rowId: string }
  /** Move a row's end label (drag). */
  | { type: 'MOVE_ROW_LABEL'; sectionId: string; rowId: string; end: 'start' | 'end'; dx: number; dy: number }
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
  canvasBackground: null,
  seatShape: 'circle',
  dragSeatStart: null,
  selectedRowId: null,
}

// ─── Reducer ────────────────────────────────────────────────────────────────

// Exported for geometry tests: rotation and alignment move real seat
// coordinates on live maps, so the transforms are verified through the exact
// reducer the editor dispatches to, not a reimplementation of it.
export function canvasReducer(state: CanvasState, action: Action): CanvasState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool, isDrawing: false, drawingPoints: [], selectedSeatId: null, selectedSeatIds: [], dragSeatStart: null, selectedRowId: null }

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
      return { ...state, selectedIds: action.ids, selectedSeatId: null, selectedSeatIds: [], selectedRowId: null }

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
      return { ...state, selectedIds: [], selectedSeatId: action.seatId, selectedSeatIds: action.seatId ? [action.seatId] : [], selectedRowId: null }

    case 'SELECT_SEATS':
      return { ...state, selectedIds: [], selectedSeatIds: action.seatIds, selectedSeatId: action.seatIds[0] ?? null, selectedRowId: null }

    // A row lives inside a section: keep the section selected, clear seats.
    case 'SELECT_ROW':
      return { ...state, selectedRowId: action.rowId, selectedSeatId: null, selectedSeatIds: [] }

    case 'UPDATE_ROW': {
      return {
        ...state,
        sections: state.sections.map((sec) => {
          if (sec.id !== action.sectionId) return sec
          const rows = (sec.rows ?? []).map((r) => (r.id === action.rowId ? { ...r, ...action.updates } : r))
          const row = rows.find((r) => r.id === action.rowId)
          if (!row) return sec
          let seats = sec.seats
          if (action.relayout !== false) {
            seats = applyRowLayout({ ...sec, rows }, row)
          } else if (action.updates.label !== undefined) {
            // Label-only edit still has to rename the row's seats.
            seats = sec.seats.map((s) => (s.rowId === row.id ? { ...s, rowLabel: row.label, label: `${row.label}${s.seatNumber}` } : s))
          }
          return { ...sec, rows, seats }
        }),
      }
    }

    case 'ADD_ROW': {
      return {
        ...state,
        sections: state.sections.map((sec) => {
          if (sec.id !== action.sectionId) return sec
          const rows = [...(sec.rows ?? []), action.row]
          return { ...sec, rows, seats: applyRowLayout({ ...sec, rows }, action.row) }
        }),
        selectedRowId: action.row.id,
      }
    }

    case 'DELETE_ROW': {
      return {
        ...state,
        sections: state.sections.map((sec) => {
          if (sec.id !== action.sectionId) return sec
          return {
            ...sec,
            rows: (sec.rows ?? []).filter((r) => r.id !== action.rowId),
            // Sold seats stay (the save refuses to drop them anyway); they just lose their row.
            seats: sec.seats.filter((s) => s.rowId !== action.rowId || s.status === 'booked').map((s) => (s.rowId === action.rowId ? { ...s, rowId: null } : s)),
          }
        }),
        selectedRowId: state.selectedRowId === action.rowId ? null : state.selectedRowId,
      }
    }

    case 'MOVE_ROW_LABEL': {
      return {
        ...state,
        sections: state.sections.map((sec) => {
          if (sec.id !== action.sectionId) return sec
          return {
            ...sec,
            rows: (sec.rows ?? []).map((r) => r.id === action.rowId
              ? { ...r, labelOffset: { ...(r.labelOffset ?? {}), [action.end]: { dx: action.dx, dy: action.dy } } }
              : r),
          }
        }),
      }
    }

    case 'TOGGLE_SELECT_SEAT': {
      const exists = state.selectedSeatIds.includes(action.seatId)
      const newIds = exists
        ? state.selectedSeatIds.filter(id => id !== action.seatId)
        : [...state.selectedSeatIds, action.seatId]
      return { ...state, selectedIds: [], selectedSeatIds: newIds, selectedSeatId: newIds[newIds.length - 1] ?? null }
    }

    case 'SELECT_ALL': {
      // Locked things are deliberately skipped. Lock exists so a traced floor
      // plan or a placed stage stops moving while you work around it, and a
      // select-all that swept them up would make the next rotate undo exactly
      // the thing the lock was protecting.
      const ids = [
        ...state.sections.filter((s2) => !s2.locked).map((s2) => s2.id),
        ...state.backgroundShapes.filter((b) => !b.locked).map((b) => b.id),
      ]
      if (ids.length === 0) return state
      return { ...state, selectedIds: ids, selectedSeatId: null, selectedSeatIds: [], selectedRowId: null }
    }

    case 'DESELECT_ALL':
      return { ...state, selectedIds: [], selectedSeatId: null, selectedSeatIds: [], dragSeatStart: null, selectedRowId: null }

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
        // Maps saved before rows existed get their rows derived from the seats
        // once here; they persist on the next save.
        sections: action.sections.map((sec) => ensureRows(sec, action.seatRadius ?? state.seatRadius)),
        backgroundShapes: action.backgroundShapes,
        canvasWidth: action.width ?? state.canvasWidth,
        canvasHeight: action.height ?? state.canvasHeight,
        seatRadius: action.seatRadius ?? state.seatRadius,
        // `?? state.canvasBackground`, NOT `?? null`: undo and redo replay
        // LOAD_CANVAS carrying only sections and shapes, so a `?? null` here
        // wiped the backdrop on every undo. Clearing it back to the default is
        // SET_CANVAS_BACKGROUND's job, with an explicit null.
        canvasBackground: action.canvasBackground ?? state.canvasBackground,
        seatShape: action.seatShape ?? state.seatShape,
      }

    case 'SET_SEAT_RADIUS':
      return { ...state, seatRadius: Math.max(2, Math.min(14, action.radius)) }
    case 'SET_CANVAS_BACKGROUND':
      // Only a 3- or 6-digit hex is kept. Anything else becomes null (the
      // default white) rather than being handed to CSS, where a bad value is
      // silently ignored and the organizer sees nothing happen.
      return {
        ...state,
        canvasBackground: action.color && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(action.color)
          ? action.color
          : null,
      }

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

    case 'SET_SEAT_POSITIONS': {
      // Exact coordinates, not a delta.
      //
      // The rotate KNOB needs this. A live drag recomputes from the positions
      // the seats had when the gesture STARTED, every frame, and sets them
      // outright.
      //
      // Not mainly for accuracy: measured over 2000 frames, turning the
      // current state by each frame's small delta drifts about 9e-12, because
      // the centroid of a rigid set does not move when you rotate it. (That is
      // NOT true of the section handle, whose pivot is the bounding-box centre
      // — see rotateDragRef on why a U booth would walk across the map.)
      //
      // The real reason is SHIFT-SNAPPING. Snapping has to apply to the total
      // angle of the gesture. Snap each frame's delta instead and every delta
      // under 7.5° rounds to zero, so a slow drag never moves at all.
      if (action.positions.length === 0) return state
      const next = new Map(action.positions.map((p) => [p.id, p]))
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => {
            const p = next.get(seat.id)
            return p ? { ...seat, x: p.x, y: p.y } : seat
          }),
        })),
      }
    }

    case 'ROTATE_SEATS': {
      // Turn each selected seat ON THE SPOT: change which way the chair faces.
      // Nothing moves.
      //
      // A seat's facing is normally DERIVED — face the table you ring, the room
      // if you stand on the stage, otherwise the stage. Turning one by hand has
      // to write that answer down first, or the nudge would be measured against
      // a number the seat does not have. From then on the seat keeps its own
      // angle and stops following the stage, which is what overriding means.
      // SET_SEAT_FACING with null hands it back.
      const targets = new Set(action.seatIds)
      if (targets.size === 0 || !action.degrees) return state

      const stage = stageCenter(state.backgroundShapes)
      const stagePoly = stagePolygon(state.backgroundShapes)
      const audience = audienceCenter(state.sections.map((s) => s.polygonPoints), stagePoly)

      let touched = false
      const sections = state.sections.map((s) => {
        if (!s.seats.some((seat) => targets.has(seat.id))) return s
        // Per section, because the thing a chair faces is a property of the
        // section it belongs to, not of the selection.
        const look = chairTarget(s.polygonPoints, s.seats, stage, { stagePoly, audience })
        return {
          ...s,
          seats: s.seats.map((seat) => {
            if (!targets.has(seat.id)) return seat
            touched = true
            return { ...seat, facing: normaliseDegrees(seatFacing(seat, look) + action.degrees) }
          }),
        }
      })
      return touched ? { ...state, sections } : state
    }

    case 'SET_SEAT_FACINGS': {
      // Per-seat absolute angles. What the rotate KNOB sends every frame: it
      // captures each seat's starting angle once and adds the gesture's total,
      // so a chair that already pointed somewhere different keeps that
      // difference instead of every chair snapping to one shared angle.
      if (action.facings.length === 0) return state
      const next = new Map(action.facings.map((f) => [f.id, normaliseDegrees(f.facing)]))
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) =>
            next.has(seat.id) ? { ...seat, facing: next.get(seat.id)! } : seat
          ),
        })),
      }
    }

    case 'SET_SEAT_FACING': {
      // An absolute angle, or null to go back to following the stage.
      const targets = new Set(action.seatIds)
      if (targets.size === 0) return state
      const facing = action.facing === null ? null : normaliseDegrees(action.facing)
      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => (targets.has(seat.id) ? { ...seat, facing } : seat)),
        })),
      }
    }

    case 'ORBIT_SEATS': {
      // Swing the selected seats AROUND a pivot — their positions change, the
      // way they face does not. This is the other meaning of "rotate a block of
      // seats": angling a whole bank against a wall rather than turning the
      // chairs in place. ROTATE_SEATS above is the one the Turn controls use.
      //
      // Turn the selected seats as one rigid body.
      //
      // The pivot is the selection's CENTROID, not its bounding-box centre --
      // deliberately the same pivot SCALE_SEATS uses. Spread, compress and
      // rotate are the three transforms that act on a loose group of seats, and
      // if rotate span about a different point than spread, alternating them
      // would walk the selection across the map a little at a time. (Sections
      // use the bbox centre, but a section is a shape with an outline; a bag of
      // seats has no box of its own that the organizer can see.)
      //
      // Positions only. Numbering, row labels, status and tier all stay put --
      // turning a block of seats is not renumbering it.
      const targets = new Set(action.seatIds)
      const pts = state.sections.flatMap((s) => s.seats.filter((seat) => targets.has(seat.id)))
      // One seat is a point, and a point has no orientation to change. The
      // chair SHAPE does face a direction, but that is derived from the stage
      // or the table it rings, so there is nothing here to turn either.
      if (pts.length < 2 || !action.degrees) return state

      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      const rad = (action.degrees * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)

      return {
        ...state,
        sections: state.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => {
            if (!targets.has(seat.id)) return seat
            const dx = seat.x - cx, dy = seat.y - cy
            return { ...seat, x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
          }),
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

    case 'ROTATE_SECTIONS': {
      const ids = new Set(action.ids)
      const targets = state.sections.filter((s) => ids.has(s.id))
      // Decor is part of the body being turned. Rotating a venue 90 degrees and
      // leaving the stage, the bar and the dance floor behind is not a rotation
      // of the venue — it is a rotation of half of it.
      const shapeTargets = state.backgroundShapes.filter((b) => ids.has(b.id))
      if ((targets.length + shapeTargets.length) === 0 || !action.degrees) return state

      // One piece spins in place; a group turns as one rigid body about a pivot
      // that spans BOTH kinds, or the two halves would turn about different
      // centres and come apart.
      const many = targets.length + shapeTargets.length > 1
      let shared: { cx: number; cy: number } | null = null
      if (many) {
        const boxes = [
          ...targets.map(sectionBounds),
          ...shapeTargets.map(shapeBoundsForGroup),
        ]
        const minX = Math.min(...boxes.map((b) => b.minX))
        const minY = Math.min(...boxes.map((b) => b.minY))
        const maxX = Math.max(...boxes.map((b) => b.maxX))
        const maxY = Math.max(...boxes.map((b) => b.maxY))
        shared = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
      }
      return {
        ...state,
        sections: state.sections.map((s) => {
          if (!ids.has(s.id)) return s
          const b = shared ?? sectionBounds(s)
          return rotateSection(s, action.degrees, { x: b.cx, y: b.cy })
        }),
        backgroundShapes: state.backgroundShapes.map((b) => {
          if (!ids.has(b.id)) return b
          const box = shared ?? shapeBoundsForGroup(b)
          return rotateShape(b, action.degrees, { x: box.cx, y: box.cy })
        }),
      }
    }

    case 'ALIGN_SECTIONS': {
      const ids = new Set(action.ids)
      const targets = state.sections.filter((s) => ids.has(s.id))
      if (targets.length < 2) return state
      const deltas = alignSectionDeltas(targets, action.mode)
      if (deltas.size === 0) return state
      return {
        ...state,
        sections: state.sections.map((s) => {
          const d = deltas.get(s.id)
          return d && (d.dx || d.dy) ? translateSection(s, d.dx, d.dy) : s
        }),
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
