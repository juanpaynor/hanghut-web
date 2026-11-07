import type { CanvasData } from '@/components/seat-map/types'
import { normaliseSeatShape } from './seat-shape'
import { resolveSeatTier } from '@/components/seat-map/types'

/**
 * A seat map rendered from a CANVAS (draft or live) into the exact payloads the
 * buyer picker fetches over the wire, so the organizer's preview is the real
 * picker component with its network swapped out — not a second renderer that
 * can drift.
 *
 * Shapes mirror get_event_seat_geometry / get_event_section_seats /
 * get_event_seat_status. Keep them in lock-step with those RPCs.
 */
export interface PreviewBundle {
  source: 'draft' | 'live'
  version: number
  geometry: {
    event_id: string
    version: number
    canvas_width: number
    canvas_height: number
    seat_radius: number | null
    seat_shape: string | null
    background_shapes: unknown[]
    tiers: { id: string; name: string; price: number; sort_order: number }[]
    sections: {
      id: string; label: string; color: string; section_type: string
      polygon_points: number[]; tier_id: string | null; row_tier_overrides: Record<string, string>
      rows: unknown[]; show_row_labels: boolean
      sales_mode: 'ga' | 'seated'; seat_count: number
      /** Phase 2 — mirrors event_sections.unit_capacity / .seat_shape. */
      unit_capacity: number | null; seat_shape: string | null
      chair_scale: number | null
      label_offset: { dx: number; dy: number } | null
      label_font_size: number | null
    }[]
  }
  /** sectionId → seats, as /api/seat-map/section returns them. */
  sectionSeats: Record<string, { id: string; row: string; seat: number; label: string; x: number; y: number; tier_id: string | null; facing: number | null }[]>
  status: {
    version: number
    selection_mode: 'best_available' | 'pick' | 'both'
    max_per_order: number
    taken: { id: string; status: 'booked' | 'held' }[]
    sections: { id: string; available_count: number; largest_block: number; on_sale: boolean; by_tier: { tier_id: string; available_count: number; largest_block: number }[] }[]
  }
}

export function buildPreviewBundle(
  eventId: string,
  canvas: CanvasData,
  tiers: { id: string; name: string; price: number; sort_order: number }[],
  opts: { version: number; selectionMode: 'best_available' | 'pick' | 'both'; maxPerOrder: number; source: 'draft' | 'live' }
): PreviewBundle {
  const tierIds = new Set(tiers.map((t) => t.id))
  const sections = (canvas.sections ?? []).filter((s) => s.isActive !== false)
  const sectionSeats: PreviewBundle['sectionSeats'] = {}
  const statusSections: PreviewBundle['status']['sections'] = []

  for (const s of sections) {
    const seats = (s.seats ?? [])
      .slice()
      .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, undefined, { numeric: true }) || a.seatNumber - b.seatNumber)
    sectionSeats[s.id] = seats.map((seat) => {
      const t = resolveSeatTier(seat, s)
      return {
        id: seat.id, row: seat.rowLabel, seat: seat.seatNumber, label: seat.label,
        x: seat.x, y: seat.y, tier_id: t && tierIds.has(t) ? t : null,
        // Mirrors get_event_section_seats. Without it the organizer's preview
        // would draw hand-turned chairs facing the stage while the live map
        // drew them turned -- the exact drift this file exists to prevent.
        facing: typeof seat.facing === 'number' && Number.isFinite(seat.facing) ? seat.facing : null,
      }
    })

    // Availability the way the status RPC counts it: non-blocked seats with an
    // on-sale price category. Largest block = longest run of consecutive seat
    // numbers within a row (the RPC derives physical rows; labels are close
    // enough for a preview).
    const byTier = new Map<string, { available: number; largest: number }>()
    const rows = new Map<string, number[]>()
    for (const seat of seats) {
      if (seat.status === 'disabled') continue
      const t = resolveSeatTier(seat, s)
      if (!t || !tierIds.has(t)) continue
      const entry = byTier.get(t) ?? { available: 0, largest: 0 }
      entry.available++
      byTier.set(t, entry)
      const key = `${t}|${seat.rowLabel}`
      rows.set(key, [...(rows.get(key) ?? []), seat.seatNumber])
    }
    for (const [key, nums] of rows) {
      const t = key.split('|')[0]
      nums.sort((a, b) => a - b)
      let run = 1, best = 1
      for (let i = 1; i < nums.length; i++) { run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run) }
      const entry = byTier.get(t)
      if (entry) entry.largest = Math.max(entry.largest, nums.length ? best : 0)
    }
    const by_tier = Array.from(byTier, ([tier_id, v]) => ({ tier_id, available_count: v.available, largest_block: v.largest }))
    statusSections.push({
      id: s.id,
      available_count: by_tier.reduce((n, b) => n + b.available_count, 0),
      largest_block: by_tier.reduce((n, b) => Math.max(n, b.largest_block), 0),
      on_sale: true,
      by_tier,
    })
  }

  return {
    source: opts.source,
    version: opts.version,
    geometry: {
      event_id: eventId,
      version: opts.version,
      canvas_width: canvas.canvasWidth,
      canvas_height: canvas.canvasHeight,
      seat_radius: canvas.seatRadius ?? null,
      seat_shape: canvas.seatShape ?? null,
      background_shapes: canvas.backgroundShapes ?? [],
      tiers,
      sections: sections.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        section_type: s.sectionType || 'general',
        polygon_points: s.polygonPoints,
        tier_id: s.tierId ?? null,
        row_tier_overrides: s.rowTierOverrides ?? {},
        rows: s.showRowLabels === false ? [] : (s.rows ?? []),
        show_row_labels: s.showRowLabels !== false,
        sales_mode: s.tierId && (s.seats?.length ?? 0) === 0 ? 'ga' : 'seated',
        seat_count: s.seats?.length ?? 0,
        // Normalised the same way sync-live.ts normalises them on the way to the
        // database, so the preview shows what a published map would actually
        // hold — not what the canvas happens to be carrying mid-edit.
        unit_capacity:
          typeof s.unitCapacity === 'number' && Number.isFinite(s.unitCapacity) && s.unitCapacity > 0
            ? Math.floor(s.unitCapacity)
            : null,
        seat_shape: normaliseSeatShape(s.seatShape),
    // Same posture as unit_capacity above: a rejected row fails the whole
        // upsert, so anything outside the CHECK becomes NULL rather than taking
        // the organizer's entire save down with it. 0 is MEANINGFUL (no chairs)
        // and must survive, which is why this is not a truthiness test.
        chair_scale:
          typeof s.chairScale === 'number' &&
          Number.isFinite(s.chairScale) &&
          s.chairScale >= 0 &&
          s.chairScale <= 3
            ? s.chairScale
            : null,
    // Shape-checked rather than trusted: a malformed value fails the CHECK and
        // takes the organizer's whole save down with it, same as chair_scale above.
        label_offset:
          s.labelOffset
          && typeof s.labelOffset.dx === 'number' && Number.isFinite(s.labelOffset.dx)
          && typeof s.labelOffset.dy === 'number' && Number.isFinite(s.labelOffset.dy)
            ? { dx: s.labelOffset.dx, dy: s.labelOffset.dy }
            : null,
    // Integer and in range, or NULL. A rejected row fails the whole upsert.
        label_font_size:
          typeof s.labelFontSize === 'number' && Number.isInteger(s.labelFontSize)
          && s.labelFontSize >= 8 && s.labelFontSize <= 48
            ? s.labelFontSize
            : null,
      })),
    },
    sectionSeats,
    status: {
      version: opts.version,
      selection_mode: opts.selectionMode,
      max_per_order: opts.maxPerOrder,
      taken: [],
      sections: statusSections,
    },
  }
}
