/**
 * Furniture catalogue for the seat map editor — the pieces a club, bar or
 * restaurant actually has on its floor.
 *
 * ── Why these pieces are built the way they are ─────────────────────────────
 *
 * A sellable piece becomes a SECTION whose polygonPoints trace its outline.
 * A decor piece becomes a BACKGROUND SHAPE, and only ever a 'rect' or 'circle'.
 *
 * That split is deliberate and it is about not breaking live maps:
 *
 *   - Section polygons are drawn from `points` by both the editor
 *     (canvas-builder SectionGroup) and the buyer (seat-map-picker
 *     SectionShape), as a closed Konva Line, identically. That path is
 *     exercised by every seat map in production, including a 26-section PICC
 *     map, so an arbitrary outline — a U, a horseshoe, a 24-gon circle — is
 *     already safe to ship with no renderer change at all.
 *
 *   - Background shapes are NOT so lucky. Of the eight declared ShapeTypes,
 *     production maps only ever contain 'image' (16 maps) and labelled 'rect'
 *     (13 shapes). The untested ones disagree between the two renderers:
 *     'polygon' is drawn from width/height as a plain rectangle by the buyer
 *     and is not handled AT ALL by the editor (it falls through to null), so a
 *     polygon decor piece would be invisible to the organizer who placed it and
 *     a rectangle to the buyer. 'rect' and 'circle' are the only two that both
 *     renderers draw the same way from the same fields, so decor uses only
 *     those. Do not reach for 'polygon' here until those two agree.
 *
 * The upshot: adding to this file needs no migration, no renderer change and no
 * new ShapeType. Nothing an existing map contains is touched.
 */

import type { BackgroundShape, SectionData, SectionType } from './types'

export type FurnitureKind = 'sellable' | 'decor'

export interface FurniturePiece {
  id: string
  /** What the organizer sees in the palette and in the layers list. */
  name: string
  kind: FurnitureKind
  /** Default footprint in canvas units. */
  w: number
  h: number
  /** Sellable only: how many people it admits out of the box. */
  pax?: number
  /** Sellable only: seeds the section label, numbered per piece type. */
  labelPrefix?: string
  sectionType?: SectionType
  /** Decor only: which of the two safe primitives to emit. */
  decorShape?: 'rect' | 'circle'
  /** Decor only: marks the stage, which drives front-row ordering. */
  role?: 'stage'
  /** Decor only: the text drawn on the piece. Omitted where it would not fit —
   *  a 14-unit-tall divider or a 44-unit planter is unreadable with text on it,
   *  and both renderers centre the label without measuring. */
  decorLabel?: string
  color: string
  /** Outline generator, in local coords from (0,0) to (w,h). Sellable only. */
  outline?: (w: number, h: number) => number[]
}

// ─── Outline generators ─────────────────────────────────────────────────────

/** Plain rectangle, clockwise from the top-left. */
function rect(w: number, h: number): number[] {
  return [0, 0, w, 0, w, h, 0, h]
}

/**
 * A circle as a polygon. 24 segments is smooth at every zoom the picker allows
 * and still cheap: a 25-table room costs 600 points, against the 718-seat
 * TRESPASSING map which already ships thousands.
 */
function circle(w: number, h: number, segments = 24): number[] {
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2
  const ry = h / 2
  const pts: number[] = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
  return pts
}

/**
 * A U-shaped booth, opening toward the bottom of the canvas (the room side,
 * with the table in the mouth of the U). Traced as one closed outline: across
 * the back, down the right arm, back up the inside, and down the left arm.
 */
function uBooth(w: number, h: number): number[] {
  const t = Math.max(8, Math.min(w, h) * 0.34) // arm / back thickness
  return [
    0, 0,
    w, 0,
    w, h,
    w - t, h,
    w - t, t,
    t, t,
    t, h,
    0, h,
  ]
}

/**
 * A horseshoe booth: a thick arc with a gap at the bottom. Swept as an outer
 * arc one way and an inner arc back, so it closes into a crescent rather than
 * a pie slice.
 */
function cBooth(w: number, h: number): number[] {
  const cx = w / 2
  const cy = h / 2
  const outerX = w / 2
  const outerY = h / 2
  const innerScale = 0.45
  // Degrees, screen coords (y grows downward), so 90° is the bottom. Sweeping
  // 110°→430° leaves a 60° gap centred on the bottom: the way in.
  const from = 110
  const to = 430
  const steps = 20
  const pts: number[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    pts.push(cx + outerX * Math.cos(a), cy + outerY * Math.sin(a))
  }
  for (let i = steps; i >= 0; i--) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    pts.push(cx + outerX * innerScale * Math.cos(a), cy + outerY * innerScale * Math.sin(a))
  }
  return pts
}

// ─── The catalogue ──────────────────────────────────────────────────────────

const SELLABLE_COLOR = '#f59e0b'
const DECOR_COLOR = '#94a3b8'

export const FURNITURE: FurniturePiece[] = [
  // ── Sellable: these become sections you can put a price category on ──
  {
    id: 'table-round',
    name: 'Round table',
    kind: 'sellable',
    w: 72, h: 72, pax: 8,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: circle,
  },
  {
    id: 'table-rect',
    name: 'Rectangular table',
    kind: 'sellable',
    w: 96, h: 56, pax: 6,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'booth-u',
    name: 'U booth',
    kind: 'sellable',
    w: 110, h: 90, pax: 8,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: uBooth,
  },
  {
    id: 'booth-c',
    name: 'C booth',
    kind: 'sellable',
    w: 100, h: 100, pax: 6,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: cBooth,
  },
  {
    id: 'banquette',
    name: 'Banquette',
    kind: 'sellable',
    w: 160, h: 44, pax: 6,
    labelPrefix: 'Banquette', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'hi-top',
    name: 'Cocktail hi-top',
    kind: 'sellable',
    w: 48, h: 48, pax: 4,
    labelPrefix: 'Hi-top', sectionType: 'box',
    color: SELLABLE_COLOR, outline: circle,
  },
  {
    id: 'daybed',
    name: 'Daybed / cabana',
    kind: 'sellable',
    w: 130, h: 70, pax: 6,
    labelPrefix: 'Cabana', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'bar-stool',
    name: 'Bar stool',
    kind: 'sellable',
    w: 26, h: 26, pax: 1,
    labelPrefix: 'Stool', sectionType: 'standing',
    color: SELLABLE_COLOR, outline: circle,
  },

  // ── Decor: these are landmarks, never sold ──
  {
    id: 'stage',
    decorLabel: 'STAGE',
    name: 'Stage',
    kind: 'decor',
    w: 260, h: 90,
    decorShape: 'rect', role: 'stage',
    color: '#475569',
  },
  {
    id: 'dance-floor',
    decorLabel: 'DANCE FLOOR',
    name: 'Dance floor',
    kind: 'decor',
    w: 220, h: 160,
    decorShape: 'rect',
    color: '#64748b',
  },
  {
    id: 'bar-counter',
    decorLabel: 'BAR',
    name: 'Bar counter',
    kind: 'decor',
    w: 240, h: 50,
    decorShape: 'rect',
    color: DECOR_COLOR,
  },
  {
    id: 'dj-booth',
    decorLabel: 'DJ',
    name: 'DJ booth',
    kind: 'decor',
    w: 90, h: 60,
    decorShape: 'rect',
    color: '#475569',
  },
  {
    id: 'entrance',
    name: 'Entrance',
    kind: 'decor',
    decorLabel: 'ENTRANCE',
    w: 120, h: 40,
    decorShape: 'rect',
    color: '#14532d',
  },
  {
    id: 'planter',
    name: 'Planter',
    kind: 'decor',
    w: 44, h: 44,
    decorShape: 'circle',
    color: '#5f8f6a',
  },
  {
    id: 'wall',
    name: 'Wall / divider',
    kind: 'decor',
    w: 200, h: 14,
    decorShape: 'rect',
    color: '#334155',
  },
]

export function findPiece(id: string | null): FurniturePiece | null {
  if (!id) return null
  return FURNITURE.find((p) => p.id === id) ?? null
}

/**
 * Next free label for a piece type, e.g. "Booth 3".
 *
 * Takes the lowest UNUSED number rather than count+1: the section label is
 * stamped onto the ticket as seat_info.section and read out at the door, so two
 * pieces answering to one name is a real-world problem, and deleting the middle
 * one of three would otherwise mint a duplicate.
 */
export function nextPieceLabel(prefix: string, sections: SectionData[]): { label: string; n: number } {
  const taken = new Set(sections.map((s) => s.label))
  let n = 1
  while (taken.has(`${prefix} ${n}`)) n++
  return { label: `${prefix} ${n}`, n }
}

/**
 * Builds a sellable piece as a section that sells WHOLE.
 *
 * Three things make it a unit rather than an ordinary seated section:
 *   - exactly one seat, so inventory is a single row protected by the
 *     seat_holds machinery that already works, and it cannot oversell
 *   - unitCapacity, so the buyer and the door know how many fit
 *   - row labels off, since a one-seat "row" has nothing worth labelling
 *
 * x, y is the top-left of the piece's footprint.
 */
export function createFurnitureSection(
  piece: FurniturePiece,
  x: number,
  y: number,
  sections: SectionData[],
  size?: { w: number; h: number }
): SectionData {
  const w = size?.w ?? piece.w
  const h = size?.h ?? piece.h
  const outline = piece.outline ?? rect
  const local = outline(w, h)
  const points: number[] = []
  for (let i = 0; i < local.length; i += 2) {
    points.push(x + local[i], y + local[i + 1])
  }
  const { label, n } = nextPieceLabel(piece.labelPrefix ?? 'Table', sections)
  return {
    id: crypto.randomUUID(),
    label,
    color: piece.color,
    sectionType: piece.sectionType ?? 'box',
    polygonPoints: points,
    arcConfig: null,
    seatOrientation: 'straight',
    rowCount: 1,
    seatsPerRow: 1,
    gridRotation: 0,
    seats: [
      {
        id: crypto.randomUUID(),
        rowLabel: 'T',
        seatNumber: n,
        label: `T${n}`,
        // The single seat sits at the centre of the footprint, not of the
        // outline's bounding box — on a U or a horseshoe those differ, and the
        // buyer taps the polygon anyway.
        x: x + w / 2,
        y: y + h / 2,
        status: 'available',
        rowId: null,
      },
    ],
    isActive: true,
    sortOrder: sections.length,
    unitCapacity: piece.pax ?? 1,
    showRowLabels: false,
  }
}

/**
 * Builds a decor piece. Only 'rect' and 'circle' are emitted — see the note at
 * the top of this file for why the other ShapeTypes are off limits.
 *
 * x, y is the top-left of the footprint for a rect; Konva's Circle is centred
 * on its own x/y, and both renderers honour that, so a circle is offset to put
 * its centre where the organizer clicked.
 */
export function createDecorShape(
  piece: FurniturePiece,
  x: number,
  y: number,
  size?: { w: number; h: number }
): BackgroundShape {
  // Rounded: a drag gives sub-pixel sizes, and these feed a range slider whose
  // handler parseInts anyway, so a stored 167.924 was never anything but noise.
  const w = Math.round(size?.w ?? piece.w)
  const h = Math.round(size?.h ?? piece.h)
  if (piece.decorShape === 'circle') {
    const r = Math.max(6, Math.min(w, h) / 2)
    return {
      id: crypto.randomUUID(),
      type: 'circle',
      x: x + w / 2,
      y: y + h / 2,
      radius: r,
      fill: piece.color,
      // No label on a planter: at 44 units across, text only makes it unreadable.
      opacity: 1,
      role: piece.role ?? null,
    }
  }
  return {
    id: crypto.randomUUID(),
    type: 'rect',
    x,
    y,
    width: w,
    height: h,
    fill: piece.color,
    ...(piece.decorLabel
      ? { label: piece.decorLabel, fontSize: 13, fontColor: '#ffffff' }
      : {}),
    opacity: 1,
    role: piece.role ?? null,
  }
}
