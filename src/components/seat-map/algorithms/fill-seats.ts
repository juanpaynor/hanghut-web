import {
  pointInPolygon,
  getPolygonBounds,
  flatToVertices,
} from './point-in-polygon'

export interface SeatPosition {
  rowLabel: string
  seatNumber: number
  label: string
  x: number
  y: number
}

export interface FillConfig {
  rowCount: number
  seatsPerRow: number
  seatSize?: number      // radius of each seat circle (default 8)
  seatGap?: number       // gap between seats (default 4)
  rowGap?: number        // gap between rows (default 6)
  labelScheme?: 'alpha' | 'numeric'  // A,B,C or 1,2,3 for rows
  startLabel?: string    // e.g. "A" or "1"
  gridRotation?: number  // rotation angle in degrees
}

const DEFAULT_SEAT_SIZE = 8
const DEFAULT_SEAT_GAP = 4
const DEFAULT_ROW_GAP = 6

/**
 * Fill a polygon section with evenly-spaced seats in straight rows.
 * Seats outside the polygon are filtered out.
 */
export function fillStraightSeats(
  polygonPointsFlat: number[],
  config: FillConfig
): SeatPosition[] {
  const polygon = flatToVertices(polygonPointsFlat)
  
  // Calculate polygon center
  let sumX = 0, sumY = 0
  for (const pt of polygon) { sumX += pt.x; sumY += pt.y }
  const cx = sumX / polygon.length
  const cy = sumY / polygon.length

  const rotationRad = ((config.gridRotation ?? 0) * Math.PI) / 180

  // To find the rotated bounding box, we rotate the polygon backwards
  const localPolygon = polygon.map(p => {
    const dx = p.x - cx
    const dy = p.y - cy
    return {
      x: cx + dx * Math.cos(-rotationRad) - dy * Math.sin(-rotationRad),
      y: cy + dx * Math.sin(-rotationRad) + dy * Math.cos(-rotationRad)
    }
  })

  // We generate the grid based on the local polygon bounds
  const bounds = getPolygonBounds(localPolygon)
  const seatSize = config.seatSize ?? DEFAULT_SEAT_SIZE
  const seatGap = config.seatGap ?? DEFAULT_SEAT_GAP
  const rowGap = config.rowGap ?? DEFAULT_ROW_GAP
  const cellWidth = seatSize * 2 + seatGap
  const cellHeight = seatSize * 2 + rowGap

  // Padding inside the bounding box
  const padX = seatSize + 2
  const padY = seatSize + 2
  const innerWidth = bounds.width - padX * 2
  const innerHeight = bounds.height - padY * 2

  if (innerWidth <= 0 || innerHeight <= 0) return []

  const seats: SeatPosition[] = []

  for (let row = 0; row < config.rowCount; row++) {
    const rowLabel = getRowLabel(row, config.labelScheme, config.startLabel)
    const localY = bounds.minY + padY + row * cellHeight + seatSize

    // Skip rows that exceed the polygon bounds
    if (localY > bounds.maxY - padY) break

    let seatNum = 0
    for (let col = 0; col < config.seatsPerRow; col++) {
      const localX = bounds.minX + padX + col * cellWidth + seatSize

      // Skip seats that exceed polygon bounds
      if (localX > bounds.maxX - padX) break

      // Rotate point forward back to canvas space to check intersection
      const dx = localX - cx
      const dy = localY - cy
      const worldX = cx + dx * Math.cos(rotationRad) - dy * Math.sin(rotationRad)
      const worldY = cy + dx * Math.sin(rotationRad) + dy * Math.cos(rotationRad)

      // Only include seats inside the original polygon
      if (pointInPolygon(worldX, worldY, polygon)) {
        seatNum++
        seats.push({
          rowLabel,
          seatNumber: seatNum,
          label: `${rowLabel}${seatNum}`,
          x: worldX,
          y: worldY,
        })
      }
    }
  }

  return seats
}

/**
 * Arc configuration for circular venue sections.
 */
export interface ArcConfig {
  cx: number          // center X of the arc
  cy: number          // center Y of the arc
  rInner: number      // inner radius
  rOuter: number      // outer radius
  startAngle: number  // start angle in degrees (0 = right, 90 = down)
  endAngle: number    // end angle in degrees
}

/**
 * Fill an arc-shaped section with seats distributed along curved rows.
 * Used for circular venues like Araneta Coliseum.
 */
export function fillArcSeats(
  arcConfig: ArcConfig,
  config: FillConfig
): SeatPosition[] {
  const { cx, cy, rInner, rOuter, startAngle, endAngle } = arcConfig
  const seatSize = config.seatSize ?? DEFAULT_SEAT_SIZE

  // Convert to radians
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180
  const arcSpan = endRad - startRad

  // Distribute rows from inner to outer radius
  const rowStep = (rOuter - rInner) / (config.rowCount + 1)

  const seats: SeatPosition[] = []

  for (let row = 0; row < config.rowCount; row++) {
    const rowLabel = getRowLabel(row, config.labelScheme, config.startLabel)
    const radius = rInner + rowStep * (row + 1)

    // The arc length at this radius determines max seats
    const arcLength = Math.abs(arcSpan) * radius
    const seatSpacing = seatSize * 2 + (config.seatGap ?? DEFAULT_SEAT_GAP)
    const maxSeats = Math.min(
      config.seatsPerRow,
      Math.floor(arcLength / seatSpacing)
    )

    if (maxSeats <= 0) continue

    // Distribute seats evenly along the arc
    const angleStep = arcSpan / (maxSeats + 1)

    for (let i = 0; i < maxSeats; i++) {
      const angle = startRad + angleStep * (i + 1)
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)

      seats.push({
        rowLabel,
        seatNumber: i + 1,
        label: `${rowLabel}${i + 1}`,
        x,
        y,
      })
    }
  }

  return seats
}

/**
 * Generate a row label based on the labeling scheme.
 */
function getRowLabel(
  index: number,
  scheme?: 'alpha' | 'numeric',
  startLabel?: string
): string {
  if (scheme === 'numeric') {
    const startNum = startLabel ? parseInt(startLabel, 10) || 1 : 1
    return String(startNum + index)
  }

  // Alpha: A, B, C, ... Z, AA, AB, ...
  const startCode = startLabel
    ? startLabel.toUpperCase().charCodeAt(0) - 65
    : 0
  const absIndex = startCode + index

  if (absIndex < 26) {
    return String.fromCharCode(65 + absIndex)
  }

  // Beyond Z: AA, AB, AC...
  const first = Math.floor(absIndex / 26) - 1
  const second = absIndex % 26
  return String.fromCharCode(65 + first) + String.fromCharCode(65 + second)
}
