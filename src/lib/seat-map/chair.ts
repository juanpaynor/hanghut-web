/**
 * The "chair" seat shape: a little top-down armchair instead of a dot.
 *
 * Shared by the BUILDER and the BUYER'S PICKER on purpose. The seat dot shape
 * has been wrong this way before — the editor offered circle/square/diamond for
 * months while the picker hardcoded a circle, so organizers chose a shape, saw
 * it in the builder, and buyers got circles anyway. Geometry and facing both
 * live here so the two renderers cannot drift again.
 *
 * No migration is needed for the MAP-WIDE shape: get_event_seat_geometry
 * returns canvas_data->>'seatShape' verbatim with no whitelist, and
 * background_shapes is canvas_data->'backgroundShapes' verbatim, so the stage's
 * role is already on the wire. A PER-SECTION chair does need the
 * event_sections_seat_shape_check constraint widened — see
 * chair-seat-shape-DEPLOY.sql.
 */

import { isRingSection, polygonCentroid } from './table-seats'
import { flatToVertices, pointInPolygon } from '@/components/seat-map/algorithms/point-in-polygon'

/** Anything with enough on it to find a centre. Loose on purpose: the builder's
 *  BackgroundShape and the picker's MapBackgroundShape are separate types for
 *  the same JSON. */
export interface StageLike {
    type?: string
    x: number
    y: number
    width?: number
    height?: number
    radius?: number
    points?: number[]
    label?: string | null
    role?: string | null
}

export interface Point { x: number; y: number }

/**
 * The stage's centre, or null when the map has no stage.
 *
 * Same precedence as findStage() in rows.ts, which already decides each
 * section's front row: the explicit role wins, then a shape literally labelled
 * STAGE. Keeping the two in step matters — if a chair faces one way and
 * best-available numbers the rows from the other, the map contradicts itself.
 */
export function stageCenter(shapes: readonly StageLike[] | null | undefined): Point | null {
    if (!shapes || shapes.length === 0) return null
    const s =
        shapes.find((v) => v.role === 'stage') ??
        shapes.find((v) => (v.label ?? '').trim().toUpperCase() === 'STAGE')
    if (!s) return null

    if (s.type === 'circle') return { x: s.x, y: s.y }
    if (s.points && s.points.length >= 2) {
        let x = 0, y = 0, n = 0
        for (let i = 0; i < s.points.length; i += 2) { x += s.points[i]; y += s.points[i + 1]; n++ }
        return n > 0 ? { x: s.x + x / n, y: s.y + y / n } : { x: s.x, y: s.y }
    }
    return { x: s.x + (s.width ?? 60) / 2, y: s.y + (s.height ?? 60) / 2 }
}

/**
 * Konva rotation (degrees, clockwise) that turns a chair drawn facing UP so it
 * faces the stage instead.
 *
 * Per SEAT, not per section. A section curved around a stage has its end seats
 * genuinely angled differently from its middle ones, and one angle for the
 * whole block would splay them. The cost is an atan2 per seat per render, which
 * is nothing next to the Konva node it decorates.
 *
 * With no stage on the map every chair faces up — the convention every theatre
 * plan already uses, and the same direction the editor's default view treats as
 * "front".
 */
export function chairFacing(seat: Point, stage: Point | null): number {
    if (!stage) return 0
    const dx = stage.x - seat.x
    const dy = stage.y - seat.y
    // A chair sitting exactly on the stage centre has no direction to face.
    // Returning 0 keeps it upright instead of snapping to an arbitrary angle.
    if (dx === 0 && dy === 0) return 0
    // Konva rotates clockwise, and rotating by t maps "up" (0,-1) to
    // (sin t, -cos t). Solving for the direction (dx, dy) gives atan2(dx, -dy).
    return (Math.atan2(dx, -dy) * 180) / Math.PI
}

/**
 * The chair itself, in local coordinates around its own centre, as multiples of
 * the seat radius r. Drawn facing UP: the occupant looks toward -y, so the
 * backrest is the bar BEHIND them at +y.
 *
 * Two rounded rectangles, deliberately. A seat dot is often 6-10px on screen,
 * where armrests and legs collapse into mud; a pad and a back still read as a
 * chair, and still read as a blob of the right colour when they don't.
 */
export interface ChairBox {
    x: number; y: number; w: number; h: number
    /** One radius, or Konva's [topLeft, topRight, bottomRight, bottomLeft]. */
    r: number | readonly [number, number, number, number]
}

export const CHAIR: { readonly back: ChairBox; readonly pad: ChairBox } = {
    /**
     * The backrest. Drawn FIRST so the pad sits on top of it.
     *
     * It starts at y = 0.15, well under the pad's lower edge at 0.55, so the
     * two overlap by 0.4r rather than merely touching. Two rounded rectangles
     * that only touch leave a notch at each side of the joint, which at an
     * 8px seat dot reads as a dirty mark rather than a chair.
     */
    back: { x: -1.0, y: 0.15, w: 2.0, h: 0.8, r: 0.3 },
    /**
     * The seat pad, on top. Rounded at the FRONT and squarer at the back,
     * which is both how a chair cushion actually looks from above and what
     * keeps the overlap with the backrest from showing through the corners.
     */
    pad: { x: -0.82, y: -0.95, w: 1.64, h: 1.5, r: [0.5, 0.5, 0.18, 0.18] },
} as const

/** Scale one CHAIR box by the seat radius, ready to spread onto a Konva Rect. */
export function chairBox(box: ChairBox, radius: number) {
    return {
        x: box.x * radius,
        y: box.y * radius,
        width: box.w * radius,
        height: box.h * radius,
        cornerRadius: typeof box.r === 'number'
            ? box.r * radius
            : box.r.map((v) => v * radius),
    }
}

/**
 * The stage as an OUTLINE, not just a centre.
 *
 * Needed to answer "is this section standing on the stage?", which the centre
 * alone cannot. Same shape precedence as stageCenter.
 */
export function stagePolygon(shapes: readonly StageLike[] | null | undefined): number[] | null {
    if (!shapes || shapes.length === 0) return null
    const s =
        shapes.find((v) => v.role === 'stage') ??
        shapes.find((v) => (v.label ?? '').trim().toUpperCase() === 'STAGE')
    if (!s) return null

    if (s.points && s.points.length >= 6) {
        const out: number[] = []
        for (let i = 0; i < s.points.length; i += 2) out.push(s.x + s.points[i], s.y + s.points[i + 1])
        return out
    }
    if (s.type === 'circle') {
        const r = s.radius ?? Math.max(s.width ?? 60, s.height ?? 60) / 2
        const out: number[] = []
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2
            out.push(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r)
        }
        return out
    }
    const w = s.width ?? 60, h = s.height ?? 60
    return [s.x, s.y, s.x + w, s.y, s.x + w, s.y + h, s.x, s.y + h]
}

/**
 * Is this section standing ON the stage — a choir, an orchestra, on-stage VIP
 * seats? Majority again, for the same reason isRingSection uses it: one seat
 * overhanging the stage edge must not re-point the whole block.
 */
export function isOnStage(
    seats: readonly Point[],
    stagePoly: number[] | null | undefined,
): boolean {
    if (!stagePoly || stagePoly.length < 6 || seats.length === 0) return false
    const poly = flatToVertices(stagePoly)
    let on = 0
    for (const s of seats) if (pointInPolygon(s.x, s.y, poly)) on++
    return on * 2 > seats.length
}

/**
 * Where the room is: the average of the other sections' outlines.
 *
 * This is what an on-stage section faces. Built from OUTLINES rather than
 * seats on purpose — the buyer's picker lazy-loads seats one section at a
 * time, so it can never see every seat on the map, but it does receive
 * polygon_points for every section up front. Outlines are the only audience
 * measure both renderers can agree on.
 *
 * Sections that are themselves on the stage are excluded, or a map whose only
 * seating IS on the stage would have the chairs face their own middle again.
 */
export function audienceCenter(
    sectionOutlines: readonly (number[] | null | undefined)[],
    stagePoly: number[] | null | undefined,
): Point | null {
    const stageVerts = stagePoly && stagePoly.length >= 6 ? flatToVertices(stagePoly) : null
    let x = 0, y = 0, n = 0
    for (const o of sectionOutlines) {
        if (!o || o.length < 6) continue
        const c = polygonCentroid(o)
        if (stageVerts && pointInPolygon(c.x, c.y, stageVerts)) continue
        x += c.x; y += c.y; n++
    }
    return n > 0 ? { x: x / n, y: y / n } : null
}

/**
 * What a section's chairs should look at.
 *
 * Three kinds of seating, and the geometry tells them apart:
 *   - chairs RINGING an outline are a table, and they face the table
 *   - seats standing ON the stage are the show, and they face the ROOM
 *   - everything else is an audience, and it faces the stage
 *
 * The middle case is not a nicety. Without it "face the stage" has no answer
 * for a section already on the stage, so every chair aimed at the stage's own
 * centre and the block pointed at itself — the left half facing right, the
 * right half facing left. A choir faces the audience and an on-stage VIP seat
 * faces the performer at the front; both mean the same direction, out into the
 * room, so there is no ambiguity to resolve.
 *
 * Working all of this out from geometry rather than a stored flag is what lets
 * the buyer's picker reach the same answer as the builder. The picker already
 * receives polygon_points for every section, so it needs no new column, no
 * migration and no change to the geometry RPC — and there is no fifth list to
 * keep in step (see seat-shape.ts for what that costs).
 *
 * Returns null when there is nothing to face, and chairFacing turns null into
 * "upright", so a map with no stage and no tables still renders sensibly.
 */
export function chairTarget(
    polygonPoints: number[] | null | undefined,
    seats: readonly Point[],
    stage: Point | null,
    onStage?: { stagePoly: number[] | null; audience: Point | null },
): Point | null {
    if (polygonPoints && isRingSection(polygonPoints, seats)) {
        return polygonCentroid(polygonPoints)
    }
    if (onStage && isOnStage(seats, onStage.stagePoly)) {
        // Face the room. If there is no room to face — the stage is the only
        // seating on the map — fall through to upright rather than back to the
        // stage centre, which is the huddle this case exists to prevent.
        return onStage.audience
    }
    return stage
}

/**
 * The angle a seat is actually drawn at: its own stored facing when the
 * organizer has set one, otherwise the derived answer.
 *
 * Having one function for this matters more than it looks. The builder and the
 * buyer's picker each decide a chair's angle independently, and the seat SHAPE
 * has already been wrong this way once — the editor offered three shapes for
 * months while the picker hardcoded a circle. An override that only one of
 * them honoured would be the same bug with a different column.
 */
export function seatFacing(
    seat: { x: number; y: number; facing?: number | null },
    target: Point | null,
): number {
    return typeof seat.facing === 'number' && Number.isFinite(seat.facing)
        ? seat.facing
        : chairFacing({ x: seat.x, y: seat.y }, target)
}

/** Degrees folded into (-180, 180], so a stored facing never grows without
 *  bound as the organizer keeps nudging it round. */
export function normaliseDegrees(deg: number): number {
    if (!Number.isFinite(deg)) return 0
    let d = deg % 360
    if (d > 180) d -= 360
    if (d <= -180) d += 360
    // -0 is a real value in JS and reads badly in a tooltip.
    return d === 0 ? 0 : d
}
