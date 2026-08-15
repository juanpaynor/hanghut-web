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
export const PROCESSING_FEE_RATES: Record<string, { pct: number; fixed?: number; min?: number }> = {
    // Cards — LOCAL rate. Foreign cards are 4.2–4.5%; we can't distinguish them at
    // sale time, so a foreign card is under-estimated here.
    CARDS: { pct: 0.032, fixed: 10 },
    CARD: { pct: 0.032, fixed: 10 },
    CREDIT_CARD: { pct: 0.032, fixed: 10 },

    // eWallets
    GCASH: { pct: 0.023 },
    GRABPAY: { pct: 0.020 },
    SHOPEEPAY: { pct: 0.020 },
    PAYMAYA: { pct: 0.018 },
    MAYA: { pct: 0.018 },

    // Direct debit — "1% or PHP N, whichever is higher".
    BPI: { pct: 0.01, min: 15 },
    BPI_DIRECT_DEBIT: { pct: 0.01, min: 15 },
    METROBANK: { pct: 0.01, min: 15 },
    RCBC: { pct: 0.01, min: 15 },
    RCBC_DIRECT_DEBIT: { pct: 0.01, min: 15 },
    UBP: { pct: 0.01, min: 15 },
    UNIONBANK: { pct: 0.01, min: 15 },
    UBP_DIRECT_DEBIT: { pct: 0.01, min: 15 },
    BDO_EPAY: { pct: 0.01, min: 25 },
    AUTODEBIT_UBP: { pct: 0.01, min: 25 },

    // Over-the-counter
    '7ELEVEN': { pct: 0.015, min: 15 },
    CEBUANA: { pct: 0, fixed: 25 },
    MLHUILLIER: { pct: 0, fixed: 20 },
    PALAWAN: { pct: 0, fixed: 20 },
    USSC: { pct: 0, fixed: 20 },
    LBC: { pct: 0, fixed: 25 },
    ECPAY: { pct: 0.015 },

    // QRPH is absent from the published schedule. Derived from real Xendit charges
    // (xendit_channel_code = 'QRPH', fee status COMPLETED): every settled sale from
    // PHP 1 to PHP 65 was charged a flat PHP 15 base, so a floor applies. We have no
    // settled sample above PHP 1,071 (where 1.4% would exceed the floor), so whether
    // the percentage or the floor dominates at scale is still unverified — the sync
    // records the true fee either way.
    QRPH: { pct: 0.014, min: 15 },
}

/** Xendit adds 12% VAT on top of every published rate. */
export const PROCESSING_FEE_VAT = 0.12

/**
 * Estimated Xendit processing fee for a sale, computed from the resolved payment
 * method and the total amount the customer paid, INCLUDING the 12% VAT Xendit adds.
 * Returns 0 for FREE / UNKNOWN / unmapped methods (we never guess a rate we don't have).
 *
 * This is an ESTIMATE. purchase_intents.xendit_fee holds the real charge once
 * sync-settlements has run; prefer that wherever it is available.
 */
export function getProcessingFee(method: string | null | undefined, amount: number): number {
    if (!method || !amount || amount <= 0) return 0
    const r = PROCESSING_FEE_RATES[method.toUpperCase()]
    if (!r) return 0
    let base = amount * r.pct + (r.fixed ?? 0)
    if (r.min != null && base < r.min) base = r.min
    return Math.round(base * (1 + PROCESSING_FEE_VAT) * 100) / 100
}
