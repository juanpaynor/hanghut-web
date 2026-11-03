/**
 * Point-in-polygon test using ray casting algorithm.
 * Determines whether a point (px, py) lies inside a polygon
 * defined by an array of vertices.
 */
export function pointInPolygon(
  px: number,
  py: number,
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Get the bounding box of a polygon.
 */
export function getPolygonBounds(polygon: { x: number; y: number }[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * Convert a flat array of floats [x1,y1,x2,y2,...] to vertex objects.
 */
export function flatToVertices(flat: number[]): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = []
  for (let i = 0; i < flat.length; i += 2) {
    vertices.push({ x: flat[i], y: flat[i + 1] })
  }
  return vertices
}

/**
 * Convert vertex objects to a flat array.
 */
export function verticesToFlat(vertices: { x: number; y: number }[]): number[] {
  return vertices.flatMap((v) => [v.x, v.y])
}

/**
 * A point guaranteed to lie INSIDE the outline, for the single seat to sit on.
 *
 * Used wherever a piece that sells WHOLE needs its single seat placed: the
 * seat is the inventory row, and the dot drawn for it must sit on the piece.
 *
 * The bounding-box centre is right for a rectangle and wrong for anything
 * concave: on a horseshoe, a U or an L it lands in the gap, so the dot would
 * float outside the piece it belongs to. Tried in order of how natural the
 * result looks, falling back to a scan that cannot fail on any polygon with
 * area.
 */
export function interiorPoint(polygonPoints: number[]): { x: number; y: number } {
  const verts = flatToVertices(polygonPoints)
  const xs = verts.map((v) => v.x)
  const ys = verts.map((v) => v.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  const bboxCentre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  if (pointInPolygon(bboxCentre.x, bboxCentre.y, verts)) return bboxCentre

  const mean = {
    x: xs.reduce((a, b) => a + b, 0) / xs.length,
    y: ys.reduce((a, b) => a + b, 0) / ys.length,
  }
  if (pointInPolygon(mean.x, mean.y, verts)) return mean

  // Coarse scan, centre-out, so a C booth gets a dot near the middle of its
  // band rather than in a corner.
  const STEPS = 12
  let best: { x: number; y: number; d: number } | null = null
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = minX + ((maxX - minX) * i) / STEPS
      const y = minY + ((maxY - minY) * j) / STEPS
      if (!pointInPolygon(x, y, verts)) continue
      const d = (x - bboxCentre.x) ** 2 + (y - bboxCentre.y) ** 2
      if (!best || d < best.d) best = { x, y, d }
    }
  }
  // A degenerate outline (zero area, all points collinear) leaves nothing
  // inside. The bbox centre is then as good an answer as exists.
  return best ? { x: best.x, y: best.y } : bboxCentre
}
