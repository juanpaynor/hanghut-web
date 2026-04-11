'use client'

import { useReducer, useCallback, useRef } from 'react'
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
  drawingPoints: [],
  isDrawing: false,
  canvasWidth: 1400,
  canvasHeight: 900,
  dropRow: 'A',
  dropSeatNumber: 1,
  seatRadius: 6,
  seatShape: 'circle',
}

// ─── Reducer ────────────────────────────────────────────────────────────────

function canvasReducer(state: CanvasState, action: Action): CanvasState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool, isDrawing: false, drawingPoints: [], selectedSeatId: null }

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
      return { ...state, selectedIds: action.ids, selectedSeatId: null }

    case 'SELECT_SEAT':
      return { ...state, selectedSeatId: action.seatId }

    case 'DESELECT_ALL':
      return { ...state, selectedIds: [], selectedSeatId: null }

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

  // History for undo/redo (managed separately from reducer to avoid circular deps)
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIndexRef = useRef(-1)

  const pushHistory = useCallback(() => {
    const entry: HistoryEntry = {
      sections: JSON.parse(JSON.stringify(state.sections)),
      backgroundShapes: JSON.parse(JSON.stringify(state.backgroundShapes)),
    }

    // Remove anything after current index (new branch)
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push(entry)

    // Cap history
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
  }, [state.sections, state.backgroundShapes])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const entry = historyRef.current[historyIndexRef.current]
    if (entry) {
      dispatch({
        type: 'LOAD_CANVAS',
        sections: JSON.parse(JSON.stringify(entry.sections)),
        backgroundShapes: JSON.parse(JSON.stringify(entry.backgroundShapes)),
      })
    }
  }, [])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const entry = historyRef.current[historyIndexRef.current]
    if (entry) {
      dispatch({
        type: 'LOAD_CANVAS',
        sections: JSON.parse(JSON.stringify(entry.sections)),
        backgroundShapes: JSON.parse(JSON.stringify(entry.backgroundShapes)),
      })
    }
  }, [])

  // Convenience: dispatch + push history (for undoable actions)
  const dispatchWithHistory = useCallback(
    (action: Action) => {
      pushHistory()
      dispatch(action)
    },
    [pushHistory]
  )

  return {
    state,
    dispatch,
    dispatchWithHistory,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
  }
}
