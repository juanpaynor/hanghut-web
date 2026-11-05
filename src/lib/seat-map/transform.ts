/**
 * Rigid geometry for whole sections: bounds, rotation, translation, alignment.
 *
 * Pure and dependency-free on purpose. The reducer uses these to apply the
 * editor's Rotate and Arrange commands, and the canvas uses rotateSection
 * directly to preview a drag of the rotate handle — one implementation, so the
 * live preview and the committed result can never disagree.
 */
import type { BackgroundShape, SectionData } from '@/components/seat-map/types'
import { transformRows } from '@/lib/seat-map/rows'

export function sectionBounds(section: SectionData) {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < section.polygonPoints.length; i += 2) {
    xs.push(section.polygonPoints[i]); ys.push(section.polygonPoints[i + 1])
  }
  for (const s of section.seats) { xs.push(s.x); ys.push(s.y) }
  if (xs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

/** Bounding box of several sections together. */
export function groupBounds(sections: SectionData[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const sec of sections) {
    const b = sectionBounds(sec)
    minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX)
    minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY)
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

/**
 * Rotate a section about a point.
 *
 * The angle is BAKED INTO THE COORDINATES rather than stored as a property.
 * That is the whole reason this is safe to ship: every renderer already draws a
 * section as a closed line through arbitrary points — the editor, the buyer's
 * picker and the organizer's preview alike — so a rotated section needs no new
 * field, no migration and no renderer change. A stored angle would need all
 * three to agree about it, and any one of them forgetting would put the buyer's
 * map out of step with the editor that drew it.
 *
 * Seat IDs are untouched, so tickets already sold keep pointing at the same
 * seats. Only their coordinates move.
 */
export function rotateSection(section: SectionData, degrees: number, origin: { x: number; y: number }): SectionData {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const rot = (x: number, y: number) => {
    const dx = x - origin.x, dy = y - origin.y
    return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
  }

  const polygonPoints: number[] = []
  for (let i = 0; i < section.polygonPoints.length; i += 2) {
    const p = rot(section.polygonPoints[i], section.polygonPoints[i + 1])
    polygonPoints.push(p.x, p.y)
  }

  const seats = section.seats.map((seat) => {
    const p = rot(seat.x, seat.y)
    return { ...seat, x: p.x, y: p.y }
  })

  // Rows go through transformPath, which rebuilds an arc from three transformed
  // points — exact for a rigid rotation, and it keeps the labels attached to
  // the seats they describe.
  const rows = transformRows(section.rows, (p) => rot(p.x, p.y))

  let arcConfig = section.arcConfig
  if (arcConfig) {
    const c = rot(arcConfig.cx, arcConfig.cy)
    arcConfig = {
      ...arcConfig,
      cx: c.x,
      cy: c.y,
      startAngle: arcConfig.startAngle + degrees,
      endAngle: arcConfig.endAngle + degrees,
    }
  }

  return { ...section, polygonPoints, seats, rows, arcConfig }
}

/**
 * Scale a section about a fixed point, independently in x and y.
 *
 * Used by the box handles on a furniture piece and by the ± buttons, which pass
 * the same factor for both axes. Like rotateSection, this rewrites coordinates
 * rather than storing a scale, so nothing downstream needs to know it happened,
 * and seat IDs are untouched so sold tickets keep pointing at the same seats.
 *
 * One caveat, deliberately accepted: a curved ROW under a non-uniform scale is
 * really an ellipse, and RowPath can only describe a circular arc, so
 * transformRows refits a circle through the three transformed points. Furniture
 * has no rows, which is what these handles drive; the ± buttons scale both axes
 * equally, where the refit is exact. Non-uniform scaling of a section with
 * curved rows would slightly change their curvature.
 */
export function scaleSection(
  section: SectionData,
  sx: number,
  sy: number,
  origin: { x: number; y: number },
): SectionData {
  const pt = (x: number, y: number) => ({
    x: origin.x + (x - origin.x) * sx,
    y: origin.y + (y - origin.y) * sy,
  })
  const polygonPoints: number[] = []
  for (let i = 0; i < section.polygonPoints.length; i += 2) {
    const p = pt(section.polygonPoints[i], section.polygonPoints[i + 1])
    polygonPoints.push(p.x, p.y)
  }
  return {
    ...section,
    polygonPoints,
    seats: section.seats.map((seat) => { const p = pt(seat.x, seat.y); return { ...seat, x: p.x, y: p.y } }),
    rows: transformRows(section.rows, (p) => pt(p.x, p.y)),
    arcConfig: section.arcConfig
      ? (() => {
          const c = pt(section.arcConfig.cx, section.arcConfig.cy)
          // An arc has one radius, so a non-uniform scale has no exact answer;
          // the mean keeps a re-fill in the right neighbourhood.
          const r = (Math.abs(sx) + Math.abs(sy)) / 2
          return { ...section.arcConfig, cx: c.x, cy: c.y, rInner: section.arcConfig.rInner * r, rOuter: section.arcConfig.rOuter * r }
        })()
      : section.arcConfig,
  }
}

/** Move a whole section by a delta, geometry and seats together. */
export function translateSection(section: SectionData, dx: number, dy: number): SectionData {
  const polygonPoints = section.polygonPoints.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
  return {
    ...section,
    polygonPoints,
    seats: section.seats.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    rows: transformRows(section.rows, (p) => ({ x: p.x + dx, y: p.y + dy })),
    arcConfig: section.arcConfig
      ? { ...section.arcConfig, cx: section.arcConfig.cx + dx, cy: section.arcConfig.cy + dy }
      : section.arcConfig,
  }
}

export type AlignMode =
  | 'left' | 'hcenter' | 'right'
  | 'top' | 'vmiddle' | 'bottom'
  | 'hdistribute' | 'vdistribute'

/**
 * Align or evenly space whole sections, returning the delta for each.
 *
 * Alignment is measured against the GROUP's bounding box, which is what makes
 * "align left" mean "line up on the leftmost edge in the selection" rather than
 * "jump to x=0". Distribution equalises the GAPS between neighbours, not their
 * centres, so a run of mixed-width booths ends up evenly spaced to the eye
 * instead of evenly spaced by midpoint with the wide ones crowding.
 */
export function alignSectionDeltas(sections: SectionData[], mode: AlignMode): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>()
  if (sections.length < 2) return out
  const g = groupBounds(sections)
  const boxes = sections.map((sec) => ({ sec, b: sectionBounds(sec) }))

  if (mode === 'hdistribute' || mode === 'vdistribute') {
    const horizontal = mode === 'hdistribute'
    const sorted = [...boxes].sort((a, b) =>
      horizontal ? a.b.minX - b.b.minX : a.b.minY - b.b.minY)
    const span = horizontal ? g.w : g.h
    const used = sorted.reduce((n, x) => n + (horizontal ? x.b.w : x.b.h), 0)
    // Negative gap means the pieces already overlap more than the span allows;
    // spreading them would be a lie, so leave them alone.
    const gap = (span - used) / (sorted.length - 1)
    if (!isFinite(gap)) return out
    let cursor = horizontal ? g.minX : g.minY
    for (const { sec, b } of sorted) {
      const target = cursor
      out.set(sec.id, horizontal ? { dx: target - b.minX, dy: 0 } : { dx: 0, dy: target - b.minY })
      cursor += (horizontal ? b.w : b.h) + gap
    }
    return out
  }

  for (const { sec, b } of boxes) {
    switch (mode) {
      case 'left':    out.set(sec.id, { dx: g.minX - b.minX, dy: 0 }); break
      case 'right':   out.set(sec.id, { dx: g.maxX - b.maxX, dy: 0 }); break
      case 'hcenter': out.set(sec.id, { dx: g.cx - b.cx, dy: 0 }); break
      case 'top':     out.set(sec.id, { dx: 0, dy: g.minY - b.minY }); break
      case 'bottom':  out.set(sec.id, { dx: 0, dy: g.maxY - b.maxY }); break
      case 'vmiddle': out.set(sec.id, { dx: 0, dy: g.cy - b.cy }); break
    }
  }
  return out
}


/**
 * Rotate a background shape rigidly about a pivot.
 *
 * Sections are rotated by rewriting their coordinates, because a section has no
 * stored angle. A background shape DOES have one (`rotation`), and both the
 * editor and the buyer picker already pass it straight to Konva — two live maps
 * rely on that today — so a shape is turned by moving it and bumping its angle
 * rather than by baking anything.
 *
 * The subtlety is Konva's pivot: a node's `rotation` turns its content about
 * the node's OWN x/y, which for a Rect is the top-left corner, not the centre.
 * That makes the rigid transform simple and exact rather than fiddly: a body
 * rotated by φ about P has its origin mapped to rotate(origin, P, φ) and its
 * own orientation advanced by φ. Rotating the CENTRE instead — the intuitive
 * move — would be wrong, because the renderer would then spin the shape about
 * its corner a second time and walk it off position.
 *
 * A Circle's x/y is already its centre and it is rotationally symmetric, so the
 * same formula degenerates correctly: the centre moves, the angle is irrelevant.
 */
export function rotateShape(
  shape: BackgroundShape,
  degrees: number,
  origin: { x: number; y: number }
): BackgroundShape {
  if (!degrees) return shape
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = shape.x - origin.x
  const dy = shape.y - origin.y
  return {
    ...shape,
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
    rotation: (shape.rotation ?? 0) + degrees,
  }
}

/**
 * Bounds of a background shape, in the same shape as sectionBounds, so a mixed
 * selection of sections and decor can share one pivot. A rotated shape is
 * measured by its UNROTATED box — good enough for a pivot, and it avoids
 * pretending to a precision the group centre does not need.
 */
export function shapeBoundsForGroup(shape: BackgroundShape) {
  const r = shape.radius ?? 0
  const w = shape.width ?? r * 2
  const h = shape.height ?? r * 2
  // Circles are centred on x/y; everything else hangs off its top-left.
  const left = shape.type === 'circle' ? shape.x - r : shape.x
  const top = shape.type === 'circle' ? shape.y - r : shape.y
  return {
    minX: left, minY: top, maxX: left + w, maxY: top + h,
    cx: left + w / 2, cy: top + h / 2,
  }
}
