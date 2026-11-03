/**
 * Camera scale for tapping something there is nothing to READ inside — a unit
 * that sells whole, or a section holding a single seat.
 *
 * Those taps are about RECOGNITION, not inspection: the buyer needs to see
 * which thing they just tapped, while keeping the rest of the room for context.
 * The seat-fitting camera is the opposite of what they need. With one seat the
 * bounds collapse to a point, so "fit the seats" became "fit a 96-unit pad",
 * which pinned a bar table at the 6x ceiling on every tap and threw the room
 * away.
 *
 * So: grow the piece until it reads at about RECOGNISE_PX across, never shrink
 * below what the buyer already had, and never more than double the current
 * view. A table already big enough on screen does not move at all.
 */
export const RECOGNISE_PX = 110
export const RECOGNISE_MAX_FACTOR = 2

export function recogniseScale(w: number, h: number, current: number): number {
    if (!isFinite(current) || current <= 0) return current
    const want = RECOGNISE_PX / Math.max(1, Math.max(w, h))
    return Math.min(Math.max(current, want), current * RECOGNISE_MAX_FACTOR)
}
