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
