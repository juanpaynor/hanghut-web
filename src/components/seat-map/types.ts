import type { SeatShapeName } from '@/lib/seat-map/seat-shape'

/**
 * Shared types for the seat map system.
 * Used across canvas builder, seat picker, and server actions.
 */

// ─── Canvas Tool Modes ──────────────────────────────────────────────────────

export type CanvasTool =
  | 'select'
  | 'draw-polygon'
  | 'draw-rect'
  /** One click = one sellable TABLE: a section + a single seat + a pax count.
   *  The club case. See createTableSection in canvas-builder.tsx. */
  | 'draw-table'
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

// ─── Rows ───────────────────────────────────────────────────────────────────
// A row is the thing the organizer draws and labels; seats are generated from
// it and stay the persisted primitive (holds, tickets and the DB key on seat
// ids). Dragging a seat off its row is allowed — the row is a guide + label,
// not a constraint — and "Regenerate" snaps the row's seats back onto the path.

export type RowPath =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  /** Angles in degrees, seats laid from startAngle to endAngle (may run either way). */
  | { kind: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number }

export interface RowData {
  id: string
  label: string
  path: RowPath
  seatCount: number
  startNumber: number
  numberingDirection: 'ltr' | 'rtl'
  numberingStyle: 'sequential' | 'odd_even'
  /** Label positions, as offsets from the auto anchor just outside each end. */
  labelOffset?: { start?: { dx: number; dy: number }; end?: { dx: number; dy: number } }
  /** Hide this row's end labels (e.g. a single-seat "row"). */
  hideLabels?: boolean
  /** Aisles inside the row: extra space after the given 0-based seat index, in canvas units. */
  gaps?: { afterIndex: number; width: number }[]
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
  /** Which end of the row order is the front for best-available seating:
   *  'asc' = first label / top row first (default), 'desc' = last label first. */
  rowOrder?: 'asc' | 'desc'
  /** rowOrder was set by hand in the builder — don't re-derive it from the stage on save. */
  rowOrderManual?: boolean
  /** Rows (paths + labels + numbering) that generated this section's seats.
   *  Absent on maps saved before rows existed → derived from seats on load. */
  rows?: RowData[]
  /** Draw row labels at the ends of each row (editor + buyer picker). Default true. */
  showRowLabels?: boolean
  /**
   * How many PEOPLE one sold unit of this section admits — the club/table case
   * ("VIP COUCH 1 · admits 8").
   *
   * Informational ONLY. It never takes part in availability, pricing or holds,
   * so it cannot oversell: a table is still one seat row, protected by the same
   * seat_holds machinery that already works. It exists so the buyer knows how
   * many fit and the door knows how many to let in.
   *
   * Undefined means an ordinary seated section: one person per seat.
   */
  unitCapacity?: number
  /** Decorative chairs round a whole-sell piece. undefined = default size,
   *  0 = none, 0.1-3 = multiplier on the map seat radius. Picture only —
   *  unitCapacity is still what gets sold. */
  chairScale?: number | null
  /** Nudge for the section's name, from the middle of its shape. null/absent
   *  = centred, which is every section that exists today. */
  labelOffset?: { dx: number; dy: number } | null
  /** Section name size in px. null/absent = SECTION_LABEL_SIZE. 8-48. */
  labelFontSize?: number | null
  /**
   * Per-section override of the map-wide CanvasData.seatShape.
   *
   * Undefined means inherit the global, which is what every section saved before
   * this field did — so leaving it alone preserves today's rendering exactly.
   */
  seatShape?: SeatShape
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
  /** The row that generated this seat (RowData.id). Hand-placed seats have none. */
  rowId?: string | null
  /**
   * Which way this seat FACES, in degrees clockwise, 0 = up.
   *
   * Only the 'chair' seat shape draws it. NULL/undefined means "work it out" —
   * face the table if the seat rings one, the room if it stands on the stage,
   * otherwise the stage. A number here is the organizer overriding that by
   * hand, and it stops following the stage from then on.
   */
  facing?: number | null
}

// ─── Price Categories (ticket tiers projected into the builder) ─────────────

export interface TierInfo {
  id: string
  name: string
  price: number
  color: string   // assigned from TIER_PALETTE by sort order
  quantityTotal?: number   // tier's quantity_total — for capacity-vs-map validation
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

/**
 * Default size of a section's NAME on the map.
 *
 * One constant because the editor used to draw it at 14 and the buyer's map at
 * 15, so what an organizer laid out was never quite what a buyer saw. The
 * buyer's value wins: changing the editor shifts a preview, changing the buyer
 * shifts a published map.
 */
export const SECTION_LABEL_SIZE = 15

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
  /**
   * Nudge for the label, away from the middle of the shape.
   *
   * Needs NO migration and no change to the map RPC: background shapes are
   * returned to buyers straight out of canvas_data->'backgroundShapes',
   * verbatim, so a new key on a shape is already on the wire. That is the same
   * reason the stage's `role` needed nothing. Section labels are the opposite
   * — every field there is listed out one by one — which is why those needed
   * a column.
   */
  labelDX?: number
  labelDY?: number
  rotation?: number
  imageUrl?: string
  opacity?: number
  scale?: number     // image display scale (1 = natural size)
  locked?: boolean   // locked images can't be dragged (for tracing floor plans)
  /** Semantic role. 'stage' = every section's front row is the one nearest this shape. */
  role?: 'stage' | null
  /**
   * Show this piece on the BUYER's map.
   *
   * Only consulted for images. Every other shape has always been drawn for
   * buyers; images alone were stripped, because they were introduced as
   * tracing aids — an organizer drops the venue's own floor plan behind the
   * canvas, draws on top of it, and the buyer has no business seeing the
   * scaffolding. For a club that is exactly backwards: the plan IS the thing
   * the buyer wants to look at. Undefined keeps the old behaviour, so no
   * existing map starts showing a tracing aid to customers.
   */
  showToBuyer?: boolean
}

// ─── Seat Appearance ────────────────────────────────────────────────────────

/**
 * 'chair' is a little top-down armchair rather than a dot, and it is the one
 * shape with a DIRECTION: each chair turns to face the shape whose role is
 * 'stage'. Geometry and facing live in src/lib/seat-map/chair.ts, shared by the
 * builder and the buyer's picker so the two cannot draw different chairs.
 */
export type SeatShape = SeatShapeName

// ─── Canvas Data (serialized JSON) ──────────────────────────────────────────

export interface CanvasData {
  canvasWidth: number
  canvasHeight: number
  backgroundShapes: BackgroundShape[]
  sections: SectionData[]
  seatRadius?: number
  seatShape?: SeatShape
  /**
   * Backdrop behind the map, for both the editor and the buyer.
   *
   * A hex string, or absent for the default white. Venues trace a dark
   * photographed floor plan and the white panel around it reads as a mistake.
   *
   * Map-wide and lives in canvas_data, so this needed NO table migration —
   * only one line in the geometry RPC to put it on the wire, the same way
   * seatRadius and seatShape already travel.
   */
  canvasBackground?: string | null
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
  selectedRowId: string | null  // selected row (label click / rows list) within the selected section
  drawingPoints: number[]       // temp points while drawing polygon
  isDrawing: boolean
  canvasWidth: number
  canvasHeight: number
  dropRow: string
  dropSeatNumber: number
  seatRadius: number            // global seat dot size (3-12)
  /** Backdrop behind the map. null = the default white. See CanvasData. */
  canvasBackground: string | null
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
