'use server'

import { createClient } from '@/lib/supabase/server'
import type { SectionType } from '@/components/seat-map/types'
import {
  normaliseOutline,
  validateSavedPiece,
  type SavedPiece,
} from './saved-piece'

/**
 * The venue's own saved pieces, in public.partner_furniture.
 *
 * Scoped to the PARTNER, not the user: a booth shape belongs to the bar, so
 * the owner must see what a manager saved. (venue_templates keys its own rows
 * on created_by = auth.uid(), which means a template saved by a manager is
 * invisible to the owner. Not repeated here.)
 *
 * Reads and writes go through the user's own client, so the RLS policy on the
 * table is the real boundary — the partner id resolved below is a convenience
 * for the INSERT, never the thing granting access. The service-role client is
 * deliberately not used anywhere in this file.
 */

/** Resolve the caller's partner (owner, or an ACTIVE team member).
 *
 *  `is_active` is checked here to match the table's RLS policy. Without it an
 *  deactivated member resolves a partner id that RLS then refuses, which
 *  surfaces as a confusing write error instead of a clean "no venue". */
async function resolvePartnerId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: owner } = await supabase
    .from('partners').select('id').eq('user_id', user.id).maybeSingle()
  if (owner) return owner.id

  const { data: tm } = await supabase
    .from('partner_team_members')
    .select('partner_id')
    .eq('user_id', user.id)
    .not('is_active', 'is', false)
    .maybeSingle()
  return tm?.partner_id ?? null
}

function rowToPiece(r: Record<string, unknown>): SavedPiece {
  return {
    id: String(r.id),
    name: String(r.name),
    // numeric comes back as a string from PostgREST; the outline is jsonb and
    // comes back as real numbers, but it is coerced anyway so one bad row
    // cannot put a string into a coordinate array the canvas does arithmetic on.
    outline: Array.isArray(r.outline) ? (r.outline as unknown[]).map(Number) : [],
    w: Number(r.w),
    h: Number(r.h),
    pax: Number(r.pax),
    sectionType: (r.section_type as SectionType | null) ?? null,
    color: (r.color as string | null) ?? null,
  }
}

/** Every saved piece for the caller's venue. Empty array on any failure: the
 *  palette's built-in catalogue must still render if this table is unreachable. */
export async function getSavedPieces(): Promise<SavedPiece[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('partner_furniture')
      .select('id, name, outline, w, h, pax, section_type, color')
      .order('name', { ascending: true })
    if (error) return []
    return (data ?? []).map(rowToPiece)
  } catch {
    return []
  }
}

export interface SavePieceResult {
  ok: boolean
  /** Shown to the organizer verbatim when !ok. */
  error?: string
  piece?: SavedPiece
}

/**
 * Save a section's outline as a reusable piece.
 *
 * `polygonPoints` arrives in ABSOLUTE canvas coordinates and is normalised to
 * origin 0,0 here rather than on the client, so a caller cannot store an
 * off-origin outline that would then place itself in the wrong spot.
 */
export async function saveSectionAsPiece(input: {
  name: string
  polygonPoints: number[]
  pax: number
  sectionType?: SectionType | null
  color?: string | null
}): Promise<SavePieceResult> {
  const supabase = await createClient()
  const partnerId = await resolvePartnerId(supabase)
  if (!partnerId) return { ok: false, error: 'No venue found on your account.' }

  if (!Array.isArray(input.polygonPoints) || input.polygonPoints.length < 6) {
    return { ok: false, error: 'That piece has no outline to save.' }
  }
  if (input.polygonPoints.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    return { ok: false, error: 'That outline contains invalid coordinates.' }
  }

  const { outline, w, h } = normaliseOutline(input.polygonPoints)
  const name = input.name.trim()
  const pax = Math.floor(Number(input.pax))

  const problem = validateSavedPiece({
    name, outline, w, h, pax, sectionType: input.sectionType ?? null,
  })
  if (problem) return { ok: false, error: problem }

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('partner_furniture')
    .insert({
      partner_id: partnerId,
      name,
      outline,
      w,
      h,
      pax,
      section_type: input.sectionType ?? null,
      color: input.color ?? null,
      created_by: user?.id ?? null,
    })
    // .select() is not optional here: without it a write that RLS filtered
    // returns error === null and this would report success having stored
    // nothing, which has already bitten the settings form and tier delete.
    .select('id, name, outline, w, h, pax, section_type, color')
    .single()

  if (error) {
    // 23505 is the unique index on (partner_id, lower(btrim(name))).
    if (error.code === '23505') {
      return { ok: false, error: `You already have a piece called “${name}”.` }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Could not save that piece.' }

  return { ok: true, piece: rowToPiece(data) }
}

/** Remove a saved piece. Pieces already PLACED on a map are unaffected —
 *  placing copies the outline into the section, so the library is a stencil,
 *  not a live link. Deleting one can never change a published map or a ticket. */
export async function deleteSavedPiece(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_furniture')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  // Same reason as above: an RLS-filtered delete reports no error and removes
  // nothing, so the returned rows are what prove it happened.
  if (!data || data.length === 0) return { ok: false, error: 'That piece is not yours to delete.' }
  return { ok: true }
}
