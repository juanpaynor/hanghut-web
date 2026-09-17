import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasData } from '@/components/seat-map/types'
import { findStage, shapeCenter, rowOrderFromStage, ensureRows } from './rows'

/**
 * The live-map writer behind both the legacy direct save and Publish
 * (draft-actions.ts). Takes the client so Publish can run it as service role
 * after its own acting-partner check (team seats can publish; the RLS on
 * event_seat_maps is owner-only).
 */
export async function syncLiveSeatMap(
  supabase: SupabaseClient,
  eventId: string,
  canvasData: CanvasData,
  pricingMode: 'per_section' | 'per_seat' = 'per_section',
  templateId?: string | null,
  publish?: { version: number; userId: string | null }
) {
  // De-collide seat labels per (section, row) BEFORE anything is persisted, so
  // the editor's canvas_data and the seats table (buyer + scanner) always agree
  // AND the (section,row,seat_number) unique constraint can never trip. Mutates
  // canvasData in place so the canvas_data JSONB and the seat rows match exactly.
  for (const section of canvasData.sections) {
    const used = new Set<string>()
    for (const seat of section.seats) {
      let num = seat.seatNumber
      while (used.has(`${seat.rowLabel}#${num}`)) num++
      if (num !== seat.seatNumber) {
        seat.seatNumber = num
        seat.label = `${seat.rowLabel}${num}`
      }
      used.add(`${seat.rowLabel}#${num}`)
    }
  }

  // ── Guard against cross-event id collisions ───────────────────────────────
  // Sections/seats are upserted by the ids inside canvas_data. A map applied from
  // a template (or otherwise copied) carries the SOURCE event's section/seat ids;
  // upserting those (onConflict:'id') tries to UPDATE another event's rows and
  // trips their owner-only RLS ("new row violates row-level security policy
  // (USING expression)") — or, same-owner, silently overwrites that event.
  //
  // Rule: keep only ids that already belong to THIS event (so a re-save preserves
  // sold/held seats via the id-matched upsert); regenerate every other incoming
  // id. A genuinely new seat doesn't care about its id, and a foreign one MUST
  // change. This also heals a canvas_data that a prior failed save left poisoned.
  const { data: ownSections } = await supabase
    .from('event_sections')
    .select('id')
    .eq('event_id', eventId)
  const ownSectionIds = new Set((ownSections ?? []).map((s) => s.id))

  const { data: existingSeats } = await supabase
    .from('seats')
    .select('id, status')
    .eq('event_id', eventId)
  const existingStatus = new Map((existingSeats ?? []).map((s) => [s.id, s.status]))

  for (const section of canvasData.sections) {
    if (!ownSectionIds.has(section.id)) section.id = crypto.randomUUID()
    for (const seat of section.seats) {
      // seat.section_id is derived from the parent section at record-build time,
      // so a regenerated section id is picked up automatically.
      if (!existingStatus.has(seat.id)) seat.id = crypto.randomUUID()
    }
  }

  // ── Rows + front row ──────────────────────────────────────────────────
  // Every section carries its rows (derived once for pre-row maps so the
  // buyer picker can label them), and the front row for best-available is
  // read off the Stage unless the organizer set it by hand.
  const stage = findStage(canvasData.backgroundShapes ?? [])
  const stageCenter = stage ? shapeCenter(stage) : null
  canvasData.sections = canvasData.sections.map((section) => {
    const withRows = ensureRows(section, canvasData.seatRadius ?? 8)
    if (stageCenter && !withRows.rowOrderManual) {
      const derived = rowOrderFromStage(withRows, stageCenter)
      if (derived) return { ...withRows, rowOrder: derived }
    }
    return withRows
  })

  // Upsert event_seat_maps
  const { data: seatMap, error: mapError } = await supabase
    .from('event_seat_maps')
    .upsert(
      {
        event_id: eventId,
        template_id: templateId || null,
        canvas_data: canvasData as unknown as Record<string, unknown>,
        canvas_width: canvasData.canvasWidth,
        canvas_height: canvasData.canvasHeight,
        pricing_mode: pricingMode,
        // Bumps the buyer-side geometry version token (get_event_seat_geometry
        // keys its cache on updated_at) — only a publish should ever do this.
        updated_at: new Date().toISOString(),
        ...(publish ? {
          published_version: publish.version,
          published_at: new Date().toISOString(),
          published_by: publish.userId,
        } : {}),
      },
      { onConflict: 'event_id' }
    )
    .select()
    .single()

  if (mapError) throw new Error(mapError.message)

  // (existing seat status snapshotted above, before the id-collision guard, so we
  // can both remap foreign ids and preserve sold/held status from one read.)

  // ── Upsert sections (canvas ID = DB ID) ───────────────────────────────
  const sectionRecords = canvasData.sections.map((section) => ({
    id: section.id,
    seat_map_id: seatMap.id,
    event_id: eventId,
    label: section.label,
    color: section.color,
    section_type: section.sectionType || 'general',
    polygon_points: section.polygonPoints,
    arc_config: section.arcConfig || null,
    tier_id: section.tierId || null,
    row_tier_overrides: section.rowTierOverrides ?? {},
    row_order: section.rowOrder === 'desc' ? 'desc' : 'asc',
    rows: (section.rows ?? []).map((r) => ({ ...r })),
    show_row_labels: section.showRowLabels !== false,
    is_active: section.isActive,
    sort_order: section.sortOrder,
  }))

  if (sectionRecords.length > 0) {
    const { error: secError } = await supabase
      .from('event_sections')
      .upsert(sectionRecords, { onConflict: 'id' })
    if (secError) throw new Error(secError.message)
  }

  // ── Upsert seats (canvas ID = DB ID, existing status wins) ────────────
  const seatRecords = canvasData.sections.flatMap((section) =>
    section.seats.map((seat) => ({
      id: seat.id,
      section_id: section.id,
      event_id: eventId,
      row_label: seat.rowLabel,
      seat_number: seat.seatNumber,
      label: seat.label,
      x: seat.x,
      y: seat.y,
      custom_price: seat.customPrice || null,
      tier_id: seat.tierId || null,
      // DB 'booked'/'held' always win (protect sold/in-flight seats); otherwise
      // honor the editor's status so 'disabled' (blocked) ↔ 'available' persists.
      status: (() => {
        const prev = existingStatus.get(seat.id)
        if (prev === 'booked' || prev === 'held') return prev
        return seat.status === 'disabled' ? 'disabled' : 'available'
      })(),
    }))
  )

  // Guard the (section_id, row_label, seat_number) unique constraint. Hand-placed,
  // straightened, or duplicated seats can collide on number within a row; bump any
  // duplicate to the next free number in its section+row so the save never fails.
  const seenPerSection = new Map<string, Set<string>>()
  for (const rec of seatRecords) {
    let seen = seenPerSection.get(rec.section_id)
    if (!seen) { seen = new Set(); seenPerSection.set(rec.section_id, seen) }
    let num = rec.seat_number
    while (seen.has(`${rec.row_label}#${num}`)) num++
    if (num !== rec.seat_number) {
      rec.seat_number = num
      rec.label = `${rec.row_label}${num}`
    }
    seen.add(`${rec.row_label}#${num}`)
  }

  if (seatRecords.length > 0) {
    const { error: seatError } = await supabase
      .from('seats')
      .upsert(seatRecords, { onConflict: 'id' })
    if (seatError) throw new Error(seatError.message)
  }

  // ── Remove seats/sections no longer in the canvas ─────────────────────
  // Booked seats are never deleted — the map can't orphan a sold ticket.
  const keptSeatIds = new Set(seatRecords.map((s) => s.id))
  const staleSeatIds = (existingSeats ?? [])
    .filter((s) => !keptSeatIds.has(s.id) && s.status !== 'booked')
    .map((s) => s.id)

  if (staleSeatIds.length > 0) {
    const { error: delSeatError } = await supabase
      .from('seats')
      .delete()
      .in('id', staleSeatIds)
    if (delSeatError) throw new Error(delSeatError.message)
  }

  const keptSectionIds = canvasData.sections.map((s) => s.id)
  let staleSections = supabase
    .from('event_sections')
    .delete()
    .eq('seat_map_id', seatMap.id)
  if (keptSectionIds.length > 0) {
    staleSections = staleSections.not('id', 'in', `(${keptSectionIds.join(',')})`)
  }
  const { error: delSecError } = await staleSections
  if (delSecError) throw new Error(delSecError.message)

  // ── Sync tier capacity from seat assignments ──────────────────────────
  // For seated events the map is the source of truth for how many tickets
  // exist in each price category.
  const tierCounts = new Map<string, number>()
  for (const section of canvasData.sections) {
    for (const seat of section.seats) {
      const tierId = seat.tierId ?? section.rowTierOverrides?.[seat.rowLabel] ?? section.tierId ?? null
      if (tierId) tierCounts.set(tierId, (tierCounts.get(tierId) ?? 0) + 1)
    }
  }
  // Every tier the map references through SEATS (section default on a seated
  // section, row override, or per-seat) must be synced — including ones whose
  // seats were just deleted/reassigned, so their quantity_total resets to 0
  // instead of advertising phantom capacity. GA zones (a tier on a section with
  // NO seats) sell by their TYPED quantity, so those tiers are left untouched —
  // zeroing them would kill the zone's inventory.
  const gaZoneTierIds = new Set(
    canvasData.sections.filter((s) => s.seats.length === 0 && s.tierId).map((s) => s.tierId as string)
  )
  const referencedTierIds = new Set<string>(tierCounts.keys())
  for (const section of canvasData.sections) {
    if (section.seats.length === 0) continue // GA zone — typed quantity is authoritative
    if (section.tierId) referencedTierIds.add(section.tierId)
    for (const t of Object.values(section.rowTierOverrides ?? {})) {
      if (t) referencedTierIds.add(t)
    }
  }

  for (const tierId of referencedTierIds) {
    if (gaZoneTierIds.has(tierId)) continue // shared with a GA zone — don't clobber
    await supabase
      .from('ticket_tiers')
      .update({ quantity_total: tierCounts.get(tierId) ?? 0 })
      .eq('id', tierId)
      .eq('event_id', eventId)
  }

  // ── Sync event capacity from the map ──────────────────────────────────
  // Sellable capacity = non-disabled seats + GA-zone tier inventory. Keeps
  // events.capacity truthful for assigned-seating events (the wizard only asks
  // for an estimate). Non-fatal: events_capacity_check requires > 0, so an
  // empty map leaves capacity alone.
  try {
    const activeSeats = canvasData.sections.reduce(
      (sum, s) => sum + s.seats.filter((seat) => seat.status !== 'disabled').length, 0
    )
    let gaCapacity = 0
    if (gaZoneTierIds.size > 0) {
      const { data: gaTiers } = await supabase
        .from('ticket_tiers')
        .select('quantity_total')
        .eq('event_id', eventId)
        .in('id', Array.from(gaZoneTierIds))
      gaCapacity = (gaTiers ?? []).reduce((sum, t) => sum + (t.quantity_total ?? 0), 0)
    }
    const totalCapacity = activeSeats + gaCapacity
    if (totalCapacity > 0) {
      const { error: capErr } = await supabase
        .from('events')
        .update({ capacity: totalCapacity })
        .eq('id', eventId)
      if (capErr) console.error('Capacity sync skipped:', capErr.message)
    }
  } catch (e) {
    console.error('Capacity sync failed (non-fatal):', e)
  }

  revalidatePath(`/organizer/events/${eventId}`)
  return seatMap
}

