/**
 * Chairs ARRANGED AROUND a table, for tables sold one seat at a time.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The roadmap decision was that a table sells BOTH ways, chosen per table:
 * whole (one price, the buyer takes the table) or per chair (eight people buy
 * eight seats). Only the first half was ever built. A furniture piece drops as
 * exactly ONE seat with a capacity — createFurnitureSection — and "Sell this
 * whole" collapses a hand-drawn section down to the same thing. There was no
 * way to get a round table with eight individually sellable chairs, which is
 * most of what a bar or a gala actually sells.
 *
 * ── The shape of the answer ─────────────────────────────────────────────────
 *
 * A per-chair table is an ORDINARY seated section whose seats happen to sit on
 * a ring outside the table outline. No new section type, no new column, no new
 * inventory concept: every seat is a row in `seats` exactly like a theatre
 * seat, so holds, best-available, the scanner and refunds all work already.
 * The only thing that is special is where the seats are, and that is geometry.
 *
 * That also decides how the chairs know which way to face. See isRingSection.
 */

import { flatToVertices, pointInPolygon } from '@/components/seat-map/algorithms/point-in-polygon'

export interface Vec { x: number; y: number }

/** Average of the vertices. Good enough for a table outline, and it is what
 *  the chairs face. */
export function polygonCentroid(points: number[]): Vec {
    const v = flatToVertices(points)
    if (v.length === 0) return { x: 0, y: 0 }
    let x = 0, y = 0
    for (const p of v) { x += p.x; y += p.y }
    return { x: x / v.length, y: y / v.length }
}

/**
 * Is this section a table with chairs around it, rather than a block of seats
 * inside an outline?
 *
 * Decided by MAJORITY, not per seat. A single seat nudged a pixel outside a
 * tightly drawn polygon must not flip a whole theatre block into "table" mode,
 * and one chair accidentally inside a round table must not be left facing the
 * wrong way while its neighbours face in.
 *
 * Deriving this from geometry rather than storing a flag is deliberate: the
 * buyer's picker already receives polygon_points for every section, so it can
 * reach the same verdict as the builder with no column, no migration and no
 * change to the geometry RPC. A stored flag would have needed all three, and
 * would then be a fifth thing to keep in step.
 */
export function isRingSection(
    polygonPoints: number[] | null | undefined,
    seats: readonly Vec[],
): boolean {
    if (!polygonPoints || polygonPoints.length < 6) return false
    if (seats.length < 2) return false
    const poly = flatToVertices(polygonPoints)
    let outside = 0
    for (const s of seats) if (!pointInPolygon(s.x, s.y, poly)) outside++
    return outside * 2 > seats.length
}

/** Total length of the closed polygon's edges. */
function perimeter(v: Vec[]): number {
    let total = 0
    for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length]
        total += Math.hypot(b.x - a.x, b.y - a.y)
    }
    return total
}

/**
 * How far outside the outline a chair sits, so it reads as pulled up TO the
 * table rather than sitting on it. A fraction of the seat radius, because the
 * whole arrangement has to stay legible when the map is zoomed out.
 */
export const CHAIR_GAP_FACTOR = 1.15

/**
 * Seat positions evenly spaced around a polygon outline, pushed outwards.
 *
 * Even spacing is by ARC LENGTH around the perimeter, which is what makes one
 * function serve every table shape:
 *   - a round table divides into equal angles, as you would expect
 *   - a square table with four chairs puts one at the middle of each side
 *   - a 96x56 rectangle with six puts two on each long side and one on each
 *     short side, because the long sides are simply longer
 * There is no per-shape special case, and adding a new outline to the
 * catalogue needs nothing here.
 *
 * Sampling starts HALF a step in. Starting at zero puts the first chair exactly
 * on a corner of a rectangle, where it reads as falling off the table; half a
 * step centres each chair in its own stretch of edge.
 */
export function seatsAroundOutline(
    polygonPoints: number[],
    count: number,
    gap: number,
): Vec[] {
    const v = flatToVertices(polygonPoints)
    if (v.length < 3 || count < 1) return []

    const total = perimeter(v)
    // A degenerate outline (every vertex in the same place) has nowhere to put
    // chairs. Returning the centre repeatedly would stack them invisibly.
    if (total <= 0) return []

    const centre = polygonCentroid(polygonPoints)
    const step = total / count
    const out: Vec[] = []

    let edge = 0
    let walked = 0            // distance consumed by completed edges
    for (let i = 0; i < count; i++) {
        const target = step * (i + 0.5)
        // Advance to the edge containing `target`.
        while (edge < v.length) {
            const a = v[edge], b = v[(edge + 1) % v.length]
            const len = Math.hypot(b.x - a.x, b.y - a.y)
            if (walked + len >= target || edge === v.length - 1) {
                const t = len > 0 ? Math.min(1, (target - walked) / len) : 0
                const px = a.x + (b.x - a.x) * t
                const py = a.y + (b.y - a.y) * t

                // Outward normal: the edge direction turned 90 degrees, with
                // the sign that points AWAY from the centre. Taking the sign
                // from the centre rather than from winding order means a
                // polygon drawn clockwise and one drawn anticlockwise both
                // seat their chairs on the outside.
                let nx = 0, ny = 0
                if (len > 0) {
                    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len
                    nx = dy; ny = -dx
                    if ((px - centre.x) * nx + (py - centre.y) * ny < 0) { nx = -nx; ny = -ny }
                } else {
                    // Zero-length edge: fall back to straight out from the centre.
                    const ox = px - centre.x, oy = py - centre.y
                    const d = Math.hypot(ox, oy)
                    if (d > 0) { nx = ox / d; ny = oy / d }
                }
                out.push({ x: px + nx * gap, y: py + ny * gap })
                break
            }
            walked += len
            edge++
        }
    }
    return out
}

/**
 * Is this outline convex — no notches, no inward corners?
 *
 * It matters because seatsAroundOutline pushes each chair along its edge's
 * outward normal, and "outward" is decided by stepping away from the centre.
 * At a CONCAVE corner those two disagree: the normal points into the notch, so
 * a chair placed near the inside of a U booth lands on the table rather than
 * at it. Measured on the real catalogue, the U, C and L booths each put two of
 * their chairs inside their own outline; every convex piece put none.
 *
 * Rather than guess at a fix for shapes nobody seats this way — a booth is a
 * booth precisely because you take the whole thing — checkSeatIndividually
 * uses this to refuse, and says so.
 *
 * Collinear points (the straight stretches of a polygonised circle, a
 * duplicated vertex) count as neither turn and are skipped. A polygon with
 * fewer than three real corners is not convex in any useful sense.
 */
export function isConvexOutline(points: number[]): boolean {
    const v = flatToVertices(points)
    if (v.length < 3) return false
    let sign = 0
    for (let i = 0; i < v.length; i++) {
        const a = v[i]
        const b = v[(i + 1) % v.length]
        const c = v[(i + 2) % v.length]
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
        // A tolerance, not zero: a 48-gon's corners are tiny turns and
        // floating point noise around a straight run must not read as one.
        if (Math.abs(cross) < 1e-9) continue
        const s = cross > 0 ? 1 : -1
        if (sign === 0) sign = s
        else if (s !== sign) return false
    }
    return sign !== 0
}
