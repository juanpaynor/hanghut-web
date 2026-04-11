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

export async function saveEventSeatMap(
  eventId: string,
  canvasData: CanvasData,
  pricingMode: 'per_section' | 'per_seat' = 'per_section',
  templateId?: string
) {
  const supabase = await createClient()

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

  // Delete existing sections and seats (cascade handles seats)
  await supabase
    .from('event_sections')
    .delete()
    .eq('seat_map_id', seatMap.id)

  // Insert sections with their seats
  for (const section of canvasData.sections) {
    const { data: newSection, error: secError } = await supabase
      .from('event_sections')
      .insert({
        seat_map_id: seatMap.id,
        event_id: eventId,
        label: section.label,
        color: section.color,
        polygon_points: section.polygonPoints,
        arc_config: section.arcConfig || null,
        is_active: section.isActive,
        sort_order: section.sortOrder,
      })
      .select()
      .single()

    if (secError) throw new Error(secError.message)

    // Insert seats for this section
    if (section.seats.length > 0) {
      const seatRecords = section.seats.map((seat) => ({
        section_id: newSection.id,
        event_id: eventId,
        row_label: seat.rowLabel,
        seat_number: seat.seatNumber,
        label: seat.label,
        x: seat.x,
        y: seat.y,
        custom_price: seat.customPrice || null,
        status: 'available',
      }))

      const { error: seatError } = await supabase
        .from('seats')
        .insert(seatRecords)

      if (seatError) throw new Error(seatError.message)
    }
  }

  revalidatePath(`/organizer/events/${eventId}`)
  return seatMap
}
