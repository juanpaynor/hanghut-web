/**
 * The one list of valid seat dot shapes.
 *
 * There were THREE copies of this list before this file existed — the writer
 * that saves sections to the database (sync-live.ts), the preview bundle the
 * organizer's preview reads (preview-bundle.ts), and the buyer's renderer
 * (seat-map-picker.tsx) — and each quietly turned anything it did not
 * recognise into a circle. Adding a fourth shape therefore looked like it
 * worked in the editor and vanished the moment the map was saved.
 *
 * The DB has a FOURTH copy that this file cannot reach: the
 * `event_sections_seat_shape_check` CHECK constraint. Widening SEAT_SHAPES
 * without widening that constraint turns the silent fallback into a save that
 * fails outright. See chair-seat-shape-DEPLOY.sql.
 */

export const SEAT_SHAPES = ['circle', 'square', 'diamond', 'chair'] as const

export type SeatShapeName = (typeof SEAT_SHAPES)[number]

/**
 * A value from the canvas, the wire or the database, narrowed to a shape we can
 * draw — or null when it is anything else.
 *
 * null means "not set", which every caller reads as "fall back": a section
 * falls back to the map-wide shape, and the map falls back to a circle. That
 * is what makes every map saved before a given shape existed keep rendering
 * exactly as it did.
 */
export function normaliseSeatShape(v: unknown): SeatShapeName | null {
    return typeof v === 'string' && (SEAT_SHAPES as readonly string[]).includes(v)
        ? (v as SeatShapeName)
        : null
}
