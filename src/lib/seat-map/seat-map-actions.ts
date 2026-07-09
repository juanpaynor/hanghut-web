'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CanvasData } from '@/components/seat-map/types'

// ─── Venue Templates (Admin) ────────────────────────────────────────────────

export async function getVenueTemplates() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getPublishedVenueTemplates() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_templates')
    .select('*')
    .eq('is_published', true)
    .order('venue_name', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/** Templates an organizer can start from: published (admin-curated) + their own. */
export async function getUsableVenueTemplates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('venue_templates')
    .select('*')
    .or(`is_published.eq.true,created_by.eq.${user.id}`)
    .order('is_published', { ascending: false })
    .order('venue_name', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function getVenueTemplate(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_templates')
    .select(`
      *,
      template_sections (*)
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function saveVenueTemplate(
  templateId: string | null,
  data: {
    name: string
    venue_name: string
    venue_address?: string
    canvas_data: CanvasData
    tags?: string[]
    is_published?: boolean
    thumbnail_url?: string | null
  }
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Compute total capacity from canvas data
  const totalCapacity = data.canvas_data.sections.reduce(
    (sum, s) => sum + s.seats.length,
    0
  )

  const record = {
    name: data.name,
    venue_name: data.venue_name,
    venue_address: data.venue_address || null,
    canvas_data: data.canvas_data as unknown as Record<string, unknown>,
    canvas_width: data.canvas_data.canvasWidth,
    canvas_height: data.canvas_data.canvasHeight,
    total_capacity: totalCapacity,
    tags: data.tags || [],
    is_published: data.is_published ?? false,
    thumbnail_url: data.thumbnail_url ?? null,
    updated_at: new Date().toISOString(),
  }

  let templateResult

  if (templateId) {
    // Update
    const { data: result, error } = await supabase
      .from('venue_templates')
      .update(record)
      .eq('id', templateId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    templateResult = result
  } else {
    // Insert
    const { data: result, error } = await supabase
      .from('venue_templates')
      .insert({ ...record, created_by: user.id })
      .select()
      .single()

    if (error) throw new Error(error.message)
    templateResult = result
  }

  // Sync template_sections from canvas data
  const templateIdFinal = templateResult.id

  // Delete existing sections
  await supabase
    .from('template_sections')
    .delete()
    .eq('template_id', templateIdFinal)

  // Insert sections from canvas data
  if (data.canvas_data.sections.length > 0) {
    const sections = data.canvas_data.sections.map((s, i) => ({
      template_id: templateIdFinal,
      label: s.label,
      polygon_points: s.polygonPoints,
      arc_config: s.arcConfig || null,
      row_count: s.rowCount,
      seats_per_row: s.seatsPerRow,
      seat_orientation: s.seatOrientation,
      default_color: s.color,
      section_type: s.sectionType,
      sort_order: i,
    }))

    const { error: secError } = await supabase
      .from('template_sections')
      .insert(sections)

    if (secError) throw new Error(secError.message)
  }

  revalidatePath('/admin/venue-templates')
  return templateResult
}

export async function deleteVenueTemplate(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('venue_templates')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/venue-templates')
}

export async function toggleTemplatePublished(id: string, isPublished: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('venue_templates')
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/venue-templates')
}

// ─── Event Seat Maps (Organizer) ────────────────────────────────────────────

export async function getEventSeatMap(eventId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('event_seat_maps')
    .select(`
      *,
      event_sections (
        *,
        seats (*)
      )
    `)
    .eq('event_id', eventId)
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Non-destructive seat map save.
 *
 * Canvas IDs ARE the database IDs (sections and seats are upserted by the
 * UUIDs the builder generates), so canvas_data and the relational tables
 * stay linkable — required for the buyer-side hold/purchase flow.
 *
 * Existing seat status is preserved (a re-save never resurrects a booked
 * seat), and seats/sections with booked seats are never deleted.
 */
export async function saveEventSeatMap(
  eventId: string,
  canvasData: CanvasData,
  pricingMode: 'per_section' | 'per_seat' = 'per_section',
  templateId?: string
) {
  const supabase = await createClient()

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' }
    )
    .select()
    .single()

  if (mapError) throw new Error(mapError.message)

  // Snapshot existing seats: preserve sold/held status across saves and
  // protect booked seats from deletion
  const { data: existingSeats } = await supabase
    .from('seats')
    .select('id, status')
    .eq('event_id', eventId)
  const existingStatus = new Map((existingSeats ?? []).map((s) => [s.id, s.status]))

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
  // Every tier the map *references* (section default, row override, or per-seat)
  // must be synced — including ones whose seats were just deleted/reassigned, so
  // their quantity_total resets to 0 instead of advertising phantom capacity.
  // Tiers never referenced by the map (pure GA tiers) are left untouched.
  const referencedTierIds = new Set<string>(tierCounts.keys())
  for (const section of canvasData.sections) {
    if (section.tierId) referencedTierIds.add(section.tierId)
    for (const t of Object.values(section.rowTierOverrides ?? {})) {
      if (t) referencedTierIds.add(t)
    }
  }

  for (const tierId of referencedTierIds) {
    await supabase
      .from('ticket_tiers')
      .update({ quantity_total: tierCounts.get(tierId) ?? 0 })
      .eq('id', tierId)
      .eq('event_id', eventId)
  }

  revalidatePath(`/organizer/events/${eventId}`)
  return seatMap
}
