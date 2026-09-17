import type { RowData, RowPath, SeatData, SectionData, BackgroundShape } from '@/components/seat-map/types'

/**
 * Row geometry shared by the builder (draw / regenerate / labels), the buyer
 * picker (labels) and the save path (stage-derived front row). Pure functions
 * over canvas data; no React, no DB.
 */

// ─── Paths ──────────────────────────────────────────────────────────────────

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

/** A point at parameter t ∈ [0,1] along the path, plus the unit tangent there. */
export function pointOnPath(path: RowPath, t: number): { x: number; y: number; tx: number; ty: number } {
  if (path.kind === 'line') {
    const dx = path.x2 - path.x1, dy = path.y2 - path.y1
    const len = Math.hypot(dx, dy) || 1
    return { x: path.x1 + dx * t, y: path.y1 + dy * t, tx: dx / len, ty: dy / len }
  }
  const a = rad(path.startAngle + (path.endAngle - path.startAngle) * t)
  const dir = path.endAngle >= path.startAngle ? 1 : -1
  return {
    x: path.cx + path.r * Math.cos(a),
    y: path.cy + path.r * Math.sin(a),
    tx: -Math.sin(a) * dir,
    ty: Math.cos(a) * dir,
  }
}

export function pathLength(path: RowPath): number {
  if (path.kind === 'line') return Math.hypot(path.x2 - path.x1, path.y2 - path.y1)
  return Math.abs(rad(path.endAngle - path.startAngle)) * path.r
}

export function pathEndpoints(path: RowPath): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const s = pointOnPath(path, 0), e = pointOnPath(path, 1)
  return { start: { x: s.x, y: s.y }, end: { x: e.x, y: e.y } }
}

/** Circle through three points, or null when they're (nearly) collinear. */
export function circleThrough(
  a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }
): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) }
}

/**
 * Arc from `start` to `end` passing through `via` (the curve handle). Falls
 * back to a straight line when the three are collinear or the bend is tiny.
 */
export function arcThrough(
  start: { x: number; y: number }, via: { x: number; y: number }, end: { x: number; y: number }
): RowPath {
  const line: RowPath = { kind: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y }
  const c = circleThrough(start, via, end)
  if (!c) return line
  // Sagitta of the handle relative to the chord — below ~1px the row is straight.
  const chord = Math.hypot(end.x - start.x, end.y - start.y)
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  if (Math.hypot(via.x - mid.x, via.y - mid.y) < 1 || chord < 2) return line
  let a0 = deg(Math.atan2(start.y - c.cy, start.x - c.cx))
  let a1 = deg(Math.atan2(end.y - c.cy, end.x - c.cx))
  const av = deg(Math.atan2(via.y - c.cy, via.x - c.cx))
  // Choose the sweep direction that passes through `via`.
  const norm = (x: number) => ((x % 360) + 360) % 360
  const ccwSweep = norm(a1 - a0)          // sweep going +angle from a0 to a1
  const viaCcw = norm(av - a0)
  if (viaCcw <= ccwSweep) a1 = a0 + ccwSweep
  else a1 = a0 - (360 - ccwSweep)
  return { kind: 'arc', cx: c.cx, cy: c.cy, r: c.r, startAngle: a0, endAngle: a1 }
}

/**
 * Map a path through a point transform (translate / reflect / uniform scale).
 * Arcs are rebuilt from their transformed start, middle and end, which is
 * exact for those transforms and avoids angle bookkeeping.
 */
export function transformPath(path: RowPath, fn: (p: { x: number; y: number }) => { x: number; y: number }): RowPath {
  if (path.kind === 'line') {
    const a = fn({ x: path.x1, y: path.y1 }), b = fn({ x: path.x2, y: path.y2 })
    return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }
  const s = pointOnPath(path, 0), m = pointOnPath(path, 0.5), e = pointOnPath(path, 1)
  return arcThrough(fn({ x: s.x, y: s.y }), fn({ x: m.x, y: m.y }), fn({ x: e.x, y: e.y }))
}

export function transformRows(rows: RowData[] | undefined, fn: (p: { x: number; y: number }) => { x: number; y: number }): RowData[] | undefined {
  if (!rows) return rows
  return rows.map((r) => ({ ...r, path: transformPath(r.path, fn) }))
}

/** The curve handle for a path: the midpoint of the row (on the arc, or the chord midpoint). */
export function curveHandle(path: RowPath): { x: number; y: number } {
  const p = pointOnPath(path, 0.5)
  return { x: p.x, y: p.y }
}

/** Sagitta of an arc row as a signed fraction of its chord (0 = straight). */
export function pathCurvature(path: RowPath): number {
  if (path.kind === 'line') return 0
  const { start, end } = pathEndpoints(path)
  const chord = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const h = curveHandle(path)
  // Sign: which side of the chord the arc bulges to (left-hand normal positive).
  const nx = -(end.y - start.y) / chord, ny = (end.x - start.x) / chord
  const sag = (h.x - mid.x) * nx + (h.y - mid.y) * ny
  return sag / chord
}

/** Rebuild a path from its endpoints and a curvature fraction (see pathCurvature). */
export function pathFromCurvature(start: { x: number; y: number }, end: { x: number; y: number }, curvature: number): RowPath {
  const chord = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const nx = -(end.y - start.y) / chord, ny = (end.x - start.x) / chord
  const via = { x: mid.x + nx * curvature * chord, y: mid.y + ny * curvature * chord }
  return arcThrough(start, via, end)
}

// ─── Numbering + layout ─────────────────────────────────────────────────────

export function seatNumberAt(row: Pick<RowData, 'seatCount' | 'startNumber' | 'numberingDirection' | 'numberingStyle'>, index: number): number {
  const n = row.seatCount
  const idx = row.numberingDirection === 'rtl' ? n - 1 - index : index
  if (row.numberingStyle === 'odd_even') {
    // Continental: odd numbers from one end, even from the other, meeting in the middle.
    const half = Math.ceil(n / 2)
    if (idx < half) return row.startNumber + idx * 2
    return row.startNumber + 1 + (idx - half) * 2
  }
  return row.startNumber + idx
}

/**
 * Positions + numbers for every seat of a row, evenly spaced along its path,
 * with any aisle gaps taking their share of the length. The path always runs
 * from the first seat to the last, so t=0 and t=1 are seats.
 */
export function layoutRow(row: RowData): { x: number; y: number; seatNumber: number; label: string }[] {
  const n = Math.max(0, Math.floor(row.seatCount))
  const out: { x: number; y: number; seatNumber: number; label: string }[] = []
  if (n === 0) return out
  const len = pathLength(row.path)
  const gaps = (row.gaps ?? []).filter((g) => g.afterIndex >= 0 && g.afterIndex < n - 1)
  const gapTotal = gaps.reduce((a, g) => a + Math.max(0, g.width), 0)
  const pitch = n > 1 ? Math.max(0, len - gapTotal) / (n - 1) : 0
  let cursor = 0
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : len > 0 ? cursor / len : 0
    const p = pointOnPath(row.path, Math.min(1, t))
    const seatNumber = seatNumberAt(row, i)
    out.push({ x: p.x, y: p.y, seatNumber, label: `${row.label}${seatNumber}` })
    cursor += pitch + (gaps.find((g) => g.afterIndex === i)?.width ?? 0)
  }
  return out
}

/**
 * Apply a row's layout to a section's seats. Existing seats of the row keep
 * their ids (and so their sold/held status, tier, price) in seat-number order;
 * extra seats are created, surplus ones dropped unless booked.
 */
export function applyRowLayout(section: SectionData, row: RowData): SeatData[] {
  const positions = layoutRow(row)
  const mine = section.seats.filter((s) => s.rowId === row.id).sort((a, b) => a.seatNumber - b.seatNumber)
  const others = section.seats.filter((s) => s.rowId !== row.id)
  const next: SeatData[] = positions.map((p, i) => {
    const prev = mine[i]
    return prev
      ? { ...prev, x: p.x, y: p.y, seatNumber: p.seatNumber, label: p.label, rowLabel: row.label }
      : { id: crypto.randomUUID(), rowId: row.id, rowLabel: row.label, seatNumber: p.seatNumber, label: p.label, x: p.x, y: p.y, status: 'available', customPrice: null }
  })
  const keptBooked = mine.slice(positions.length).filter((s) => s.status === 'booked')
  return [...others, ...next, ...keptBooked]
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export const ROW_LABEL_GAP = 2.6   // × seat radius, from the end seat to the label centre

/** Where the two row labels sit (auto anchor just outside each end + any drag offset). */
export function rowLabelAnchors(row: RowData, seatRadius: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const gap = seatRadius * ROW_LABEL_GAP + 4
  const s = pointOnPath(row.path, 0), e = pointOnPath(row.path, 1)
  const single = row.seatCount <= 1
  const start = { x: s.x - s.tx * gap + (row.labelOffset?.start?.dx ?? 0), y: s.y - s.ty * gap + (row.labelOffset?.start?.dy ?? 0) }
  const end = single
    ? start
    : { x: e.x + e.tx * gap + (row.labelOffset?.end?.dx ?? 0), y: e.y + e.ty * gap + (row.labelOffset?.end?.dy ?? 0) }
  return { start, end }
}

const SKIP_LETTERS = new Set(['I', 'O'])

/** A, B, … Z, AA, AB, … optionally skipping I and O (theatre convention). */
export function rowLabelAt(index: number, opts?: { skipIO?: boolean; numeric?: boolean; start?: string }): string {
  if (opts?.numeric) return String((parseInt(opts.start ?? '1', 10) || 1) + index)
  const letters: string[] = []
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c)
    if (opts?.skipIO && SKIP_LETTERS.has(ch)) continue
    letters.push(ch)
  }
  const base = letters.length
  let startIdx = 0
  if (opts?.start) {
    const i = letters.indexOf(opts.start.toUpperCase().charAt(0))
    if (i >= 0) startIdx = i
  }
  const n = startIdx + index
  if (n < base) return letters[n]
  return letters[Math.floor(n / base) - 1] + letters[n % base]
}

/** Next unused row label in a section (after the natsort-last one). */
export function nextRowLabel(section: SectionData, opts?: { skipIO?: boolean }): string {
  const used = new Set((section.rows ?? []).map((r) => r.label.toUpperCase()))
  for (let i = 0; i < 26 * 27; i++) {
    const l = rowLabelAt(i, opts)
    if (!used.has(l)) return l
  }
  return `R${used.size + 1}`
}

// ─── Deriving rows from seats (maps saved before rows existed) ──────────────

/**
 * Group a section's seats into physical rows. Same idea as the SQL ranker,
 * which this map already proved out: walk each label group in seat-number
 * order and break the chain where the step to the next number is far larger
 * than the typical neighbour spacing AND either huge or heading back the way
 * the row came (a wrap to the next row). A moderate jump in the same direction
 * is an aisle and stays inside the row. Labels are NOT trusted on their own —
 * real maps (PICC) label 300 seats "A".
 *
 * Rows numbered continentally (odd one side, even the other) fragment under
 * number-walking, so a group that shatters falls back to nearest-neighbour
 * direction linking.
 */
export function deriveRows(section: SectionData, seatRadius = 8): { rows: RowData[]; seats: SeatData[] } {
  const seats = section.seats
  if (seats.length === 0) return { rows: [], seats }

  const byLabel = new Map<string, SeatData[]>()
  for (const s of seats) byLabel.set(s.rowLabel, [...(byLabel.get(s.rowLabel) ?? []), s])

  const rows: RowData[] = []
  const rowOf = new Map<string, string>()
  const commit = (label: string, chain: SeatData[], median: number) => {
    if (chain.length === 0) return
    const row = rowFromChain(label, chain, seatRadius, median)
    rows.push(row)
    for (const s of chain) rowOf.set(s.id, row.id)
  }

  for (const [label, group] of byLabel) {
    const ordered = [...group].sort((a, b) => a.seatNumber - b.seatNumber || a.x - b.x)
    const steps: number[] = []
    for (let i = 1; i < ordered.length; i++) steps.push(Math.hypot(ordered[i].x - ordered[i - 1].x, ordered[i].y - ordered[i - 1].y))
    const sorted = [...steps].sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : seatRadius * 2.5
    const limit = Math.max(median * 1.8, seatRadius * 3)

    const chains: SeatData[][] = []
    let chain: SeatData[] = []
    for (let i = 0; i < ordered.length; i++) {
      const cur = ordered[i]
      if (chain.length > 0) {
        const prev = chain[chain.length - 1]
        const d = Math.hypot(cur.x - prev.x, cur.y - prev.y)
        if (d > limit) {
          // Direction of the row so far (first → prev); a step against it is a wrap.
          const first = chain[0]
          const rx = prev.x - first.x, ry = prev.y - first.y
          const sx = cur.x - prev.x, sy = cur.y - prev.y
          const reversed = chain.length > 1 && rx * sx + ry * sy < 0
          if (d > median * 4 || reversed) { chains.push(chain); chain = [] }
        }
      }
      chain.push(cur)
    }
    if (chain.length) chains.push(chain)

    // Shattered (continental numbering, or numbers that don't follow the
    // geometry at all): link by nearest-neighbour direction instead.
    const singles = chains.filter((c) => c.length <= 1).length
    if (group.length >= 6 && singles > chains.length / 2) {
      for (const c of linkByDirection(group, seatRadius)) commit(label, c, median)
    } else {
      for (const c of chains) commit(label, c, median)
    }
  }

  return {
    rows,
    seats: seats.map((s) => ({ ...s, rowId: rowOf.get(s.id) ?? s.rowId ?? null })),
  }
}

/**
 * Rows as connected runs of near-collinear nearest neighbours. Each seat links
 * to neighbours within 1.8× its nearest distance that lie along the same
 * direction as that nearest neighbour; components are rows, ordered along
 * their own axis.
 */
function linkByDirection(group: SeatData[], seatRadius: number): SeatData[][] {
  const n = group.length
  const parent = group.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => { parent[find(a)] = find(b) }
  for (let i = 0; i < n; i++) {
    let best = -1, bd = Infinity
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = Math.hypot(group[j].x - group[i].x, group[j].y - group[i].y)
      if (d < bd) { bd = d; best = j }
    }
    if (best < 0) continue
    const ux = (group[best].x - group[i].x) / bd, uy = (group[best].y - group[i].y) / bd
    const limit = Math.max(bd * 1.8, seatRadius * 3)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dx = group[j].x - group[i].x, dy = group[j].y - group[i].y
      const d = Math.hypot(dx, dy)
      if (d > limit) continue
      const along = dx * ux + dy * uy
      const across = Math.abs(dx * uy - dy * ux)
      if (across < Math.max(2, bd * 0.35) && Math.abs(along) > 0) union(i, j)
    }
  }
  const comps = new Map<number, SeatData[]>()
  group.forEach((s, i) => { const r = find(i); comps.set(r, [...(comps.get(r) ?? []), s]) })
  return [...comps.values()].map((c) => {
    if (c.length < 2) return c
    // Order along the component's own axis (first → farthest seat).
    const a = c[0]
    const far = c.reduce((m, s) => (Math.hypot(s.x - a.x, s.y - a.y) > Math.hypot(m.x - a.x, m.y - a.y) ? s : m), a)
    const ux = far.x - a.x, uy = far.y - a.y
    return [...c].sort((p, q) => (p.x * ux + p.y * uy) - (q.x * ux + q.y * uy))
  })
}

function rowFromChain(label: string, chain: SeatData[], seatRadius: number, median: number): RowData {
  const first = chain[0], last = chain[chain.length - 1]
  const numbers = chain.map((s) => s.seatNumber)
  const increasing = numbers.every((v, i) => i === 0 || v >= numbers[i - 1])
  const decreasing = numbers.every((v, i) => i === 0 || v <= numbers[i - 1])
  const odds = numbers.filter((v) => v % 2 === 1).length
  // Continental = odds run up one way, evens run back the other way.
  const continental = chain.length >= 4 && odds > 0 && odds < chain.length && (() => {
    const half = Math.ceil(chain.length / 2)
    const left = numbers.slice(0, half), right = numbers.slice(half)
    const leftOdd = left.every((v) => v % 2 === 1), rightEven = right.every((v) => v % 2 === 0)
    const leftEven = left.every((v) => v % 2 === 0), rightOdd = right.every((v) => v % 2 === 1)
    return (leftOdd && rightEven) || (leftEven && rightOdd)
  })()

  let path: RowPath = { kind: 'line', x1: first.x, y1: first.y, x2: last.x, y2: last.y }
  if (chain.length >= 3) {
    const mid = chain[Math.floor(chain.length / 2)]
    const chord = Math.hypot(last.x - first.x, last.y - first.y) || 1
    const dev = Math.abs((last.x - first.x) * (first.y - mid.y) - (first.x - mid.x) * (last.y - first.y)) / chord
    if (dev > Math.max(1.5, seatRadius * 0.6)) path = arcThrough({ x: first.x, y: first.y }, { x: mid.x, y: mid.y }, { x: last.x, y: last.y })
  }

  // Aisles: a neighbour step well above the typical pitch, recorded as extra width.
  const gaps: { afterIndex: number; width: number }[] = []
  for (let i = 1; i < chain.length; i++) {
    const d = Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y)
    if (d > median * 1.8) gaps.push({ afterIndex: i - 1, width: d - median })
  }

  return {
    id: crypto.randomUUID(),
    label,
    path,
    seatCount: chain.length,
    startNumber: Math.min(...numbers),
    numberingDirection: decreasing && !increasing ? 'rtl' : 'ltr',
    numberingStyle: continental ? 'odd_even' : 'sequential',
    ...(gaps.length ? { gaps } : {}),
  }
}

/** Ensure every section has rows (deriving them once for pre-row maps). */
export function ensureRows(section: SectionData, seatRadius = 8): SectionData {
  if (section.rows && section.rows.length > 0) return section
  if (section.seats.length === 0) return { ...section, rows: [] }
  const { rows, seats } = deriveRows(section, seatRadius)
  return { ...section, rows, seats }
}

// ─── Filling a section with rows ────────────────────────────────────────────

export interface RowFillConfig {
  rowCount: number
  seatsPerRow: number
  seatRadius: number
  seatGap: number
  rowGap: number
  /** Sagitta as a fraction of row width; + bends away from the top, − toward it. 0 = straight. */
  curvature: number
  gridRotation: number     // degrees
  labelScheme: 'alpha' | 'numeric'
  skipIO: boolean
  startNumber: number
  numberingDirection: 'ltr' | 'rtl'
  numberingStyle: 'sequential' | 'odd_even'
  aisleAfterSeats?: number[]
  aisleWidth?: number
}

/**
 * Lay `rowCount` rows across a polygon's bounding box, straight or bent to
 * `curvature`, and return rows + seats (seats outside the polygon are dropped
 * and the row's count shrinks to what fit). Rows run front (top) to back.
 */
export function fillSectionRows(
  polygonPointsFlat: number[],
  config: RowFillConfig,
  isInside: (x: number, y: number) => boolean
): { rows: RowData[]; seats: SeatData[] } {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < polygonPointsFlat.length; i += 2) pts.push({ x: polygonPointsFlat[i], y: polygonPointsFlat[i + 1] })
  if (pts.length < 3) return { rows: [], seats: [] }
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
  const rot = rad(config.gridRotation)
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const toLocal = (p: { x: number; y: number }) => ({ x: (p.x - cx) * cos + (p.y - cy) * sin, y: -(p.x - cx) * sin + (p.y - cy) * cos })
  const toWorld = (p: { x: number; y: number }) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos })
  const local = pts.map(toLocal)
  const minX = Math.min(...local.map((p) => p.x)), maxX = Math.max(...local.map((p) => p.x))
  const minY = Math.min(...local.map((p) => p.y)), maxY = Math.max(...local.map((p) => p.y))
  const pad = config.seatRadius + 2
  const width = maxX - minX - pad * 2
  const height = maxY - minY - pad * 2
  const rowPitch = config.rowCount > 1 ? Math.min(height / (config.rowCount - 1), config.seatRadius * 2 + config.rowGap) : 0
  const rowsTotalH = rowPitch * (config.rowCount - 1)
  const yStart = minY + pad + Math.max(0, (height - rowsTotalH) / 2)

  const rows: RowData[] = []
  const seats: SeatData[] = []
  for (let r = 0; r < config.rowCount; r++) {
    const y = yStart + r * rowPitch
    const label = config.labelScheme === 'numeric' ? String(r + 1) : rowLabelAt(r, { skipIO: config.skipIO })
    const startL = { x: minX + pad, y }, endL = { x: minX + pad + width, y }
    const start = toWorld(startL), end = toWorld(endL)
    // Concentric bend: every row shares the same curvature fraction, so the
    // rows stay parallel arcs rather than pinching together.
    const path = config.curvature !== 0 ? pathFromCurvature(start, end, config.curvature) : { kind: 'line' as const, x1: start.x, y1: start.y, x2: end.x, y2: end.y }
    const rowId = crypto.randomUUID()
    const row: RowData = {
      id: rowId, label, path,
      seatCount: config.seatsPerRow,
      startNumber: config.startNumber,
      numberingDirection: config.numberingDirection,
      numberingStyle: config.numberingStyle,
    }
    // Lay seats along the path with aisle gaps; keep those inside the polygon.
    const aisleW = config.aisleWidth ?? 20
    const gaps = (config.aisleAfterSeats ?? []).filter((n) => n >= 1 && n < config.seatsPerRow).map((n) => ({ afterIndex: n - 1, width: aisleW }))
    if (gaps.length) row.gaps = gaps
    const positions = layoutRow(row)
    const kept = positions.filter((p) => isInside(p.x, p.y))
    if (kept.length === 0) continue
    // Trim the row's path to the seats that fit so labels sit next to real seats.
    const trimmed: RowData = {
      ...row,
      seatCount: kept.length,
      path: kept.length > 1 && path.kind === 'line'
        ? { kind: 'line', x1: kept[0].x, y1: kept[0].y, x2: kept[kept.length - 1].x, y2: kept[kept.length - 1].y }
        : path,
    }
    rows.push(trimmed)
    // Re-number kept seats so numbering stays contiguous after polygon trimming.
    kept.forEach((p, i) => {
      const seatNumber = seatNumberAt(trimmed, i)
      seats.push({ id: crypto.randomUUID(), rowId, rowLabel: label, seatNumber, label: `${label}${seatNumber}`, x: p.x, y: p.y, status: 'available', customPrice: null })
    })
  }
  return { rows, seats }
}

// ─── Stage → front row ──────────────────────────────────────────────────────

export function findStage(shapes: BackgroundShape[]): BackgroundShape | null {
  return shapes.find((s) => s.role === 'stage')
    ?? shapes.find((s) => (s.label ?? '').trim().toUpperCase() === 'STAGE')
    ?? null
}

export function shapeCenter(s: BackgroundShape): { x: number; y: number } {
  if (s.type === 'circle') return { x: s.x, y: s.y }
  if (s.points && s.points.length >= 2) {
    let x = 0, y = 0, n = 0
    for (let i = 0; i < s.points.length; i += 2) { x += s.points[i]; y += s.points[i + 1]; n++ }
    return { x: s.x + x / n, y: s.y + y / n }
  }
  return { x: s.x + (s.width ?? 60) / 2, y: s.y + (s.height ?? 60) / 2 }
}

/**
 * Which way is "front" for best-available: the row nearest the stage. Returns
 * 'asc' when that row is the natsort-first label (or the top-most row when
 * labels don't discriminate), 'desc' otherwise — the encoding the ranker
 * already understands (event_sections.row_order).
 */
export function rowOrderFromStage(section: SectionData, stage: { x: number; y: number }): 'asc' | 'desc' | null {
  const rows = section.rows ?? []
  if (rows.length < 2) return null
  const dist = (r: RowData) => { const m = pointOnPath(r.path, 0.5); return Math.hypot(m.x - stage.x, m.y - stage.y) }
  const nearest = rows.reduce((a, b) => (dist(b) < dist(a) ? b : a))
  const farthest = rows.reduce((a, b) => (dist(b) > dist(a) ? b : a))
  const labelsDiffer = nearest.label !== farthest.label
  if (labelsDiffer) {
    const cmp = nearest.label.localeCompare(farthest.label, undefined, { numeric: true, sensitivity: 'base' })
    if (cmp !== 0) return cmp < 0 ? 'asc' : 'desc'
  }
  // Same labels everywhere (PICC-style) → the ranker falls back to average y.
  const yN = pointOnPath(nearest.path, 0.5).y, yF = pointOnPath(farthest.path, 0.5).y
  return yN <= yF ? 'asc' : 'desc'
}
