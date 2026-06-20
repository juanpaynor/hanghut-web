/**
 * Shared types for the seat map system.
 * Used across canvas builder, seat picker, and server actions.
 */

// ─── Canvas Tool Modes ──────────────────────────────────────────────────────

export type CanvasTool =
  | 'select'
  | 'draw-polygon'
  | 'draw-rect'
  | 'draw-seat'
  | 'pan'

// ─── Section Types ──────────────────────────────────────────────────────────

export type SectionType = 'vip' | 'general' | 'floor' | 'box' | 'balcony' | 'standing'

export interface ArcConfig {
  cx: number
  cy: number
  rInner: number
  rOuter: number
  startAngle: number  // degrees
  endAngle: number    // degrees
}

export interface SectionData {
  id: string
  label: string
  color: string
  sectionType: SectionType
  polygonPoints: number[]    // flat [x1,y1,x2,y2,...]
  arcConfig?: ArcConfig | null
  seatOrientation: 'straight' | 'arc'
  rowCount: number
  seatsPerRow: number
  seats: SeatData[]
  gridRotation?: number
  isActive: boolean
  sortOrder: number
  tierId?: string | null                       // default price category for the whole section
  rowTierOverrides?: Record<string, string>    // rowLabel → tierId, overrides section tier
  // Layout prefs (persisted in canvas_data JSONB so re-fills stay stable)
  seatGap?: number
  rowGap?: number
  numberingDirection?: 'ltr' | 'rtl'
  numberingStyle?: 'sequential' | 'odd_even'
  // Border / outline styling (cosmetic; lives in canvas_data JSONB)
  borderColor?: string | null   // null/undefined → falls back to section.color
  borderWidth?: number          // 0 = no border
  borderStyle?: 'solid' | 'dashed'
  locked?: boolean              // locked sections can't be dragged (frame stays put; seats still editable)
}

// ─── Seat Types ─────────────────────────────────────────────────────────────

export type SeatStatus = 'available' | 'booked' | 'disabled' | 'held' | 'selected'

export interface SeatData {
  id: string
  rowLabel: string
  seatNumber: number
  label: string      // e.g. "A1"
  x: number
  y: number
  status: SeatStatus
  customPrice?: number | null
  tierId?: string | null   // per-seat price override; resolution: seat → row → section
}

// ─── Price Categories (ticket tiers projected into the builder) ─────────────

export interface TierInfo {
  id: string
  name: string
  price: number
  color: string   // assigned from TIER_PALETTE by sort order
}

export const TIER_PALETTE = [
  '#f59e0b', '#6366f1', '#22c55e', '#ec4899',
  '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6',
  '#f43f5e', '#3b82f6', '#84cc16', '#d946ef',
]

/** Resolve a seat's price category: seat override → row override → section default */
export function resolveSeatTier(
  seat: SeatData,
  section: SectionData
): string | null {
  return seat.tierId ?? section.rowTierOverrides?.[seat.rowLabel] ?? section.tierId ?? null
}

// ─── Background Shapes ──────────────────────────────────────────────────────

export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'line' | 'polygon' | 'text' | 'image'

export interface BackgroundShape {
  id: string
  type: ShapeType
  x: number
  y: number
  width?: number
  height?: number
  radius?: number
  points?: number[]
  fill: string
  stroke?: string
  strokeWidth?: number
  label?: string
  fontSize?: number
  fontColor?: string   // label text color (zones); defaults to white
  rotation?: number
  imageUrl?: string
  opacity?: number
  scale?: number     // image display scale (1 = natural size)
  locked?: boolean   // locked images can't be dragged (for tracing floor plans)
}

// ─── Seat Appearance ────────────────────────────────────────────────────────

export type SeatShape = 'circle' | 'square' | 'diamond'

// ─── Canvas Data (serialized JSON) ──────────────────────────────────────────

export interface CanvasData {
  canvasWidth: number
  canvasHeight: number
  backgroundShapes: BackgroundShape[]
  sections: SectionData[]
  seatRadius?: number
  seatShape?: SeatShape
}

// ─── Seat Hold ──────────────────────────────────────────────────────────────

export interface SeatHold {
  id: string
  seatId: string
  sessionId: string
  userId?: string | null
  expiresAt: string
}

// ─── Canvas Builder State ───────────────────────────────────────────────────

export interface CanvasState {
  tool: CanvasTool
  zoom: number
  panOffset: { x: number; y: number }
  sections: SectionData[]
  backgroundShapes: BackgroundShape[]
  selectedIds: string[]         // selected section or shape IDs
  selectedSeatId: string | null // single selected seat within a section
  selectedSeatIds: string[]     // multi-selected seat IDs (for batch renumber)
  drawingPoints: number[]       // temp points while drawing polygon
  isDrawing: boolean
  canvasWidth: number
  canvasHeight: number
  dropRow: string
  dropSeatNumber: number
  seatRadius: number            // global seat dot size (3-12)
  seatShape: SeatShape          // global seat dot shape
  dragSeatStart: { x: number; y: number } | null  // start point for click-drag seat row
}

// ─── Undo/Redo ──────────────────────────────────────────────────────────────

export interface HistoryEntry {
  sections: SectionData[]
  backgroundShapes: BackgroundShape[]
}

// ─── Seat Colors ────────────────────────────────────────────────────────────

export const SEAT_COLORS: Record<SeatStatus, string> = {
  available: '#22c55e',
  booked: '#ef4444',
  disabled: '#374151',
  held: '#9ca3af',
  selected: '#6366f1',
}

export const SECTION_TYPE_COLORS: Record<SectionType, string> = {
  vip: '#f59e0b',
  general: '#6366f1',
  floor: '#06b6d4',
  box: '#8b5cf6',
  balcony: '#ec4899',
  standing: '#84cc16',
}
