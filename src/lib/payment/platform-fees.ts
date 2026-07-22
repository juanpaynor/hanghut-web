/**
 * Single source of truth for HangHut's platform pricing.
 *
 * The platform take on an order is `pct% × net + fixed × quantity`, collected as
 * ONE inline Xendit PLATFORM fee (no split rules). The customer's processing fee
 * is always absorbed by the organizer, never added to their bill.
 *
 * Deno edge functions can't import from `src/`, so the same numbers are mirrored
 * by hand in create-purchase-intent / create-experience-intent / xendit-webhook.
 * If you change a default here, change it there too.
 */

/** New standard platform commission for newly approved partners (%). */
export const DEFAULT_PLATFORM_PCT = 2
/** Per-ticket fixed booking fee (₱). */
export const DEFAULT_FIXED_FEE = 15
/** Pre-redesign standard — existing partners were backfilled to this explicitly. */
export const LEGACY_STANDARD_PCT = 4

/**
 * Resolve a partner's effective platform %. `0` is a valid rate, so this uses
 * `??` — never `||` (which would turn a deliberate 0% into the default).
 */
export function resolvePlatformPct(customPercentage: number | null | undefined): number {
    return customPercentage ?? DEFAULT_PLATFORM_PCT
}

/** Resolve a partner's per-ticket fixed fee. `0` is valid — again `??`, not `||`. */
export function resolveFixedFee(fixedFeePerTicket: number | null | undefined): number {
    return fixedFeePerTicket ?? DEFAULT_FIXED_FEE
}

/**
 * Canonical platform take for an order, in pesos. Used identically by the
 * checkout UI (to show the customer their total) and by the purchase-intent edge
 * function (to set the Xendit PLATFORM fee), so the two never drift.
 *
 * @param net   Ticket revenue after discounts (clamped to ≥ 0 by the caller).
 * @param pct   Platform commission, e.g. `2` for 2%.
 */
export function computePlatformTake(params: {
    net: number
    quantity: number
    pct: number
    fixedFeePerTicket: number
}): number {
    const { net, quantity, pct, fixedFeePerTicket } = params
    if (net <= 0) return 0
    return Math.round(net * (pct / 100) + fixedFeePerTicket * quantity)
}
