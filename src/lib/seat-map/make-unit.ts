import { interiorPoint } from '@/components/seat-map/algorithms/point-in-polygon'
import type { SectionData, SeatData } from '@/components/seat-map/types'

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
