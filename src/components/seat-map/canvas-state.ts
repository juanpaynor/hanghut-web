'use client'

import { useReducer, useCallback, useRef, useEffect } from 'react'
import type {
  CanvasState,
  CanvasTool,
  SectionData,
  BackgroundShape,
  HistoryEntry,
  SeatShape,
} from './types'

// ─── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_TOOL'; tool: CanvasTool }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_PAN'; offset: { x: number; y: number } }
  | { type: 'ADD_SECTION'; section: SectionData }
  | { type: 'UPDATE_SECTION'; id: string; updates: Partial<SectionData> }
  | { type: 'DELETE_SECTION'; id: string }
  | { type: 'ADD_SHAPE'; shape: BackgroundShape }
  | { type: 'UPDATE_SHAPE'; id: string; updates: Partial<BackgroundShape> }
  | { type: 'DELETE_SHAPE'; id: string }
  | { type: 'SELECT'; ids: string[] }
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
  | { type: 'ASSIGN_SEATS_TIER'; seatIds: string[]; tierId: string | null }
  | { type: 'RENUMBER_SEATS'; sectionId: string; seatIds: string[]; startRow: string; startNum: number }
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

    case 'DELETE_SECTION':
      return {
        ...state,
        sections: state.sections.filter((s) => s.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
        selectedSeatId: null,
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

    case 'SELECT_SEAT':
      return { ...state, selectedSeatId: action.seatId, selectedSeatIds: action.seatId ? [action.seatId] : [] }

    case 'SELECT_SEATS':
      return { ...state, selectedSeatIds: action.seatIds, selectedSeatId: action.seatIds[0] ?? null }

    case 'TOGGLE_SELECT_SEAT': {
      const exists = state.selectedSeatIds.includes(action.seatId)
      const newIds = exists
        ? state.selectedSeatIds.filter(id => id !== action.seatId)
        : [...state.selectedSeatIds, action.seatId]
      return { ...state, selectedSeatIds: newIds, selectedSeatId: newIds[newIds.length - 1] ?? null }
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
      // Renumber specific seats in a section — sorts by x position (left-to-right)
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id !== action.sectionId) return s
          const targetSet = new Set(action.seatIds)
          // Get target seats sorted by x position
          const targetSeats = s.seats
            .filter(seat => targetSet.has(seat.id))
            .sort((a, b) => a.x - b.x || a.y - b.y)
          // Assign new labels
          let num = action.startNum
          const updates = new Map<string, { rowLabel: string; seatNumber: number; label: string }>()
          for (const seat of targetSeats) {
            updates.set(seat.id, {
              rowLabel: action.startRow,
              seatNumber: num,
              label: `${action.startRow}${num}`,
            })
            num++
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
