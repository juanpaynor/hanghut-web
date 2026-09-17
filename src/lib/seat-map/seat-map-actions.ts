'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { syncLiveSeatMap } from './sync-live'
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

  // Only the columns the chooser grid needs — NOT canvas_data. That jsonb holds
  // the full seat geometry (thousands of seats per arena); pulling it for every
  // template just to render cards made the picker crawl. Loaded on select instead.
  const { data, error } = await supabase
    .from('venue_templates')
    .select('id, name, venue_name, thumbnail_url, total_capacity, is_published, created_by')
    .or(`is_published.eq.true,created_by.eq.${user.id}`)
    .order('is_published', { ascending: false })
    .order('venue_name', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/** Just the canvas_data for one template — fetched when a template is picked,
 *  so the chooser stays light. */
export async function getVenueTemplateCanvas(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_templates')
    .select('canvas_data')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return (data?.canvas_data ?? null) as unknown
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
  return syncLiveSeatMap(supabase, eventId, canvasData, pricingMode, templateId)
}


/**
 * Event-level best-available settings (Seating tab). Owner or team seat.
 */
export async function updateSeatingSettings(
  eventId: string,
  settings: { seatSelectionMode?: 'best_available' | 'pick' | 'both'; avoidOrphanSeats?: boolean }
) {
  const { getAuthUser, getActingPartnerId } = await import('@/lib/auth/cached')
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { user } = await getAuthUser()
  if (!user) return { error: 'Not signed in' }
  const partnerId = await getActingPartnerId(user.id)
  if (!partnerId) return { error: 'No partner account' }

  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('id').eq('id', eventId).eq('organizer_id', partnerId).maybeSingle()
  if (!ev) return { error: 'Event not found' }

  const updates: Record<string, unknown> = {}
  if (settings.seatSelectionMode) updates.seat_selection_mode = settings.seatSelectionMode
  if (typeof settings.avoidOrphanSeats === 'boolean') updates.avoid_orphan_seats = settings.avoidOrphanSeats
  if (Object.keys(updates).length === 0) return { success: true }

  const { error } = await admin.from('events').update(updates).eq('id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}
