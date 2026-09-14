import { formatEventShort } from '@/lib/datetime'

/**
 * Whether a ticket tier can be bought right now — ONE definition, used by every
 * surface that shows or sells a tier.
 *
 * This exists because the last time a tier could be un-buyable, the answer was
 * written out separately in six places. The event page, the inline list, the
 * ticket-selector modal, both embed surfaces and the public API each had their
 * own `is_active` filter, and `create-purchase-intent` had none at all — so a
 * locked tier stayed purchasable by anyone holding its id while every buyer
 * surface pretended it was gone (fixed in v109). A scheduled window has exactly
 * the same shape and would rot exactly the same way, so it gets one predicate
 * that every caller imports.
 *
 * The money path deliberately does NOT import this: it is a Deno edge function
 * and cannot share a Next module. It enforces the same three rules inline, with
 * matching error codes — TIER_LOCKED / TIER_NOT_YET_ON_SALE / TIER_SALES_CLOSED.
 * If the rules below change, change them there too.
 */

export type TierSaleState =
    /** Buyable now. */
    | 'on_sale'
    /** Has a sales_start in the future. */
    | 'scheduled'
    /** Has a sales_end in the past. */
    | 'closed'
    /** The organizer's manual switch. */
    | 'locked'

export interface TierWindow {
    is_active?: boolean | null
    sales_start?: string | null
    sales_end?: string | null
    show_when_locked?: boolean | null
    lock_note?: string | null
}

/**
 * The manual lock is checked FIRST. An organizer who flips a tier off means it
 * now, whatever its schedule says — reporting "opens Friday" for something a
 * human deliberately closed would be a lie the schedule happens to make
 * available.
 *
 * `=== false` (not `!is_active`) throughout: NULL means "never configured",
 * which every existing buyer filter already treats as active. Blocking on null
 * would silently close every tier that predates the column.
 */
export function tierSaleState(tier: TierWindow, now: number = Date.now()): TierSaleState {
    if (tier?.is_active === false) return 'locked'

    if (tier?.sales_start) {
        const t = new Date(tier.sales_start).getTime()
        // An unparseable date must never close a tier that is otherwise open —
        // a typo in the database should not stop a sale.
        if (!Number.isNaN(t) && t > now) return 'scheduled'
    }
    if (tier?.sales_end) {
        const t = new Date(tier.sales_end).getTime()
        if (!Number.isNaN(t) && t < now) return 'closed'
    }
    return 'on_sale'
}

/** Can a buyer put this in their basket? */
export function isTierOnSale(tier: TierWindow, now?: number): boolean {
    return tierSaleState(tier, now) === 'on_sale'
}

/**
 * Should the tier appear on the page at all?
 *
 * Same rule the manual lock already used: un-buyable tiers vanish unless the
 * organizer ticked "show when locked". That flag now governs all three
 * un-buyable states rather than only the manual one — an early-bird that has
 * closed and an early-bird that was switched off should not behave differently
 * on the page, and reusing the existing control means no new setting to explain.
 */
export function isTierVisible(tier: TierWindow, now?: number): boolean {
    return isTierOnSale(tier, now) || tier?.show_when_locked === true
}

/**
 * The badge on an un-buyable tier. `lock_note` still wins where the organizer
 * wrote one, because a specific reason always beats a generic state.
 *
 * "Opens <date>" carries the date; "Sales closed" deliberately does not. Naming
 * the moment something opens is useful — a buyer can come back. Naming the
 * moment it shut only tells them how narrowly they missed it.
 */
export function tierSaleLabel(tier: TierWindow, now?: number): string | null {
    const state = tierSaleState(tier, now)
    if (state === 'on_sale') return null
    if (tier?.lock_note) return tier.lock_note
    if (state === 'scheduled' && tier.sales_start) {
        return `Opens ${formatEventShort(tier.sales_start)}`
    }
    if (state === 'closed') return 'Sales closed'
    return 'Not on sale'
}
