/**
 * A piece a venue drew itself and saved, so it can be placed again on the next
 * event at that venue.
 *
 * The editor could already draw any shape (polygon tool) and sell it whole
 * ("Sell this whole"); what it could not do was REMEMBER one. A bar whose
 * booths are its own redrew them from scratch every event.
 *
 * ── Why the outline is stored LOCAL ────────────────────────────────────────
 *
 * The section it came from has absolute canvas coordinates — wherever the
 * organizer happened to draw it. Stored that way, placing it on a different
 * map would mean first undoing its old position, and two pieces saved from
 * opposite corners of a canvas would behave differently. So the outline is
 * normalised to origin 0,0 on save, which makes placing it a translate and
 * nothing else — the same contract the built-in catalogue's outline generators
 * already satisfy.
 *
 * Everything in this file is pure: it is shared by the server action (which
 * must reject what the database would refuse, with a sentence an organizer can
 * act on) and by the editor (which turns a saved row back into an ordinary
 * palette piece).
 */

import type { SectionType } from '@/components/seat-map/types'

export interface SavedPiece {
  id: string
  name: string
  /** Flat [x,y,x,y,...] in LOCAL coords, origin 0,0. */
  outline: number[]
  w: number
  h: number
  pax: number
  sectionType: SectionType | null
  color: string | null
}

/** Mirrors the CHECK constraint on partner_furniture.section_type. */
export const SECTION_TYPES: SectionType[] = ['vip', 'general', 'floor', 'box', 'balcony', 'standing']

/** Mirrors partner_furniture_outline_shape. 512 coords = 256 points, far more
 *  than the smoothest built-in (a 24-point circle), and the cap is what stops
 *  an unbounded blob being read on every editor load. */
export const MAX_OUTLINE_COORDS = 512
export const MIN_OUTLINE_COORDS = 6
export const MAX_NAME_LEN = 60

export interface Normalised {
  outline: number[]
  w: number
  h: number
}

/**
 * Absolute canvas points → local, origin 0,0, plus the footprint they fill.
 *
 * Rounded to 2dp: drag-to-size produces values like 167.92420212765956, and
 * sub-pixel precision in a stored venue shape is noise that only inflates the
 * jsonb. Rounding happens BEFORE the size is measured so w/h agree with the
 * points they describe.
 */
export function normaliseOutline(absolute: number[]): Normalised {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < absolute.length; i += 2) {
    xs.push(absolute[i])
    ys.push(absolute[i + 1])
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const round = (n: number) => Math.round(n * 100) / 100
  const outline: number[] = []
  for (let i = 0; i < absolute.length; i += 2) {
    outline.push(round(absolute[i] - minX), round(absolute[i + 1] - minY))
  }
  const lxs = outline.filter((_, i) => i % 2 === 0)
  const lys = outline.filter((_, i) => i % 2 === 1)
  return { outline, w: Math.max(...lxs), h: Math.max(...lys) }
}

/**
 * A stored outline redrawn into a (w, h) box — the signature the catalogue's
 * own generators use, so a saved piece drops into every existing path (the
 * palette swatch, placement, drag-to-size) with no special case anywhere.
 *
 * A degenerate stored size cannot scale, so it is passed through rather than
 * dividing by zero: a piece saved from a zero-height outline is already
 * broken, and returning NaN coordinates would take the whole canvas with it.
 */
export function scaleOutline(piece: SavedPiece, w: number, h: number): number[] {
  const sx = piece.w > 0 ? w / piece.w : 1
  const sy = piece.h > 0 ? h / piece.h : 1
  const out: number[] = []
  for (let i = 0; i < piece.outline.length; i += 2) {
    out.push(piece.outline[i] * sx, piece.outline[i + 1] * sy)
  }
  return out
}

/**
 * Everything the database would refuse, refused here first with a reason.
 *
 * A constraint violation surfaces to an organizer as an opaque Postgres error
 * and loses their work; these are the same rules stated in words. Returns null
 * when the piece is fine.
 */
export function validateSavedPiece(input: {
  name: string
  outline: number[]
  w: number
  h: number
  pax: number
  sectionType?: string | null
}): string | null {
  const name = input.name.trim()
  if (name.length === 0) return 'Give the piece a name first.'
  if (name.length > MAX_NAME_LEN) return `That name is too long — keep it under ${MAX_NAME_LEN} characters.`

  if (!Array.isArray(input.outline)) return 'That piece has no outline to save.'
  if (input.outline.length % 2 !== 0) return 'That outline is malformed (an odd number of coordinates).'
  if (input.outline.length < MIN_OUTLINE_COORDS) return 'A shape needs at least three corners.'
  if (input.outline.length > MAX_OUTLINE_COORDS) {
    return `That shape has ${input.outline.length / 2} corners, more than the ${MAX_OUTLINE_COORDS / 2} a saved piece can hold. Simplify it first.`
  }
  if (input.outline.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    return 'That outline contains invalid coordinates.'
  }

  if (!(input.w > 0) || !(input.h > 0)) return 'That piece has no size.'
  if (!Number.isFinite(input.pax) || input.pax < 1) return 'Say how many people it admits (at least 1).'
  if (input.sectionType != null && !SECTION_TYPES.includes(input.sectionType as SectionType)) {
    return 'Unknown section type.'
  }
  return null
}
