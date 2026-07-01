/**
 * Xendit processing fees (PH MDR) by payment method — the same published rates
 * shown in the event-form pricing disclaimer. Per the HangHut pricing model the
 * PARTNER absorbs this fee (it's deducted from their Xendit sub-wallet at
 * settlement), so it's NOT charged to the customer and NOT part of HangHut's cut.
 *
 * These rates are fixed/published in PH (not negotiated per transaction), so the
 * fee for a sale is deterministic from method + amount — we can compute it at sale
 * time rather than waiting on Xendit's settlement.
 *
 * Keep in sync with the disclaimer in src/components/organizer/event-form.tsx.
 */
export const PROCESSING_FEE_RATES: Record<string, { pct: number; fixed?: number }> = {
    QRPH: { pct: 0.014 },
    GCASH: { pct: 0.023 },
    GRABPAY: { pct: 0.020 },
    SHOPEEPAY: { pct: 0.020 },
    PAYMAYA: { pct: 0.018 },
    MAYA: { pct: 0.018 },
    CARDS: { pct: 0.032, fixed: 10 },
    CARD: { pct: 0.032, fixed: 10 },
    CREDIT_CARD: { pct: 0.032, fixed: 10 },
}

/**
 * Estimated Xendit processing fee for a sale, computed from the resolved payment
 * method and the total amount the customer paid. Returns 0 for FREE / UNKNOWN /
 * unmapped methods (we never guess a rate we don't have).
 */
export function getProcessingFee(method: string | null | undefined, amount: number): number {
    if (!method || !amount || amount <= 0) return 0
    const r = PROCESSING_FEE_RATES[method.toUpperCase()]
    if (!r) return 0
    return Math.round((amount * r.pct + (r.fixed ?? 0)) * 100) / 100
}
