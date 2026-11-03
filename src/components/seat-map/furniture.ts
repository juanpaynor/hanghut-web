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

import { interiorPoint } from './algorithms/point-in-polygon'
import { scaleOutline, type SavedPiece } from '@/lib/seat-map/saved-piece'
import type { BackgroundShape, SectionData, SectionType } from './types'

export type FurnitureKind = 'sellable' | 'decor'

/** Palette drawers, in the order they are shown.
 *
 *  'saved' is deliberately NOT in FURNITURE_GROUPS below: it holds the venue's
 *  own pieces, which come from the database rather than this file, and its
 *  drawer needs different chrome (a delete on each row). It exists in the union
 *  only so a saved piece can be handed to the same code as a built-in one. */
export type FurnitureGroup = 'tables' | 'booths' | 'stage' | 'venue' | 'saved'

export const FURNITURE_GROUPS: { key: FurnitureGroup; title: string; note: string }[] = [
  { key: 'tables', title: 'Tables & seats', note: 'Sells whole. Give it a price.' },
  { key: 'booths', title: 'Booths & lounge', note: 'Sells whole. Give it a price.' },
  { key: 'stage', title: 'Stage & floor', note: 'Decoration only. Never sold.' },
  { key: 'venue', title: 'Venue', note: 'Decoration only. Never sold.' },
]

export interface FurniturePiece {
  id: string
  /** What the organizer sees in the palette and in the layers list. */
  name: string
  kind: FurnitureKind
  /** Which palette drawer it lives in. `kind` drives BEHAVIOUR (sold vs decor);
   *  this drives only where it is filed, because one drawer of fourteen is a
   *  scroll, not a menu. */
  group: FurnitureGroup
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

/**
 * A corner booth: an L hugging the top wall and the left wall, so it drops into
 * the corner of a room the way the real thing does. Traced clockwise from the
 * outer corner, out along the back, in, down the inside, and back to the corner.
 */
function lBooth(w: number, h: number): number[] {
  const t = Math.max(10, Math.min(w, h) * 0.38) // seat depth
  return [
    0, 0,
    w, 0,
    w, t,
    t, t,
    t, h,
    0, h,
  ]
}

/**
 * A half-round booth — the curved sofa that sits with its flat back against a
 * wall and its dome facing the room. Swept as half an ellipse so a resize still
 * reads as a half-round rather than snapping to a circle; the flat edge is
 * closed implicitly, since both renderers draw a section as a CLOSED Line.
 */
function halfRound(w: number, h: number, segments = 16): number[] {
  const cx = w / 2
  const pts: number[] = []
  // Screen coords (y grows downward): sweeping 180 to 360 puts the dome on top
  // and leaves the flat side along y = h, which is the wall.
  for (let i = 0; i <= segments; i++) {
    const a = ((180 + (180 * i) / segments) * Math.PI) / 180
    pts.push(cx + (w / 2) * Math.cos(a), h + h * Math.sin(a))
  }
  return pts
}

// ─── The catalogue ──────────────────────────────────────────────────────────

const SELLABLE_COLOR = '#f59e0b'
const DECOR_COLOR = '#94a3b8'

export const FURNITURE: FurniturePiece[] = [
  // ── Tables & seats: sold whole, one price per piece ──
  {
    id: 'table-round',
    name: 'Round table',
    kind: 'sellable', group: 'tables',
    w: 72, h: 72, pax: 8,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: circle,
  },
  {
    id: 'table-square',
    name: 'Square table',
    kind: 'sellable', group: 'tables',
    w: 60, h: 60, pax: 4,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'table-rect',
    name: 'Rectangular table',
    kind: 'sellable', group: 'tables',
    w: 96, h: 56, pax: 6,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'table-long',
    name: 'Long / communal table',
    kind: 'sellable', group: 'tables',
    w: 240, h: 60, pax: 12,
    labelPrefix: 'Table', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'hi-top',
    name: 'Cocktail hi-top',
    kind: 'sellable', group: 'tables',
    w: 48, h: 48, pax: 4,
    labelPrefix: 'Hi-top', sectionType: 'box',
    color: SELLABLE_COLOR, outline: circle,
  },
  {
    id: 'banquette',
    name: 'Banquette',
    kind: 'sellable', group: 'tables',
    w: 160, h: 44, pax: 6,
    labelPrefix: 'Banquette', sectionType: 'box',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'bar-stool',
    name: 'Bar stool',
    kind: 'sellable', group: 'tables',
    w: 26, h: 26, pax: 1,
    labelPrefix: 'Stool', sectionType: 'standing',
    color: SELLABLE_COLOR, outline: circle,
  },

  // ── Booths & lounge: also sold whole, but the premium shapes ──
  {
    id: 'booth-u',
    name: 'U booth',
    kind: 'sellable', group: 'booths',
    w: 110, h: 90, pax: 8,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: uBooth,
  },
  {
    id: 'booth-c',
    name: 'C booth',
    kind: 'sellable', group: 'booths',
    w: 100, h: 100, pax: 6,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: cBooth,
  },
  {
    id: 'booth-l',
    name: 'Corner (L) booth',
    kind: 'sellable', group: 'booths',
    w: 120, h: 120, pax: 8,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: lBooth,
  },
  {
    id: 'booth-half-round',
    name: 'Half-round booth',
    kind: 'sellable', group: 'booths',
    w: 120, h: 64, pax: 6,
    labelPrefix: 'Booth', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: halfRound,
  },
  {
    id: 'daybed',
    name: 'Daybed / cabana',
    kind: 'sellable', group: 'booths',
    w: 130, h: 70, pax: 6,
    labelPrefix: 'Cabana', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'sofa',
    name: 'Lounge sofa',
    kind: 'sellable', group: 'booths',
    w: 120, h: 52, pax: 4,
    labelPrefix: 'Lounge', sectionType: 'vip',
    color: SELLABLE_COLOR, outline: rect,
  },
  {
    id: 'stall',
    // A bazaar pitch and a trade-show booth are the same thing to this editor:
    // a footprint you rent out, where unitCapacity is the vendor's staff passes
    // rather than seats. One piece covers both; the organizer renames it.
    name: 'Stall / pitch',
    kind: 'sellable', group: 'booths',
    w: 90, h: 90, pax: 2,
    labelPrefix: 'Stall', sectionType: 'standing',
    color: SELLABLE_COLOR, outline: rect,
  },

  // ── Stage & floor: the things the room is pointed at ──
  {
    id: 'stage',
    decorLabel: 'STAGE',
    name: 'Stage',
    kind: 'decor', group: 'stage',
    w: 260, h: 90,
    decorShape: 'rect', role: 'stage',
    color: '#475569',
  },
  {
    id: 'dance-floor',
    decorLabel: 'DANCE FLOOR',
    name: 'Dance floor',
    kind: 'decor', group: 'stage',
    w: 220, h: 160,
    decorShape: 'rect',
    color: '#64748b',
  },
  {
    id: 'dj-booth',
    decorLabel: 'DJ',
    name: 'DJ booth',
    kind: 'decor', group: 'stage',
    w: 90, h: 60,
    decorShape: 'rect',
    color: '#475569',
  },

  // ── Venue: landmarks that make a map readable, never sold ──
  {
    id: 'bar-counter',
    decorLabel: 'BAR',
    name: 'Bar counter',
    kind: 'decor', group: 'venue',
    w: 240, h: 50,
    decorShape: 'rect',
    color: DECOR_COLOR,
  },
  {
    id: 'food-counter',
    decorLabel: 'FOOD',
    name: 'Food counter',
    kind: 'decor', group: 'venue',
    w: 180, h: 50,
    decorShape: 'rect',
    color: DECOR_COLOR,
  },
  {
    id: 'merch-booth',
    decorLabel: 'MERCH',
    name: 'Merch booth',
    kind: 'decor', group: 'venue',
    w: 110, h: 60,
    decorShape: 'rect',
    color: '#4c1d95',
  },
  {
    id: 'entrance',
    name: 'Entrance',
    kind: 'decor', group: 'venue',
    decorLabel: 'ENTRANCE',
    w: 120, h: 40,
    decorShape: 'rect',
    color: '#14532d',
  },
  {
    id: 'exit',
    name: 'Exit',
    kind: 'decor', group: 'venue',
    decorLabel: 'EXIT',
    w: 120, h: 40,
    // Deliberately NOT the entrance green: on a crowded map the label is the
    // only difference, and at overview zoom the label is the first thing to go.
    decorShape: 'rect',
    color: '#7f1d1d',
  },
  {
    id: 'stairs',
    name: 'Stairs',
    kind: 'decor', group: 'venue',
    decorLabel: 'STAIRS',
    // One map per event is a hard DB constraint (UNIQUE on event_id), so a
    // second floor is drawn beside the first on the same canvas. This is what
    // tells a buyer which block is upstairs.
    w: 80, h: 120,
    decorShape: 'rect',
    color: '#475569',
  },
  {
    id: 'restroom',
    name: 'Restroom',
    kind: 'decor', group: 'venue',
    decorLabel: 'WC',
    w: 90, h: 70,
    decorShape: 'rect',
    color: '#475569',
  },
  {
    id: 'wall',
    name: 'Wall / divider',
    kind: 'decor', group: 'venue',
    w: 200, h: 14,
    decorShape: 'rect',
    color: '#334155',
  },
  {
    id: 'column',
    name: 'Column / pillar',
    kind: 'decor', group: 'venue',
    // Small and unlabelled on purpose: a pillar is the thing that ruins a
    // sightline, so it has to be placeable without becoming a label on the map.
    w: 30, h: 30,
    decorShape: 'circle',
    color: '#1e293b',
  },
  {
    id: 'planter',
    name: 'Planter',
    kind: 'decor', group: 'venue',
    w: 44, h: 44,
    decorShape: 'circle',
    color: '#5f8f6a',
  },
  {
    id: 'pool',
    name: 'Pool',
    kind: 'decor', group: 'venue',
    decorLabel: 'POOL',
    w: 220, h: 120,
    decorShape: 'rect',
    color: '#0e7490',
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
  // Must sit ON the piece. The footprint centre is in the GAP of a U, a
  // horseshoe or an L — this seat is the inventory row and the only dot the
  // editor draws for the piece, so a dot in the gap is a dot you cannot click.
  const seatAt = interiorPoint(points)
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
        x: seatAt.x,
        y: seatAt.y,
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

/**
 * A row from the venue's saved-pieces library, dressed as an ordinary palette
 * piece.
 *
 * This is the whole integration. Because a SavedPiece exposes the same
 * `outline(w, h)` signature the built-in generators use, everything downstream
 * works untouched: the palette swatch draws it, createFurnitureSection places
 * it, drag-to-size resizes it, and "Sell this whole" produces the identical
 * contract. There is no second code path for custom shapes, which is the point
 * — a custom piece that behaved slightly differently from a catalogue one
 * would be a second-class citizen and would drift.
 *
 * The id is namespaced `saved:<uuid>` so it cannot collide with a built-in id,
 * and so findPiece() returning null for it is a clear signal to look in the
 * library instead.
 */
export function savedToPiece(saved: SavedPiece): FurniturePiece {
  return {
    id: `saved:${saved.id}`,
    name: saved.name,
    kind: 'sellable',
    group: 'saved',
    w: saved.w,
    h: saved.h,
    pax: saved.pax,
    // The piece's own name becomes the ticket's section name ("Corner booth 3"),
    // which is what gets read out at the door.
    labelPrefix: saved.name,
    sectionType: saved.sectionType ?? 'box',
    color: saved.color ?? SELLABLE_COLOR,
    outline: (w, h) => scaleOutline(saved, w, h),
  }
}

/** True for an id minted by savedToPiece. */
export function isSavedPieceId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('saved:')
}
