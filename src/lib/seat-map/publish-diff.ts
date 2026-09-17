import type { CanvasData, SeatData, SectionData } from '@/components/seat-map/types'
import { resolveSeatTier } from '@/components/seat-map/types'

/**
 * What a publish would change, live map → draft. Keyed by the ids the builder
 * generates (canvas id = DB id), so "moved" and "re-priced" are real per-seat
 * facts, not label heuristics.
 */
export interface PublishDiff {
  counts: {
    sections_added: number
    sections_removed: number
    sections_renamed: number
    seats_added: number
    seats_removed: number
    seats_moved: number
    seats_relabelled: number
    seats_repriced: number
    seats_blocked: number
    seats_unblocked: number
  }
  sectionsAdded: string[]
  sectionsRemoved: string[]
  sectionsRenamed: string[]      // "Old → New"
  /** Per price category: sellable seat count before and after. */
  tierInventory: { tierId: string; name: string; before: number; after: number }[]
  /** Seats in the draft with no price category at any level. */
  unpricedSeats: number
  totalBefore: number
  totalAfter: number
  /** True when nothing sellable changes (pure decor / colour edits). */
  cosmeticOnly: boolean
}

type Indexed = { seat: SeatData; section: SectionData; tier: string | null }

function indexSeats(canvas: CanvasData): Map<string, Indexed> {
  const m = new Map<string, Indexed>()
  for (const section of canvas.sections ?? []) {
    for (const seat of section.seats ?? []) {
      m.set(seat.id, { seat, section, tier: resolveSeatTier(seat, section) })
    }
  }
  return m
}

function tierCounts(canvas: CanvasData): Map<string, number> {
  const counts = new Map<string, number>()
  for (const section of canvas.sections ?? []) {
    for (const seat of section.seats ?? []) {
      if (seat.status === 'disabled') continue
      const t = resolveSeatTier(seat, section)
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return counts
}

export function diffCanvas(live: CanvasData, draft: CanvasData, tierName: Map<string, string>): PublishDiff {
  const liveSections = new Map((live.sections ?? []).map((s) => [s.id, s]))
  const draftSections = new Map((draft.sections ?? []).map((s) => [s.id, s]))

  const sectionsAdded: string[] = []
  const sectionsRemoved: string[] = []
  const sectionsRenamed: string[] = []
  for (const [id, s] of draftSections) {
    const prev = liveSections.get(id)
    if (!prev) sectionsAdded.push(s.label)
    else if (prev.label !== s.label) sectionsRenamed.push(`${prev.label} → ${s.label}`)
  }
  for (const [id, s] of liveSections) if (!draftSections.has(id)) sectionsRemoved.push(s.label)

  const before = indexSeats(live)
  const after = indexSeats(draft)
  let seats_added = 0, seats_removed = 0, seats_moved = 0, seats_relabelled = 0, seats_repriced = 0, seats_blocked = 0, seats_unblocked = 0
  let unpricedSeats = 0
  for (const [id, cur] of after) {
    if (!cur.tier) unpricedSeats++
    const prev = before.get(id)
    if (!prev) { seats_added++; continue }
    if (Math.abs(prev.seat.x - cur.seat.x) > 0.5 || Math.abs(prev.seat.y - cur.seat.y) > 0.5) seats_moved++
    if (prev.seat.label !== cur.seat.label) seats_relabelled++
    if ((prev.tier ?? null) !== (cur.tier ?? null)) seats_repriced++
    const wasBlocked = prev.seat.status === 'disabled'
    const isBlocked = cur.seat.status === 'disabled'
    if (!wasBlocked && isBlocked) seats_blocked++
    if (wasBlocked && !isBlocked) seats_unblocked++
  }
  for (const id of before.keys()) if (!after.has(id)) seats_removed++

  const tb = tierCounts(live)
  const ta = tierCounts(draft)
  const tierIds = new Set<string>([...tb.keys(), ...ta.keys()])
  const tierInventory = Array.from(tierIds).map((tierId) => ({
    tierId,
    name: tierName.get(tierId) ?? 'Unknown category',
    before: tb.get(tierId) ?? 0,
    after: ta.get(tierId) ?? 0,
  })).filter((t) => t.before !== t.after)

  const counts = {
    sections_added: sectionsAdded.length,
    sections_removed: sectionsRemoved.length,
    sections_renamed: sectionsRenamed.length,
    seats_added, seats_removed, seats_moved, seats_relabelled, seats_repriced, seats_blocked, seats_unblocked,
  }
  const sellableChange = seats_added + seats_removed + seats_relabelled + seats_repriced + seats_blocked + seats_unblocked
    + sectionsAdded.length + sectionsRemoved.length + tierInventory.length

  return {
    counts,
    sectionsAdded, sectionsRemoved, sectionsRenamed,
    tierInventory,
    unpricedSeats,
    totalBefore: before.size,
    totalAfter: after.size,
    cosmeticOnly: sellableChange === 0,
  }
}
