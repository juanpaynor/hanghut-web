'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CanvasData, SectionData, SeatData } from '@/components/seat-map/types'
import { syncLiveSeatMap } from './sync-live'
import { diffCanvas, type PublishDiff } from './publish-diff'
import { buildPreviewBundle, type PreviewBundle } from './preview-bundle'

/**
 * Draft → Publish for event seat maps.
 *
 * The editor never writes to the tables the public picker reads. It saves a
 * DRAFT (seat_map_drafts, organizer-only); Publish diffs the draft against the
 * live map, refuses anything that would strand a sold ticket, then runs the
 * live sync (sections / seats / tier inventory / event capacity) and snapshots
 * the result into seat_map_versions.
 *
 * Every action here does its own acting-partner check and then uses the
 * service role — so team seats can edit and publish even though the RLS on
 * event_seat_maps is owner-only.
 */

type Ctx = { admin: ReturnType<typeof createAdminClient>; userId: string; partnerId: string }

async function ctxFor(eventId: string): Promise<Ctx | { error: string }> {
  const { user } = await getAuthUser()
  if (!user) return { error: 'Not signed in' }
  const partnerId = await getActingPartnerId(user.id)
  if (!partnerId) return { error: 'No partner account' }
  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('id').eq('id', eventId).eq('organizer_id', partnerId).maybeSingle()
  if (!ev) return { error: 'Event not found' }
  return { admin, userId: user.id, partnerId }
}

const isErr = (c: Ctx | { error: string }): c is { error: string } => 'error' in c

export interface SeatMapWorkspace {
  /** The published map, or null if this event has never published one. */
  live: { canvas: CanvasData; publishedVersion: number; publishedAt: string | null } | null
  /** The working copy, or null when there are no unpublished edits. */
  draft: { canvas: CanvasData; version: number; basePublishedVersion: number; updatedAt: string; updatedBy: string | null } | null
  versions: { version: number; publishedAt: string; publishedBy: string | null; summary: Record<string, unknown> }[]
  /** Pro entitlement for publishing (building is always free). */
  canPublish: boolean
  plan: string | null
}

/** Live seat status (booked / held) laid over a canvas so the editor shows sold
 *  seats and refuses to delete them. canvas_data itself never carries sale state. */
function overlayStatus(canvas: CanvasData, status: Map<string, string>): CanvasData {
  return {
    ...canvas,
    sections: (canvas.sections ?? []).map((s) => ({
      ...s,
      seats: (s.seats ?? []).map((seat) => {
        const st = status.get(seat.id)
        if (st === 'booked' || st === 'held') return { ...seat, status: st as SeatData['status'] }
        return { ...seat, status: seat.status === 'disabled' ? 'disabled' : 'available' }
      }),
    })),
  }
}

export async function getSeatMapWorkspace(eventId: string): Promise<SeatMapWorkspace | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { admin, partnerId } = c

  const [{ data: live }, { data: draft }, { data: versions }, { data: seats }, { data: ent }] = await Promise.all([
    admin.from('event_seat_maps').select('canvas_data, published_version, published_at').eq('event_id', eventId).maybeSingle(),
    admin.from('seat_map_drafts').select('canvas_data, version, base_published_version, updated_at, updated_by').eq('event_id', eventId).maybeSingle(),
    admin.from('seat_map_versions').select('version, published_at, published_by, summary').eq('event_id', eventId).order('version', { ascending: false }).limit(50),
    admin.from('seats').select('id, status').eq('event_id', eventId).in('status', ['booked', 'held']),
    admin.rpc('get_partner_entitlement', { p_partner_id: partnerId }),
  ])

  const status = new Map<string, string>((seats ?? []).map((s: any) => [s.id, s.status]))
  const userIds = new Set<string>()
  if (draft?.updated_by) userIds.add(draft.updated_by)
  for (const v of versions ?? []) if (v.published_by) userIds.add(v.published_by)
  const names = new Map<string, string>()
  if (userIds.size > 0) {
    const { data: profiles } = await admin.from('users').select('id, display_name, email').in('id', Array.from(userIds))
    for (const p of profiles ?? []) names.set(p.id, p.display_name || p.email || 'Team member')
  }

  const limits = (ent as any)?.limits ?? {}
  return {
    live: live
      ? { canvas: overlayStatus(live.canvas_data as CanvasData, status), publishedVersion: live.published_version ?? 0, publishedAt: live.published_at }
      : null,
    draft: draft
      ? {
          canvas: overlayStatus(draft.canvas_data as CanvasData, status),
          version: draft.version,
          basePublishedVersion: draft.base_published_version,
          updatedAt: draft.updated_at,
          updatedBy: draft.updated_by ? names.get(draft.updated_by) ?? null : null,
        }
      : null,
    versions: (versions ?? []).map((v: any) => ({
      version: v.version,
      publishedAt: v.published_at,
      publishedBy: v.published_by ? names.get(v.published_by) ?? null : null,
      summary: v.summary ?? {},
    })),
    canPublish: limits.seat_map_publish === true,
    plan: (ent as any)?.plan ?? null,
  }
}

/**
 * Save the working copy. `expectedVersion` is the draft version the editor
 * loaded (null = it loaded no draft). If the row moved underneath — another
 * seat saved since — nothing is written and the caller gets `conflict`.
 */
export async function saveSeatMapDraft(
  eventId: string,
  canvas: CanvasData,
  expectedVersion: number | null
): Promise<{ ok: true; version: number; updatedAt: string } | { conflict: true; version: number; updatedAt: string; updatedBy: string | null } | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { admin, userId } = c

  // Sale state never lives in the draft — statuses are re-overlaid on load.
  const clean: CanvasData = {
    ...canvas,
    sections: (canvas.sections ?? []).map((s) => ({
      ...s,
      seats: (s.seats ?? []).map((seat) => ({ ...seat, status: seat.status === 'disabled' ? 'disabled' : 'available' })),
    })),
  }

  const { data: live } = await admin.from('event_seat_maps').select('published_version').eq('event_id', eventId).maybeSingle()
  const basePublished = live?.published_version ?? 0
  const now = new Date().toISOString()

  if (expectedVersion == null) {
    // First save of a draft. A concurrent first save from another tab would
    // collide on the PK — surface that as a conflict rather than overwriting.
    const { data, error } = await admin
      .from('seat_map_drafts')
      .insert({ event_id: eventId, canvas_data: clean as any, version: 1, base_published_version: basePublished, updated_at: now, updated_by: userId })
      .select('version, updated_at')
      .single()
    if (error) {
      if (error.code === '23505') return conflictFor(admin, eventId)
      return { error: error.message }
    }
    return { ok: true, version: data.version, updatedAt: data.updated_at }
  }

  const { data, error } = await admin
    .from('seat_map_drafts')
    .update({ canvas_data: clean as any, version: expectedVersion + 1, updated_at: now, updated_by: userId })
    .eq('event_id', eventId)
    .eq('version', expectedVersion)
    .select('version, updated_at')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return conflictFor(admin, eventId)
  return { ok: true, version: data.version, updatedAt: data.updated_at }
}

async function conflictFor(admin: Ctx['admin'], eventId: string) {
  const { data } = await admin.from('seat_map_drafts').select('version, updated_at, updated_by').eq('event_id', eventId).maybeSingle()
  let updatedBy: string | null = null
  if (data?.updated_by) {
    const { data: p } = await admin.from('users').select('display_name, email').eq('id', data.updated_by).maybeSingle()
    updatedBy = p?.display_name || p?.email || null
  }
  return { conflict: true as const, version: data?.version ?? 0, updatedAt: data?.updated_at ?? new Date().toISOString(), updatedBy }
}

/** Throw the working copy away; the editor reloads the live map. */
export async function discardSeatMapDraft(eventId: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { error } = await c.admin.from('seat_map_drafts').delete().eq('event_id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export interface PublishPreview {
  diff: PublishDiff
  /** Hard stops — Publish is refused while any exist. */
  blockers: string[]
  /** Worth a second look, but allowed. */
  warnings: string[]
  canPublish: boolean
  plan: string | null
  draftVersion: number
  nextVersion: number
  /** The draft was forked from an older publish than the current live one. */
  staleBase: boolean
}

async function computePreview(c: Ctx, eventId: string): Promise<PublishPreview | { error: string }> {
  const { admin, partnerId } = c
  const [{ data: draft }, { data: live }, { data: dbSeats }, { data: tiers }, { data: ent }] = await Promise.all([
    admin.from('seat_map_drafts').select('canvas_data, version, base_published_version').eq('event_id', eventId).maybeSingle(),
    admin.from('event_seat_maps').select('canvas_data, published_version').eq('event_id', eventId).maybeSingle(),
    admin.from('seats').select('id, label, status').eq('event_id', eventId).in('status', ['booked', 'held']),
    admin.from('ticket_tiers').select('id, name').eq('event_id', eventId),
    admin.rpc('get_partner_entitlement', { p_partner_id: partnerId }),
  ])
  if (!draft) return { error: 'Nothing to publish — there are no unpublished changes.' }

  const liveCanvas = (live?.canvas_data ?? { sections: [], backgroundShapes: [], canvasWidth: 1400, canvasHeight: 900 }) as CanvasData
  const draftCanvas = draft.canvas_data as CanvasData
  const tierName = new Map((tiers ?? []).map((t: any) => [t.id, t.name]))
  const diff = diffCanvas(liveCanvas, draftCanvas, tierName)

  // Sold seats are the one thing a publish can never touch: the ticket in the
  // buyer's inbox names that seat. Removing or relabelling one is refused.
  const draftSeats = new Map<string, { seat: SeatData; section: SectionData }>()
  for (const s of draftCanvas.sections ?? []) for (const seat of s.seats ?? []) draftSeats.set(seat.id, { seat, section: s })

  const blockers: string[] = []
  const warnings: string[] = []
  const removedSold: string[] = []
  const relabelledSold: string[] = []
  const removedHeld: string[] = []
  for (const row of dbSeats ?? []) {
    const d = draftSeats.get(row.id)
    if (row.status === 'booked') {
      if (!d) removedSold.push(row.label)
      else if (d.seat.label !== row.label) relabelledSold.push(`${row.label} → ${d.seat.label}`)
      else if (d.seat.status === 'disabled') relabelledSold.push(`${row.label} (blocked)`)
    } else if (row.status === 'held' && !d) {
      removedHeld.push(row.label)
    }
  }
  const list = (xs: string[]) => xs.slice(0, 6).join(', ') + (xs.length > 6 ? ` +${xs.length - 6} more` : '')
  if (removedSold.length) blockers.push(`${removedSold.length} sold seat${removedSold.length > 1 ? 's' : ''} would be removed: ${list(removedSold)}. Sold seats stay on the map until the ticket is refunded.`)
  if (relabelledSold.length) blockers.push(`${relabelledSold.length} sold seat${relabelledSold.length > 1 ? 's' : ''} would change label or be blocked: ${list(relabelledSold)}. The buyer's ticket already names that seat.`)
  if (removedHeld.length) warnings.push(`${removedHeld.length} seat${removedHeld.length > 1 ? 's are' : ' is'} in someone's checkout right now and would be removed (${list(removedHeld)}). Their hold will fail at payment if you publish now.`)
  if (diff.sectionsRemoved.length) warnings.push(`Removing ${diff.sectionsRemoved.length} section${diff.sectionsRemoved.length > 1 ? 's' : ''}: ${list(diff.sectionsRemoved)}.`)
  for (const t of diff.tierInventory) {
    if (t.after < t.before) warnings.push(`${t.name}: inventory drops ${t.before} → ${t.after}.`)
  }
  const unpriced = diff.unpricedSeats
  if (unpriced > 0) warnings.push(`${unpriced} seat${unpriced > 1 ? 's have' : ' has'} no price category and won't be sellable.`)

  const limits = (ent as any)?.limits ?? {}
  const canPublish = limits.seat_map_publish === true
  if (!canPublish) blockers.push('Publishing a seat map is a HangHut Pro feature. Building and previewing stay free.')

  const publishedVersion = live?.published_version ?? 0
  return {
    diff,
    blockers,
    warnings,
    canPublish,
    plan: (ent as any)?.plan ?? null,
    draftVersion: draft.version,
    nextVersion: publishedVersion + 1,
    staleBase: draft.base_published_version !== publishedVersion,
  }
}

export async function previewSeatMapPublish(eventId: string): Promise<PublishPreview | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  return computePreview(c, eventId)
}

/**
 * Make the draft live. Re-runs the preview server-side (the dialog's copy is
 * advisory), refuses on any blocker, syncs the live tables, snapshots the
 * version and clears the draft — all as one logical publish.
 */
export async function publishSeatMap(
  eventId: string,
  expectedDraftVersion: number
): Promise<{ ok: true; version: number; summary: Record<string, unknown> } | { error: string; blockers?: string[] }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { admin, userId } = c

  const preview = await computePreview(c, eventId)
  if ('error' in preview) return preview
  if (preview.draftVersion !== expectedDraftVersion) {
    return { error: 'The draft changed since you opened this dialog. Review the changes again before publishing.' }
  }
  if (preview.blockers.length > 0) return { error: 'Publish blocked', blockers: preview.blockers }

  const { data: draft } = await admin.from('seat_map_drafts').select('canvas_data, version').eq('event_id', eventId).maybeSingle()
  if (!draft) return { error: 'Nothing to publish.' }
  const { data: liveRow } = await admin.from('event_seat_maps').select('template_id, pricing_mode').eq('event_id', eventId).maybeSingle()

  const canvas = draft.canvas_data as CanvasData
  const version = preview.nextVersion
  try {
    await syncLiveSeatMap(admin, eventId, canvas, (liveRow?.pricing_mode as any) ?? 'per_section', liveRow?.template_id ?? null, { version, userId })
  } catch (e: any) {
    return { error: e?.message || 'Publish failed while writing the live map.' }
  }

  const summary = {
    ...preview.diff.counts,
    total_seats: canvas.sections.reduce((n, s) => n + s.seats.length, 0),
    sections: canvas.sections.length,
  }
  // The snapshot is what Restore reads; take it from the canvas the sync
  // actually wrote (ids may have been regenerated by the collision guard).
  await admin.from('seat_map_versions').insert({ event_id: eventId, version, canvas_data: canvas as any, summary, published_by: userId })
  await admin.from('seat_map_drafts').delete().eq('event_id', eventId).eq('version', draft.version)

  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  return { ok: true, version, summary }
}

/** Copy a published snapshot into the draft (does not publish). */
export async function restoreSeatMapVersion(eventId: string, version: number): Promise<{ ok: true; draftVersion: number } | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { admin, userId } = c
  const [{ data: snap }, { data: live }, { data: draft }] = await Promise.all([
    admin.from('seat_map_versions').select('canvas_data').eq('event_id', eventId).eq('version', version).maybeSingle(),
    admin.from('event_seat_maps').select('published_version').eq('event_id', eventId).maybeSingle(),
    admin.from('seat_map_drafts').select('version').eq('event_id', eventId).maybeSingle(),
  ])
  if (!snap) return { error: 'That version no longer exists.' }
  const next = (draft?.version ?? 0) + 1
  const { error } = await admin.from('seat_map_drafts').upsert({
    event_id: eventId,
    canvas_data: snap.canvas_data as any,
    version: next,
    base_published_version: live?.published_version ?? 0,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }, { onConflict: 'event_id' })
  if (error) return { error: error.message }
  return { ok: true, draftVersion: next }
}

/**
 * What the buyer would see if the draft were published — geometry + seats in
 * the exact shape the picker fetches from /api/seat-map/*, built from the
 * draft (or the live map when there is no draft). Organizer-only.
 */
export async function getSeatMapPreviewBundle(eventId: string): Promise<PreviewBundle | { error: string }> {
  const c = await ctxFor(eventId)
  if (isErr(c)) return c
  const { admin } = c
  const [{ data: draft }, { data: live }, { data: tiers }, { data: ev }] = await Promise.all([
    admin.from('seat_map_drafts').select('canvas_data, version').eq('event_id', eventId).maybeSingle(),
    admin.from('event_seat_maps').select('canvas_data, canvas_width, canvas_height, published_version').eq('event_id', eventId).maybeSingle(),
    admin.from('ticket_tiers').select('id, name, price, sort_order').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
    admin.from('events').select('seat_selection_mode, max_seats_per_order').eq('id', eventId).maybeSingle(),
  ])
  const canvas = (draft?.canvas_data ?? live?.canvas_data) as CanvasData | undefined
  if (!canvas) return { error: 'No seat map to preview yet.' }
  return buildPreviewBundle(eventId, canvas, (tiers ?? []) as any, {
    version: draft ? 1_000_000 + draft.version : (live?.published_version ?? 0),
    selectionMode: (ev?.seat_selection_mode as any) ?? 'both',
    maxPerOrder: ev?.max_seats_per_order ?? 10,
    source: draft ? 'draft' : 'live',
  })
}
