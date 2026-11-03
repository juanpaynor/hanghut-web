import type { SectionData } from '@/components/seat-map/types'

/** Outer box of a section, frame and seats together. */
export function boundsOf(section: SectionData) {
  const xs: number[] = [], ys: number[] = []
  for (let i = 0; i < section.polygonPoints.length; i += 2) {
    xs.push(section.polygonPoints[i]); ys.push(section.polygonPoints[i + 1])
  }
  for (const st of section.seats) { xs.push(st.x); ys.push(st.y) }
  if (xs.length === 0) return null
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

/**
 * Nudge a drag so the piece lines up with one already on the map.
 *
 * Snapping is to OTHER PIECES, not to the background grid. The grid is drawn at
 * 50 units, which is twice a bar stool and would make small furniture
 * unplaceable; and what an organizer is actually trying to do is get this booth
 * level with that booth, which a grid only achieves by accident. Left, centre
 * and right edges all attract, as do top, middle and bottom, so a row of mixed
 * sizes can be lined up on whichever edge matters.
 *
 * The tolerance is in SCREEN pixels, divided by zoom, so snapping feels the same
 * whether you are zoomed out over a whole arena or in on one table.
 */
export function snapDrag(
  dragged: SectionData,
  dx: number,
  dy: number,
  others: SectionData[],
  tolerance: number,
): { dx: number; dy: number } {
  const b = boundsOf(dragged)
  if (!b) return { dx, dy }

  const guidesX: number[] = []
  const guidesY: number[] = []
  for (const o of others) {
    const ob = boundsOf(o)
    if (!ob) continue
    guidesX.push(ob.minX, ob.cx, ob.maxX)
    guidesY.push(ob.minY, ob.cy, ob.maxY)
  }
  if (guidesX.length === 0) return { dx, dy }

  // Try all three of our own edges against every guide and keep the closest
  // single match, so one drag never gets pulled two different ways.
  const best = (candidates: number[], guides: number[]) => {
    let bestAdjust = 0
    let bestDist = tolerance
    for (const c of candidates) {
      for (const g of guides) {
        const d = Math.abs(g - c)
        if (d < bestDist) { bestDist = d; bestAdjust = g - c }
      }
    }
    return bestAdjust
  }

  const adjX = best([b.minX + dx, b.cx + dx, b.maxX + dx], guidesX)
  const adjY = best([b.minY + dy, b.cy + dy, b.maxY + dy], guidesY)
  return { dx: dx + adjX, dy: dy + adjY }
}

