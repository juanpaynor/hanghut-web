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

// ─── Chairs that are PICTURE, not inventory ────────────────────────────────

/**
 * A piece that sells WHOLE: one row of inventory, many bums on seats.
 *
 * `sellWholeUpdates` deletes the chairs and leaves exactly one seat at the
 * centre of the outline, because that seat IS the thing that gets sold — it
 * becomes the ticket. Drawing it as a chair is what puts a lone dot in the
 * middle of a table, and deleting the chairs is what makes a six-top stop
 * looking like a six-top the moment you decide to sell it as a unit.
 *
 * Both are the same mistake: treating "chair you can see" and "seat you can
 * buy" as one idea. They are not. Below, the picture is derived and the
 * inventory is left alone.
 */
export function isWholeSellSection(
    unitCapacity: number | null | undefined,
    seatCount: number,
): boolean {
    return !!unitCapacity && unitCapacity > 0 && seatCount === 1
}

/**
 * Enough chairs drawn round the outline to show what the piece seats.
 *
 * Derived from `unitCapacity` and `polygonPoints`, both of which the builder
 * and the buyer's picker already hold — so this needs no column, no migration
 * and no change to the geometry RPC, and the two renderers cannot disagree.
 * That is the same reasoning as isRingSection above, and for the same reason:
 * the seat SHAPE has already drifted between those two renderers once.
 *
 * Capped, because `unitCapacity` is a headcount and nothing stops an organizer
 * typing 200 for a standing area. Past about a dozen the chairs stop reading as
 * chairs and become a dotted outline, so drawing more costs render time and
 * buys confusion. The cap is on the PICTURE only — the capacity itself, which
 * is what gets sold and checked, is never touched.
 */
export const MAX_DRAWN_UNIT_CHAIRS = 12

/**
 * Chairs on a TABLE, which is not the same thing as chairs evenly spaced round
 * a shape.
 *
 * seatsAroundOutline spreads by arc length, which is right for a round table
 * and wrong for a rectangle at small counts: a 96x56 four-top comes out with
 * ONE chair on each of the four sides, including the two ends, which is not
 * how anybody lays out a four-top. People sit on the long sides; the ends are
 * a last resort.
 *
 * Proportional allocation cannot express that. Both the largest-remainder and
 * the highest-averages methods hand a 96x56 rectangle one chair per side for
 * n=4, because 56 is simply not much smaller than 96/2 = 48. The rule has to
 * be about what an end IS, not about how long it is.
 *
 * So: fill the two long sides first, and only spill onto the ends when the
 * long sides are genuinely full — full meaning no room left at `minSpacing`
 * apart, not meaning some ratio.
 *
 * Narrow on purpose. It applies ONLY to a four-vertex outline that is actually
 * elongated. Everything else — a polygonised circle, a hand-drawn shape, a
 * square table where one chair per side is correct — falls through to the
 * original even spacing untouched.
 */
const ELONGATED_RATIO = 1.3

/**
 * A placed chair: where it sits AND which way it looks.
 *
 * The angle has to travel with the position. Pointing every chair at the
 * table's CENTROID is right for a round table and visibly wrong for a
 * rectangle: a chair sitting a quarter of the way along a 96-wide edge is
 * diagonal from the centre, so it gets rotated diagonally and the four chairs
 * splay outwards like a pinwheel. A chair at a table faces the EDGE IT SITS
 * AT, square on, however far along it is.
 */
export interface PlacedChair { x: number; y: number; facing: number }

/**
 * Konva rotation (degrees, clockwise) that turns a chair drawn facing UP so it
 * looks along (dx, dy).
 *
 * Deliberately a copy of chairFacing() in chair.ts rather than an import:
 * chair.ts already imports isRingSection and polygonCentroid from this file,
 * so importing back would make a cycle. If one changes, change both.
 */
function facingTowards(dx: number, dy: number): number {
    if (dx === 0 && dy === 0) return 0
    return (Math.atan2(dx, -dy) * 180) / Math.PI
}

/** Even spacing round a shape, each chair looking at the middle. Correct for a
 *  round table, and the fallback for everything that is not an oblong quad. */
function evenlyWithFacing(polygonPoints: number[], count: number, gap: number): PlacedChair[] {
    const c = polygonCentroid(polygonPoints)
    return seatsAroundOutline(polygonPoints, count, gap)
        .map(p => ({ ...p, facing: facingTowards(c.x - p.x, c.y - p.y) }))
}

export function chairsOnTableOutline(
    polygonPoints: number[],
    count: number,
    gap: number,
    minSpacing: number,
): PlacedChair[] {
    const v = flatToVertices(polygonPoints)
    if (v.length < 3 || count < 1) return []
    if (v.length !== 4) return evenlyWithFacing(polygonPoints, count, gap)

    const edges = v.map((a, i) => {
        const b = v[(i + 1) % v.length]
        return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y), i }
    })
    const longest = Math.max(...edges.map(e => e.len))
    const shortest = Math.min(...edges.map(e => e.len))
    // A square table seats one per side and is already correct.
    if (shortest <= 0 || longest / shortest < ELONGATED_RATIO) {
        return evenlyWithFacing(polygonPoints, count, gap)
    }

    // In a quad the two long sides are always opposite: i and i+2.
    const li = edges.reduce((best, e) => (e.len > edges[best].len ? e.i : best), 0)
    const order = [
        edges[li], edges[(li + 2) % 4],          // long sides first
        edges[(li + 1) % 4], edges[(li + 3) % 4], // then the ends
    ]
    const capacity = order.map(e => Math.max(1, Math.floor(e.len / Math.max(minSpacing, 1e-6))))

    // Round-robin within each pair before moving on, so four chairs land 2+2
    // across the long sides rather than 4 on one of them.
    const take = [0, 0, 0, 0]
    let left = count
    for (const pair of [[0, 1], [2, 3]]) {
        while (left > 0 && pair.some(k => take[k] < capacity[k])) {
            for (const k of pair) {
                if (left === 0) break
                if (take[k] < capacity[k]) { take[k]++; left-- }
            }
        }
        if (left === 0) break
    }
    // More chairs than the table can physically hold: put the rest back into
    // even spacing rather than stacking them on top of each other.
    if (left > 0) return evenlyWithFacing(polygonPoints, count, gap)

    const centre = polygonCentroid(polygonPoints)
    const out: PlacedChair[] = []
    order.forEach((e, k) => {
        const n = take[k]
        if (n < 1) return
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y
        const len = Math.hypot(dx, dy)
        if (len <= 0) return
        let nx = dy / len, ny = -dx / len
        const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2
        // Sign from the centre, not winding order, so a shape drawn clockwise
        // and one drawn anticlockwise both seat their chairs on the outside.
        if ((mx - centre.x) * nx + (my - centre.y) * ny < 0) { nx = -nx; ny = -ny }
        // Square to the edge, not aimed at the middle. nx,ny points away from
        // the table, so the chair looks along its negation.
        const facing = facingTowards(-nx, -ny)
        for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n
            out.push({
                x: e.a.x + dx * t + nx * gap,
                y: e.a.y + dy * t + ny * gap,
                facing,
            })
        }
    })
    return out
}

export function unitChairPositions(
    polygonPoints: number[] | null | undefined,
    unitCapacity: number | null | undefined,
    seatRadius: number,
    /**
     * event_sections.chair_scale. One value, three meanings, so the UI cannot
     * express the contradiction "hidden, size 2":
     *   null/undefined -> default size (every section that exists today)
     *   0              -> NO CHAIRS
     *   0.1-3          -> multiplier on the map's seat radius
     * Anything else — a negative, a NaN, a string that slipped through — is
     * read as "not set" rather than trusted, the same way unit_capacity is.
     */
    chairScale?: number | null,
): PlacedChair[] {
    if (chairScale === 0) return []
    const scale = typeof chairScale === 'number' && Number.isFinite(chairScale) && chairScale > 0
        ? Math.min(chairScale, 3)
        : 1
    seatRadius = seatRadius * scale
    if (!polygonPoints || polygonPoints.length < 6) return []
    const n = Math.min(Math.floor(unitCapacity ?? 0), MAX_DRAWN_UNIT_CHAIRS)
    if (n < 1) return []
    // CONCAVE outlines get nothing, for the reason isConvexOutline exists:
    // seatsAroundOutline pushes each chair along its edge's outward normal,
    // and at an inward corner that normal points INTO the notch. Measured on
    // the real catalogue, the U, C and L booths each put two of their chairs
    // inside their own outline. checkSeatIndividually already refuses those
    // shapes; drawing them here would reintroduce the same bug as decoration,
    // and a booth with chairs on the table is worse than a booth with none.
    if (!isConvexOutline(polygonPoints)) return []
    // A chair is 2 radii wide (see CHAIR.back), so 2.4 leaves a little air
    // between neighbours at the tightest packing this will produce.
    return chairsOnTableOutline(
        polygonPoints, n, seatRadius * CHAIR_GAP_FACTOR, seatRadius * 2.4,
    )
}
