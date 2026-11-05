import { interiorPoint } from '@/components/seat-map/algorithms/point-in-polygon'
import type { SectionData, SeatData } from '@/components/seat-map/types'
import { seatsAroundOutline, isConvexOutline, CHAIR_GAP_FACTOR } from './table-seats'

/**
 * Turning any hand-drawn section into a piece that sells WHOLE.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The editor could already draw a custom shape: the polygon tool traces any
 * outline, and "Admits (people)" makes a section sell as one unit. But the two
 * never met. Capacity only takes effect on a section holding EXACTLY ONE seat
 * (that seat IS the table — it is the single inventory row the seat_holds
 * machinery protects), and nothing in the UI got a section down to one seat.
 * The organizer was told "a table needs exactly one seat" and left to work out
 * that this meant opening Details, setting the fill grid to 1x1 and
 * regenerating. An instruction describing a procedure the software could
 * simply perform is the bug.
 *
 * So: draw any shape with the polygon tool, press one button, and it sells
 * whole. No catalogue entry needed for a venue whose booths are its own.
 *
 * ── Why it can refuse ───────────────────────────────────────────────────────
 *
 * Collapsing to one seat DESTROYS the others, and a sold seat can never be
 * dropped — the save refuses to delete booked rows, which historically meant
 * invisible duplicates and oversell. So a section with any booked seat is
 * refused outright rather than half-converted.
 */

export interface SellWholeCheck {
  /** False means do not offer the action at all. */
  ok: boolean
  /** Stated in terms an organizer can act on. Only set when !ok. */
  reason?: string
  /** Unsold seats that pressing the button would remove. */
  destroying: number
  /** A capacity worth pre-filling: what the section already seated. */
  suggestedPax: number
}

export function checkSellWhole(section: SectionData): SellWholeCheck {
  const booked = section.seats.filter((s) => s.status === 'booked')
  const destroying = Math.max(0, section.seats.length - 1)
  // The seats it currently holds is the best guess at how many the piece fits —
  // someone who drew a booth and filled six seats means a six-person booth.
  const suggestedPax = Math.max(1, section.seats.length || 4)

  if ((section.unitCapacity ?? 0) > 0 && section.seats.length === 1) {
    return { ok: false, reason: 'Already sells whole.', destroying: 0, suggestedPax }
  }
  if (booked.length > 0) {
    return {
      ok: false,
      reason:
        `${booked.length} seat${booked.length === 1 ? '' : 's'} in here ${booked.length === 1 ? 'is' : 'are'} already sold. ` +
        `Selling the whole thing would have to remove ${booked.length === 1 ? 'it' : 'them'}, which would ` +
        `invalidate ${booked.length === 1 ? 'that ticket' : 'those tickets'}. Make a new piece instead.`,
      destroying,
      suggestedPax,
    }
  }
  if (section.polygonPoints.length < 6) {
    return { ok: false, reason: 'This section has no outline to sell.', destroying, suggestedPax }
  }
  return { ok: true, destroying, suggestedPax }
}

/**
 * The updates that make a section sell whole. Caller dispatches them through
 * history, so ⌘Z puts the seats back.
 *
 * The FIRST existing seat's id is reused rather than minting a new one: canvas
 * id = DB id, so reusing it makes the save an UPDATE of a row that is already
 * there instead of an insert alongside deletes.
 */
export function sellWholeUpdates(section: SectionData, pax: number): Partial<SectionData> {
  const { x, y } = interiorPoint(section.polygonPoints)
  const keep = section.seats[0]
  const seat: SeatData = {
    id: keep?.id ?? crypto.randomUUID(),
    rowLabel: 'T',
    seatNumber: 1,
    label: 'T1',
    x,
    y,
    status: keep?.status ?? 'available',
    rowId: null,
  }
  return {
    seats: [seat],
    // Rows are the thing that generates seats; a one-seat piece has nothing to
    // generate, and a leftover row would re-scatter seats on the next refill.
    rows: [],
    rowCount: 1,
    seatsPerRow: 1,
    unitCapacity: Math.max(1, Math.floor(pax) || 1),
    // A one-seat "row" has no label worth drawing over the piece.
    showRowLabels: false,
  }
}

// ─── The other direction: a table that sells one chair at a time ───────────

/**
 * Turning a piece that sells WHOLE into chairs people buy individually.
 *
 * The roadmap decision was that a table sells BOTH ways, chosen per table.
 * sellWholeUpdates above is one direction; this is the other, and together
 * they make the choice reversible instead of something you commit to when you
 * drop the piece from the palette.
 *
 * What comes out is an ORDINARY seated section. The chairs are plain rows in
 * `seats`, so holds, best-available, the scanner, refunds and the unique index
 * from Phase 1 all apply to them with no special case. The only thing that
 * marks it as a table is where the seats are — on a ring outside the outline —
 * and that is also how the renderers know to turn the chairs inward. See
 * isRingSection in table-seats.ts.
 */

export interface SeatIndividuallyCheck {
  ok: boolean
  reason?: string
  /** How many chairs the button would create. */
  creating: number
}

export function checkSeatIndividually(section: SectionData, seatRadius: number): SeatIndividuallyCheck {
  const pax = Math.max(1, Math.floor(section.unitCapacity ?? 0) || section.seats.length || 1)

  if (section.polygonPoints.length < 6) {
    return { ok: false, reason: 'This section has no outline to seat chairs around.', creating: 0 }
  }
  if (!((section.unitCapacity ?? 0) > 0 && section.seats.length === 1)) {
    return { ok: false, reason: 'This already sells seat by seat.', creating: 0 }
  }
  // The single seat IS the sold table. Splitting it into eight chairs would
  // destroy the row the buyer's ticket points at, and leave eight free chairs
  // at a table someone has paid for. Refusing outright is the same rule
  // checkSellWhole applies in the other direction.
  if (section.seats.some((s) => s.status === 'booked')) {
    return {
      ok: false,
      reason:
        'This table is already sold. Splitting it into chairs would remove the row that ticket points at, ' +
        'and put the chairs back on sale underneath the buyer. Make a new piece instead.',
      creating: 0,
    }
  }
  // Below two there is no ring to speak of, and "one chair around a table" is
  // just the table with extra steps.
  if (pax < 2) {
    return { ok: false, reason: 'Set Admits to 2 or more first — one chair is just the piece itself.', creating: 0 }
  }
  if (seatRadius <= 0) {
    return { ok: false, reason: 'Seat size must be positive.', creating: 0 }
  }
  // Chairs are placed by pushing outwards from each edge, and at an INWARD
  // corner -- the opening of a U, a C or an L -- "outwards" points into the
  // notch, so chairs land on the piece instead of at it. Measured: those three
  // each put two of their chairs inside their own outline.
  //
  // Refusing is the honest answer rather than the lazy one. A booth is a booth
  // because you take the whole thing; nobody sells the third seat of a U booth
  // to a stranger. If that ever changes, the fix is a real inside-the-opening
  // layout, not a nudge to this one.
  if (!isConvexOutline(section.polygonPoints)) {
    return {
      ok: false,
      reason:
        'This shape curves back on itself — a booth, a horseshoe or an L. Chairs placed around it ' +
        'would land on the piece instead of at it, so it sells whole. Tables, boxes and straight ' +
        'benches can be seated chair by chair.',
      creating: 0,
    }
  }
  return { ok: true, creating: pax }
}

/**
 * The updates that seat a piece chair by chair. Caller dispatches through
 * history, so ⌘Z restores the single sellable table.
 *
 * The first existing seat's id is reused for the first chair, for the same
 * reason sellWholeUpdates reuses it: canvas id = DB id, so one chair is an
 * UPDATE of the row that is already there rather than a delete plus an insert.
 *
 * unitCapacity is cleared. Leaving it would be a contradiction the rest of the
 * system reads as truth — the door would admit the whole table on the strength
 * of any ONE of its chairs, which is the Phase 0 admission rule working exactly
 * as designed on a section that should no longer be a unit.
 */
export function seatIndividuallyUpdates(
  section: SectionData,
  seatRadius: number,
): Partial<SectionData> {
  const pax = Math.max(2, Math.floor(section.unitCapacity ?? 0) || section.seats.length || 2)
  const positions = seatsAroundOutline(section.polygonPoints, pax, seatRadius * CHAIR_GAP_FACTOR)
  const keep = section.seats[0]

  const seats: SeatData[] = positions.map((p, i) => ({
    id: i === 0 ? (keep?.id ?? crypto.randomUUID()) : crypto.randomUUID(),
    rowLabel: section.label || 'T',
    seatNumber: i + 1,
    label: `${section.label || 'T'}-${i + 1}`,
    x: p.x,
    y: p.y,
    status: 'available',
    rowId: null,
  }))

  return {
    seats,
    // No RowData: the chairs follow the outline, not a line or an arc, so
    // there is no path for applyRowLayout to regenerate them along. A leftover
    // row would re-scatter them off the table on the next refill.
    rows: [],
    rowCount: 1,
    seatsPerRow: seats.length,
    unitCapacity: undefined,
    // Each chair carries its own number; a row label stamped across the table
    // would just sit on top of the piece.
    showRowLabels: false,
  }
}
